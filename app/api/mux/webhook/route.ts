import { NextResponse } from "next/server";
import { videoNotificationRuntime } from "@/lib/memorial/video/hosting/hosting-runtime";
import { parseMuxEvent, verifyMuxSignature } from "@/lib/memorial/video/hosting/mux-webhook";

/**
 * VID-07 — point de notification Mux (POST /api/mux/webhook).
 *
 * NON ACTIVÉ : sans configuration, la route répond 503 sans rien lire.
 * VID-11 : active quand l'hébergement est activé pour les familles, ou, avant
 * cela, quand `HERITAGE_VIDEO_NOTIFICATIONS=enabled` (vérification des
 * notifications signées sans ouvrir A16 ni la page publique).
 *
 *  - Corps BRUT lu une fois, limité à 1 Mo, puis signature vérifiée
 *    (HMAC-SHA256, 5 minutes) AVANT toute interprétation : une requête non
 *    signée ou mal signée reçoit 401, sans détail.
 *  - Événement retenu → base (idempotente : un événement rejoué renvoie
 *    `duplicate`), puis nettoyage chez Mux de ce que la base désigne.
 *  - Réponse 200 pour tout événement authentique, même ignoré, pour que Mux
 *    ne le renvoie pas indéfiniment ; 500 seulement si la base est
 *    indisponible (Mux réessaiera).
 *  - Aucune donnée, aucun secret, aucun identifiant n'est renvoyé.
 */
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1_000_000;

export async function POST(request: Request): Promise<Response> {
  const runtime = videoNotificationRuntime();
  if (runtime === null) return NextResponse.json({ ok: false }, { status: 503 });

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return NextResponse.json({ ok: false }, { status: 413 });
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) return NextResponse.json({ ok: false }, { status: 413 });

  const check = verifyMuxSignature({
    rawBody,
    header: request.headers.get("mux-signature"),
    secret: runtime.config.webhookSecret,
    nowSeconds: Math.floor(Date.now() / 1000),
  });
  if (!check.ok) return NextResponse.json({ ok: false }, { status: 401 });

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true }, { status: 200 });
  }
  const event = parseMuxEvent(body);
  if (event === null) return NextResponse.json({ ok: true }, { status: 200 });

  try {
    await runtime.service.handleEvent(event);
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}
