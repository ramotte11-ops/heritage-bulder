import { describe, expect, it, vi } from "vitest";
import { uploadInChunks, UPLOAD_CHUNK_ALIGNMENT } from "./direct-upload";

/**
 * VID-07 — envoi direct reprenable, contre un faux point d'envoi qui suit le
 * protocole (308 + Range, 200 final, 404 expiré). Aucun réseau réel, aucun
 * compte Mux : ce n'est pas une validation sur Mux.
 */

const K = UPLOAD_CHUNK_ALIGNMENT;

/** Faux point d'envoi : mémorise les octets reçus et répond comme un envoi reprenable. */
function fakeEndpoint(options: { failOnCall?: Set<number>; expireOnCall?: number; acceptPartial?: number } = {}) {
  let received = 0;
  let calls = 0;
  const bodies: string[] = [];
  const fetch = vi.fn(async (_url: string, init: RequestInit) => {
    calls += 1;
    if (options.expireOnCall === calls) return new Response(null, { status: 404 });
    if (options.failOnCall?.has(calls)) throw new TypeError("network down");
    const range = (init.headers as Record<string, string>)["content-range"] ?? "";
    const total = Number(range.split("/")[1]);
    if (range.startsWith("bytes */")) {
      return received >= total ? new Response(null, { status: 200 }) : new Response(null, { status: 308, headers: received > 0 ? { range: `bytes=0-${received - 1}` } : {} });
    }
    const [start, end] = range.replace("bytes ", "").split("/")[0]!.split("-").map(Number) as [number, number];
    if (start !== received) return new Response(null, { status: 400 });
    // Un point d'envoi peut ne conserver qu'une partie du morceau.
    const kept = options.acceptPartial !== undefined ? Math.min(end + 1, start + options.acceptPartial) : end + 1;
    bodies.push(`${start}-${kept - 1}`);
    received = kept;
    if (received >= total) return new Response(null, { status: 201 });
    return new Response(null, { status: 308, headers: { range: `bytes=0-${received - 1}` } });
  });
  return { fetch, received: () => received, bodies };
}

const file = (bytes: number) => new Blob([new Uint8Array(bytes)]);

describe("VID-07 — envoi direct par morceaux", () => {
  it("fichier volumineux : morceaux alignés sur 256 Kio, progression croissante, terminé à 100 %", async () => {
    const endpoint = fakeEndpoint();
    const progress: number[] = [];
    const result = await uploadInChunks({ url: "https://upload.example/u", file: file(5 * K + 123), fetch: endpoint.fetch, chunkBytes: 2 * K + 7, onProgress: (r) => progress.push(r) });
    expect(result).toEqual({ status: "done" });
    expect(endpoint.bodies).toEqual([`0-${2 * K - 1}`, `${2 * K}-${4 * K - 1}`, `${4 * K}-${5 * K + 122}`]);
    expect(progress).toEqual([2 * K, 4 * K, 5 * K + 123]);
  });

  it("coupure réseau : nouvelle tentative espacée, reprise là où l'hébergeur en est, sans renvoyer ce qui est arrivé", async () => {
    const endpoint = fakeEndpoint({ failOnCall: new Set([2]) });
    const wait = vi.fn(async () => {});
    await expect(uploadInChunks({ url: "u", file: file(3 * K), fetch: endpoint.fetch, chunkBytes: K, wait })).resolves.toEqual({ status: "done" });
    expect(wait).toHaveBeenCalledWith(1000);
    expect(endpoint.bodies).toEqual([`0-${K - 1}`, `${K}-${2 * K - 1}`, `${2 * K}-${3 * K - 1}`]);
  });

  it("l'hébergeur ne garde qu'une partie d'un morceau : la reprise suit son en-tête Range", async () => {
    const endpoint = fakeEndpoint({ acceptPartial: K / 2 });
    await expect(uploadInChunks({ url: "u", file: file(2 * K), fetch: endpoint.fetch, chunkBytes: K })).resolves.toEqual({ status: "done" });
    expect(endpoint.bodies[1]).toBe(`${K / 2}-${K - 1}`);
    expect(endpoint.received()).toBe(2 * K);
  });

  it("trop d'échecs : arrêt (failed) après le nombre de tentatives prévu", async () => {
    const fetch = vi.fn(async () => { throw new TypeError("offline"); });
    await expect(uploadInChunks({ url: "u", file: file(K), fetch, maxRetries: 2, wait: async () => {} })).resolves.toEqual({ status: "failed" });
  });

  it("adresse expirée : expired (une nouvelle adresse doit être demandée)", async () => {
    const endpoint = fakeEndpoint({ expireOnCall: 2 });
    await expect(uploadInChunks({ url: "u", file: file(3 * K), fetch: endpoint.fetch, chunkBytes: K })).resolves.toEqual({ status: "expired" });
  });

  it("annulation par la famille : aborted, plus aucun envoi", async () => {
    const controller = new AbortController();
    const endpoint = fakeEndpoint();
    const result = await uploadInChunks({
      url: "u",
      file: file(4 * K),
      fetch: endpoint.fetch,
      chunkBytes: K,
      signal: controller.signal,
      onProgress: (r) => { if (r >= K) controller.abort(); },
    });
    expect(result).toEqual({ status: "aborted" });
    expect(endpoint.bodies).toHaveLength(1);
  });

  it("refus définitif (403) : failed, sans nouvelle tentative", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 403 }));
    await expect(uploadInChunks({ url: "u", file: file(K), fetch })).resolves.toEqual({ status: "failed" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
