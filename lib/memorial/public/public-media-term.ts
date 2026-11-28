import type { SupabaseClient } from "@supabase/supabase-js";
import { MEDIA_READ_URL_TTL_SECONDS } from "@/config/media";

/** Server-side recheck. Null means visible without a premium term. */
export async function readPublicMediaTerm(
  client: Pick<SupabaseClient, "rpc">,
  slug: string,
): Promise<number | null | undefined> {
  const { data, error } = await client.rpc("read_public_media_term_v1", { p_slug: slug });
  if (error || !Array.isArray(data) || data.length !== 1) return undefined;
  const until: unknown = data[0]?.complete_until;
  if (until === null) return null;
  const deadline = typeof until === "string" ? Date.parse(until) : NaN;
  return Number.isFinite(deadline) ? deadline : undefined;
}

export async function signPublicStorageRead(input: {
  client: Pick<SupabaseClient, "rpc">;
  slug: string;
  sign: (ttl?: number) => Promise<string | null>;
  now?: () => number;
}): Promise<string | null> {
  const deadline = await readPublicMediaTerm(input.client, input.slug);
  if (deadline === undefined) return null;
  if (deadline === null) return input.sign();

  const now = input.now ?? Date.now;
  const ttl = Math.min(MEDIA_READ_URL_TTL_SECONDS, Math.floor((deadline - now()) / 1000));
  if (ttl <= 0) return null;

  const url = await input.sign(ttl);
  if (url === null) return null;
  // Storage computes a relative TTL on its own clock. Only return its URL if
  // the token it issued actually expires within the contract.
  try {
    const token = new URL(url).searchParams.get("token")?.split(".");
    if (token?.length !== 3) return null;
    const { exp } = JSON.parse(Buffer.from(token[1], "base64url").toString("utf8"));
    return Number.isSafeInteger(exp) && exp <= Math.floor(deadline / 1000) && exp * 1000 > now() ? url : null;
  } catch {
    return null;
  }
}
