/**
 * LOCAL Supabase only. Deposits through the APPLICATION's visitor engine
 * (lib/memorial/contributions/visitor-contributions.ts with the real
 * Supabase adapters): anti-bot form tokens, RPC service_role, signed upload
 * to Storage with the PUBLIC key (as the browser does), Sharp processing.
 */
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { createVisitorContributionDeps } from "@/lib/memorial/contributions/server-contributions";
import {
  finishContributionPhoto,
  openContributionForm,
  startContributionPhoto,
  submitContributionText,
} from "@/lib/memorial/contributions/visitor-contributions";
import { MEDIA_BUCKET } from "@/config/media";

if (!/^http:\/\/127\.0\.0\.1:/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) throw new Error("refusing: not local");
const deps = createVisitorContributionDeps();
const browser = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function tokens(slug: string, n: number) {
  const list = Array.from({ length: n }, () => {
    const r = openContributionForm(deps, slug);
    if (r.status !== "ready") throw new Error(`form: ${r.status}`);
    return r.formToken;
  });
  await wait(3500); // Q3: a form token is honoured after 3 s
  return list;
}

async function photo(slug: string, token: string, author: string, caption: string, hue: number, w: number, h: number) {
  const bytes = await sharp({ create: { width: w, height: h, channels: 3, background: { r: 120 + hue, g: 140, b: 110 } } })
    .composite([{ input: Buffer.from(`<svg width="${w}" height="${h}"><circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 3}" fill="#f3e7d5"/><text x="50%" y="55%" font-size="${Math.round(h / 8)}" text-anchor="middle" fill="#5f5a4d">${caption}</text></svg>`) }])
    .jpeg()
    .toBuffer();
  const begun = await startContributionPhoto(deps, { slug, declaredMimeType: "image/jpeg", formToken: token });
  if (begun.status !== "ready") throw new Error(`photo start: ${begun.status}`);
  const path = decodeURIComponent(new URL(begun.uploadUrl).pathname.split(`/${MEDIA_BUCKET}/`)[1]);
  const { error } = await browser.storage.from(MEDIA_BUCKET).uploadToSignedUrl(path, begun.uploadToken, new Blob([bytes], { type: "image/jpeg" }), { contentType: "image/jpeg" });
  if (error) throw error;
  return finishContributionPhoto(deps, { slug, mediaId: begun.mediaId, photoTicket: begun.photoTicket, authorName: author, caption, formToken: token });
}

async function main() {
  const A = "a1b2c3d4e5f6";
  const B = "b6e5d4c3b2a1";
  const out: string[] = [];
  const t = await tokens(A, 32);
  const condolences = [
    ["Marie-Claire Dubois", "Toutes nos pensées vous accompagnent. Jeanne était une femme d’une grande douceur."],
    ["Famille Lefèvre", "Avec toute notre affection,\nnous pensons fort à vous."],
    ["Paul <b>Durand</b>", "Un texte avec <script>alert(1)</script> qui doit rester du texte."],
  ];
  for (const [name, text] of condolences) out.push(`condolence ${(await submitContributionText(deps, { slug: A, type: "condolence", authorName: name, text, formToken: t.pop() })).status}`);
  for (let i = 1; i <= 24; i++) {
    out.push(`story ${(await submitContributionText(deps, { slug: A, type: "testimonial", authorName: `Proche n°${i}`, text: `Souvenir n°${i} : l’été à Biarritz, les rires sur la terrasse et la tarte aux pommes du dimanche.`, formToken: t.pop() })).status}`);
  }
  out.push(`photo ${(await photo(A, t.pop()!, "Lucie, sa petite-fille", "Été 1998 à Biarritz", 0, 1600, 1200)).status}`);
  out.push(`photo ${(await photo(A, t.pop()!, "Thomas", "Noël en famille", 40, 900, 1200)).status}`);
  const tb = await tokens(B, 2);
  out.push(`B story ${(await submitContributionText(deps, { slug: B, type: "testimonial", authorName: "Voisin de Louis", text: "Un souvenir de la famille Durand.", formToken: tb.pop() })).status}`);
  out.push(`B photo ${(await photo(B, tb.pop()!, "Anne", "Louis au jardin", 80, 1200, 900)).status}`);
  console.log(out.join("\n"));
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
