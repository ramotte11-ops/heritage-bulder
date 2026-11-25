/**
 * VID-07 — envoi DIRECT d'un fichier du navigateur vers l'adresse fournie par
 * l'hébergeur (Mux), sans transiter par un serveur HERITAGE ni par une
 * fonction Netlify. Code navigateur, sans dépendance ni secret : l'adresse
 * est à usage unique et limitée dans le temps.
 *
 * Protocole d'envoi reprenable (documentation Mux « Upload files directly » :
 * l'adresse accepte des morceaux `PUT` avec `Content-Range`, en multiples de
 * 256 Kio, et se reprend) :
 *  - réponse 308 : morceau reçu, l'en-tête `Range: bytes=0-N` indique ce qui
 *    est conservé ; l'envoi reprend à N + 1 ;
 *  - réponse 200 ou 201 : fichier complet reçu ;
 *  - 404 ou 410 : l'adresse a expiré (il faut en demander une nouvelle) ;
 *  - erreur réseau ou 5xx : nouvelle tentative espacée (1 s, 2 s, 4 s…),
 *    précédée d'une question « où en est-on ? » (un `PUT` vide dont l'en-tête
 *    Content-Range vaut « bytes, étoile, barre oblique, taille »),
 *    pour ne jamais renvoyer ce qui est déjà arrivé ;
 *  - annulation : `AbortSignal`.
 */

export const UPLOAD_CHUNK_ALIGNMENT = 256 * 1024;
export const DEFAULT_UPLOAD_CHUNK_BYTES = 32 * UPLOAD_CHUNK_ALIGNMENT; // 8 Mio

export type DirectUploadResult = { status: "done" } | { status: "aborted" } | { status: "expired" } | { status: "failed" };

export interface DirectUploadOptions {
  url: string;
  file: Blob;
  fetch?: (input: string, init: RequestInit) => Promise<Response>;
  chunkBytes?: number;
  maxRetries?: number;
  signal?: AbortSignal;
  /** Octets reçus par l'hébergeur, de 0 à la taille du fichier. */
  onProgress?: (receivedBytes: number, totalBytes: number) => void;
  wait?: (ms: number) => Promise<void>;
}

function receivedFromRange(response: Response): number | null {
  const range = response.headers.get("range");
  const match = range === null ? null : /bytes=0-(\d+)/.exec(range);
  return match === null ? null : Number(match[1]) + 1;
}

const isAbort = (error: unknown) => typeof error === "object" && error !== null && (error as { name?: string }).name === "AbortError";

export async function uploadInChunks(options: DirectUploadOptions): Promise<DirectUploadResult> {
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init));
  const wait = options.wait ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const total = options.file.size;
  const requested = Math.max(UPLOAD_CHUNK_ALIGNMENT, options.chunkBytes ?? DEFAULT_UPLOAD_CHUNK_BYTES);
  const chunk = requested - (requested % UPLOAD_CHUNK_ALIGNMENT);
  const maxRetries = options.maxRetries ?? 5;
  let offset = 0;
  let failures = 0;

  async function askOffset(): Promise<number | "done" | "expired" | null> {
    const response = await doFetch(options.url, { method: "PUT", headers: { "content-range": `bytes */${total}` }, signal: options.signal });
    if (response.status === 200 || response.status === 201) return "done";
    if (response.status === 404 || response.status === 410) return "expired";
    if (response.status === 308) return receivedFromRange(response) ?? 0;
    return null;
  }

  while (offset < total || total === 0) {
    if (options.signal?.aborted) return { status: "aborted" };
    const end = Math.min(offset + chunk, total);
    try {
      const response = await doFetch(options.url, {
        method: "PUT",
        headers: total === 0 ? {} : { "content-range": `bytes ${offset}-${end - 1}/${total}` },
        body: options.file.slice(offset, end),
        signal: options.signal,
      });
      if (response.status === 200 || response.status === 201) {
        options.onProgress?.(total, total);
        return { status: "done" };
      }
      if (response.status === 404 || response.status === 410) return { status: "expired" };
      if (response.status === 308) {
        offset = receivedFromRange(response) ?? end;
        failures = 0;
        options.onProgress?.(offset, total);
        continue;
      }
      if (response.status < 500 && response.status !== 429) return { status: "failed" };
      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      if (isAbort(error) || options.signal?.aborted) return { status: "aborted" };
      failures += 1;
      if (failures > maxRetries) return { status: "failed" };
      await wait(1000 * 2 ** (failures - 1));
      if (options.signal?.aborted) return { status: "aborted" };
      try {
        const known = await askOffset();
        if (known === "done") {
          options.onProgress?.(total, total);
          return { status: "done" };
        }
        if (known === "expired") return { status: "expired" };
        if (known !== null) {
          offset = known;
          options.onProgress?.(offset, total);
        }
      } catch (inner) {
        if (isAbort(inner) || options.signal?.aborted) return { status: "aborted" };
        // La question elle-même a échoué : on retentera le même morceau.
      }
    }
  }
  return { status: "done" };
}
