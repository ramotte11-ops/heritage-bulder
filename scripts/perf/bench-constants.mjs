// Mission 04-G / L1.4 — constantes partagées du banc de mesure local.
// Identifiants de TEST uniquement : ils n'existent que dans le faux Supabase.

export const IDS = {
  user: "11111111-1111-4111-8111-111111111111",
  owner: "22222222-2222-4222-8222-222222222222",
  memorial: "33333333-3333-4333-8333-333333333333",
  entitlement: "44444444-4444-4444-8444-444444444444",
};

export const STUB_PORT = Number(process.env.PERF_STUB_PORT ?? 54399);
export const STUB_URL = `http://127.0.0.1:${STUB_PORT}`;
export const APP_PORT = Number(process.env.PERF_APP_PORT ?? 3100);
export const APP_URL = `http://localhost:${APP_PORT}`;

/** The Supabase SSR session cookie for the stub's project ("127" from 127.0.0.1). */
export function sessionCookie() {
  const session = {
    access_token: "bench.access.token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: "bench-refresh",
    user: { id: IDS.user, aud: "authenticated", email: "famille@example.test", app_metadata: {}, user_metadata: {} },
  };
  return {
    name: "sb-127-auth-token",
    value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"),
    domain: "localhost",
    path: "/",
  };
}
