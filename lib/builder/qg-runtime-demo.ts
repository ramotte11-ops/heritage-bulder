import type { EditorialContext } from "@/config/memorial";
import type { Language } from "@/config/languages";
import type { Skin, SkinVariant } from "@/config/skins";
import type { MemorialContent } from "@/types/memorial";
import type { Media } from "@/types/media";
import type { HeroDate } from "@/types/hero";
import {
  commitPageA,
  commitPageB,
  commitPageC,
  commitPageD,
  commitPageE,
  writeBirth,
  writeDeath,
  writeDisplayName,
  writeHeroCrop,
  writeHeroPhotoMedia,
  writeShortPhrase,
} from "@/lib/builder/guided-flow/hero-step";
import {
  commitA01,
  commitA02,
  writeAnnouncementText,
  writePrecision,
} from "@/lib/builder/guided-flow/death-notice-step";
import type { DeathNoticePrecisionField } from "@/lib/memorial/death-notice";
import {
  writeLegacyFieldText,
  writeLovedThingsFieldText,
  writePersonWordsFieldText,
} from "@/lib/builder/guided-flow/person-sheet-step";

/**
 * QG Runtime Demo (mini-mission before Mission 040) — deterministic,
 * in-memory fixture data for `app/builder/demo/page.tsx`.
 *
 * This module builds its starting `MemorialContent` by calling the SAME
 * pure Guided Flow functions the real Builder route
 * (`app/builder/[memorialId]/page.tsx`) calls — `writeDisplayName`,
 * `commitPageA`, `writeHeroPhotoMedia`, `commitPageC`, etc. — never by
 * hand-constructing the internal `content.guidedFlow`/`content.hero`
 * shape itself. That is deliberate: those shapes are documented
 * elsewhere (hero-step.ts, death-notice-step.ts) as owned exclusively by
 * their own small, defensive helpers, and this demo has no license to
 * assume a shape those files did not export. If a future mission changes
 * that internal representation, this fixture keeps working unchanged —
 * exactly the same guarantee every other caller of these functions gets.
 *
 * ## Why the Hero photo (T06/T07) is pre-completed rather than walked
 * through interactively
 *
 * `HeroPhotoStep` (PAGE C) uploads real bytes to real Supabase Storage
 * via a signed URL (`getBrowserSupabaseClient().storage...uploadToSignedUrl`)
 * — there is no seam to fake that without either standing up Supabase
 * (forbidden by this mission) or monkey-patching the Supabase browser
 * client (a second, parallel "fake Storage" system this mission also
 * forbids: "ne pas créer un second système de données concurrent").
 *
 * `commitPageC`/`commitPageD` are, however, pure and I/O-free: they only
 * need a `Media` value shaped like a real ready hero upload —
 * `isHeroPhotoMediaUsable` (lib/memorial/hero.ts) checks nothing beyond
 * `id`/`purpose`/`status`. `DEMO_HERO_MEDIA` below is exactly that: a
 * well-formed, deterministic fixture `Media`, never written to or read
 * from any real `media` row. Composing it through the real
 * `writeHeroPhotoMedia`/`commitPageC`/`writeHeroCrop`/`commitPageD`
 * functions means T06/T07 reach "genuinely completed" by the exact same
 * rules a real memorial would have to satisfy — not by a shortcut that
 * bypasses `isHeroPhotoMediaUsable`.
 *
 * PAGE E (T08, `HeroRevealStep`) needs no Storage call at all — it only
 * renders `photo.readUrl` in an `<img>` — so it is left for the QG to
 * actually walk through, Light/Dark toggle included, real component,
 * real gate (`needsPageE`), real `commitPageE`.
 */

export const QG_RUNTIME_DEMO_LANGUAGE: Language = "fr";
export const QG_RUNTIME_DEMO_EDITORIAL_CONTEXT: EditorialContext = "announcement";
export const QG_RUNTIME_DEMO_SKIN: Skin = "intemporel";

/** Fixture-only ids — deliberately not UUID-shaped, so they can never be
 * mistaken for a real owner/memorial/media row (mirrors the doctrine
 * already documented in lib/builder/demo-memorials.ts). */
const QG_RUNTIME_DEMO_MEMORIAL_ID = "qg-runtime-demo-memorial";
const QG_RUNTIME_DEMO_OWNER_ID = "qg-runtime-demo-owner";
const QG_RUNTIME_DEMO_MEDIA_ID = "qg-runtime-demo-hero-media";

// Fixed, arbitrary timestamp — this is fixture data, not a real event.
const QG_RUNTIME_DEMO_TIMESTAMP = "2026-01-01T00:00:00.000Z";

/**
 * A small, deterministic inline SVG portrait placeholder — never a file
 * under `public/assets/**`/`assets/**` (those are Studio-rendered
 * assets this mission must not touch), and never a network fetch. Used
 * as `photo.readUrl` exactly where a real signed Storage URL would go;
 * `HeroIntemporel`/`HeroRevealStep` only ever render it in an
 * `<img src>`, so a `data:` URI is indistinguishable to them from a real
 * short-lived signed URL.
 */
export const QG_RUNTIME_DEMO_PHOTO_DATA_URL =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="800" viewBox="0 0 640 800">
      <rect width="640" height="800" fill="#3a3630"/>
      <circle cx="320" cy="300" r="140" fill="#c9bfae"/>
      <path d="M120 760c0-140 90-230 200-230s200 90 200 230z" fill="#c9bfae"/>
    </svg>`,
  );

/** The one fixture `Media` this whole demo ever references — see this
 * module's own top docstring for why it exists and what it is not. */
export const QG_RUNTIME_DEMO_MEDIA: Media = {
  id: QG_RUNTIME_DEMO_MEDIA_ID,
  memorialId: QG_RUNTIME_DEMO_MEMORIAL_ID,
  ownerId: QG_RUNTIME_DEMO_OWNER_ID,
  storagePath: `${QG_RUNTIME_DEMO_MEMORIAL_ID}/${QG_RUNTIME_DEMO_MEDIA_ID}/original.svg`,
  mediaType: "photo",
  purpose: "hero",
  status: "ready",
  mimeType: "image/svg+xml",
  originalFilename: null,
  sizeBytes: 4096,
  width: 640,
  height: 800,
  createdAt: QG_RUNTIME_DEMO_TIMESTAMP,
  updatedAt: QG_RUNTIME_DEMO_TIMESTAMP,
};

export const QG_RUNTIME_DEMO_PHOTO = {
  media: QG_RUNTIME_DEMO_MEDIA,
  readUrl: QG_RUNTIME_DEMO_PHOTO_DATA_URL,
};

/** A neutral crop — `HERO_CROP_NEUTRAL_ZOOM`'s own documented "no zoom
 * applied" state (types/hero.ts), exactly what a family that accepted
 * the default framing without touching it would end up with. */
const QG_RUNTIME_DEMO_CROP = { focalX: 0.5, focalY: 0.38, zoom: 1 };

export interface QgRuntimeDemoHeroInput {
  displayName: string;
  birth?: HeroDate | null;
  death?: HeroDate | null;
  shortPhrase?: string | null;
}

/**
 * Builds a fresh demo `MemorialContent` with the Hero's identity, dates
 * and phrase pre-FILLED (never pre-COMMITTED) and the photo/crop
 * genuinely completed (T06/T07 only), through the real Guided Flow
 * write/commit functions listed in this module's own docstring.
 *
 * PAGE A/PAGE B are deliberately left un-committed on purpose (no
 * `commitPageA`/`commitPageB` call here): `needsPageA`/`needsPageB` on
 * the returned content are still `true`, so the QG Runtime Demo page
 * lands on the REAL, interactive `HeroIdentityStep`/`HeroPhraseStep`
 * screens first, pre-filled with this scenario's name/dates — exactly
 * what lets a reviewer see and edit "nom normal"/"nom long"/dates on the
 * real screen rather than a scenario that silently skips straight past
 * it. T06/T07 (the photo) are the one pair that MUST be pre-completed —
 * see this module's own top docstring for why `HeroPhotoStep` itself
 * cannot be walked through here — and `commitPageC`/`commitPageD`
 * neither read nor require T04/T05's own `StepRecord`, so completing
 * them first is safe and does not shortcut PAGE A/PAGE B's own gates.
 *
 * Throws only if one of these real functions refuses the fixture data
 * itself (a bug in this fixture, not something a QG reviewer can
 * trigger) — every value this function feeds them is fixed and
 * known-valid.
 */
export function buildQgRuntimeDemoContent(input: QgRuntimeDemoHeroInput): MemorialContent {
  let content: MemorialContent = {};

  const displayNameWrite = writeDisplayName(content, input.displayName);
  if (!displayNameWrite.ok) throw new Error("QG runtime demo fixture: displayName write refused");
  content = displayNameWrite.content;

  if (input.birth !== undefined) {
    const birthWrite = writeBirth(content, input.birth);
    if (!birthWrite.ok) throw new Error("QG runtime demo fixture: birth write refused");
    content = birthWrite.content;
  }

  if (input.death !== undefined) {
    const deathWrite = writeDeath(content, input.death);
    if (!deathWrite.ok) throw new Error("QG runtime demo fixture: death write refused");
    content = deathWrite.content;
  }

  if (input.shortPhrase !== undefined) {
    const phraseWrite = writeShortPhrase(content, input.shortPhrase);
    if (!phraseWrite.ok) throw new Error("QG runtime demo fixture: shortPhrase write refused");
    content = phraseWrite.content;
  }

  const photoWrite = writeHeroPhotoMedia(content, QG_RUNTIME_DEMO_MEDIA.id);
  if (!photoWrite.ok) throw new Error("QG runtime demo fixture: photo write refused");
  content = photoWrite.content;

  const pageCCommit = commitPageC(content, QG_RUNTIME_DEMO_MEDIA);
  if (!pageCCommit.ok) throw new Error("QG runtime demo fixture: commitPageC refused");
  content = pageCCommit.content;

  const cropWrite = writeHeroCrop(content, QG_RUNTIME_DEMO_CROP);
  if (!cropWrite.ok) throw new Error("QG runtime demo fixture: crop write refused");
  content = cropWrite.content;

  const pageDCommit = commitPageD(content, QG_RUNTIME_DEMO_MEDIA);
  if (!pageDCommit.ok) throw new Error("QG runtime demo fixture: commitPageD refused");
  content = pageDCommit.content;

  return content;
}

/** A normal-length display name — the default scenario. */
export const QG_RUNTIME_DEMO_NAME_NORMAL = "Éléonore Vasseur";

/** A deliberately long display name, to test wrapping/overflow across
 * Hero, A01 and the A03 Intemporel renderer (mission requirement: "nom
 * long"). */
export const QG_RUNTIME_DEMO_NAME_LONG =
  "Marie-Charlotte de La Fontaine-Delacroix-Beaumont du Plessis-Grandchamp";

export const QG_RUNTIME_DEMO_BIRTH: HeroDate = { precision: "year", year: 1938 };
export const QG_RUNTIME_DEMO_DEATH: HeroDate = { precision: "date", date: "2026-02-14" };

export const QG_RUNTIME_DEMO_ANNOUNCEMENT_TEXT =
  "C'est avec une immense tristesse que nous annonçons le décès d'Éléonore, entourée de l'affection des siens.";

export const QG_RUNTIME_DEMO_PRECISIONS: Record<DeathNoticePrecisionField, string> = {
  generalLocation: "Dans la région de Bordeaux.",
  familyMessage: "La famille remercie chaleureusement tous ceux qui l'ont accompagnée.",
  thought: "Une pensée pour tous ceux qui l'ont connue et aimée.",
  quote: "« Ce que l'on a fait avec amour dure toujours. »",
  other: "Un registre de condoléances sera ouvert prochainement.",
};

/** Applies A01's announcement text through the real `writeAnnouncementText`
 * write function — never by hand-shaping `content.deathNotice`. */
export function applyQgRuntimeDemoAnnouncement(
  content: MemorialContent,
  announcementText: string | null,
): MemorialContent {
  const write = writeAnnouncementText(content, announcementText);
  if (!write.ok) throw new Error("QG runtime demo fixture: announcementText write refused");
  return write.content;
}

/** Applies all five A02 precisions through the real `writePrecision`
 * write function, one field at a time. */
export function applyQgRuntimeDemoPrecisions(
  content: MemorialContent,
  precisions: Partial<Record<DeathNoticePrecisionField, string | null>>,
): MemorialContent {
  let next = content;
  for (const [field, value] of Object.entries(precisions) as [
    DeathNoticePrecisionField,
    string | null,
  ][]) {
    const write = writePrecision(next, field, value);
    if (!write.ok) throw new Error(`QG runtime demo fixture: precision "${field}" write refused`);
    next = write.content;
  }
  return next;
}

export const QG_RUNTIME_DEMO_DEFAULT_SKIN_VARIANT: SkinVariant = "light";

/**
 * "Aller directement à A03" — the control panel's fast-forward button.
 * Builds a Hero (T03/T06/T07 via `buildQgRuntimeDemoContent`, still
 * un-committed on T04/T05 exactly like the interactive start screen),
 * then explicitly commits PAGE A, PAGE B, T08 and both A01/A02 through
 * the same real `commitPageA`/`commitPageB`/`commitPageE`/`commitA01`/
 * `commitA02` functions the interactive screens themselves call, landing
 * on a content for which `needsA03` is true and every earlier gate is
 * already satisfied — so the QG Runtime Demo page renders straight to
 * `DeathNoticePreviewStep` without requiring the reviewer to click
 * through every earlier screen first. Never a shortcut around those
 * functions' own validation: each one still refuses exactly what it
 * would refuse for a real memorial (a bug in this fixture, not something
 * a QG reviewer can trigger, would throw here for the same reason
 * `buildQgRuntimeDemoContent` does).
 */
/**
 * "Récit de vie" (StoryIntemporel) demo fixtures — the QG Runtime Demo's
 * own visual-validation panel for this renderer (mission requirement:
 * reuse the existing demo rather than a second showcase). Fixture texts
 * only, deliberately fictional, never real family content. Applied
 * through the real `writePersonWordsFieldText`/`writeLovedThingsFieldText`/
 * `writeLegacyFieldText` functions (`lib/builder/guided-flow/person-sheet-step.ts`)
 * — never by hand-shaping `content.personWords`/`lovedThings`/`legacy`,
 * same discipline as every other fixture in this module.
 */
export const QG_RUNTIME_DEMO_STORY_A10_TEXT =
  "Elle était douce, attentive et toujours à l'écoute. Elle avait un grand cœur, une présence rassurante et une manière unique de faire se sentir chacun important.";
export const QG_RUNTIME_DEMO_STORY_A11_TEXT =
  "Elle aimait les livres, la nature, les longues promenades en bord de mer et les repas partagés en famille.";
export const QG_RUNTIME_DEMO_STORY_A12_TEXT =
  "Elle nous laisse des valeurs précieuses : la générosité, le respect des autres et la capacité de voir le beau dans chaque jour.";

/** A deliberately long single matière, to test the package's own
 * "375px, texte long" QA scenario — real runtime text, no line limit. */
export const QG_RUNTIME_DEMO_STORY_A10_LONG_TEXT =
  "Elle avait une présence rassurante et une grande capacité d'écoute. Toujours disponible pour sa famille et ses amis, elle savait trouver les mots justes et apporter du réconfort dans les moments difficiles. Elle faisait preuve d'une générosité naturelle, d'une attention sincère aux autres et d'une grande curiosité pour tout ce qui l'entourait. Aujourd'hui encore, nous gardons en mémoire son sourire, sa force tranquille et tout ce qu'elle nous a transmis.";

export const QG_RUNTIME_DEMO_STORY_COMBINATIONS = [
  "A10",
  "A11",
  "A12",
  "A10+A11",
  "A10+A12",
  "A11+A12",
  "A10+A11+A12",
  "A10-long",
] as const;
export type QgRuntimeDemoStoryCombination = (typeof QG_RUNTIME_DEMO_STORY_COMBINATIONS)[number];

/** Builds a fresh, minimal `MemorialContent` carrying only whichever
 * Récit de vie matières `combination` names — through the real
 * `write*FieldText` functions, so `StoryIntemporel` receives content
 * exactly as the real combined Builder sheet (Mission 044) would have
 * produced it. */
export function buildQgRuntimeDemoStoryContent(combination: QgRuntimeDemoStoryCombination): MemorialContent {
  let content: MemorialContent = {};

  const wantsA10 = combination === "A10" || combination === "A10+A11" || combination === "A10+A12" || combination === "A10+A11+A12";
  const wantsA10Long = combination === "A10-long";
  const wantsA11 = combination === "A11" || combination === "A10+A11" || combination === "A11+A12" || combination === "A10+A11+A12";
  const wantsA12 = combination === "A12" || combination === "A10+A12" || combination === "A11+A12" || combination === "A10+A11+A12";

  if (wantsA10 || wantsA10Long) {
    const write = writePersonWordsFieldText(content, wantsA10Long ? QG_RUNTIME_DEMO_STORY_A10_LONG_TEXT : QG_RUNTIME_DEMO_STORY_A10_TEXT);
    if (!write.ok) throw new Error("QG runtime demo fixture: personWords write refused");
    content = write.content;
  }
  if (wantsA11) {
    const write = writeLovedThingsFieldText(content, QG_RUNTIME_DEMO_STORY_A11_TEXT);
    if (!write.ok) throw new Error("QG runtime demo fixture: lovedThings write refused");
    content = write.content;
  }
  if (wantsA12) {
    const write = writeLegacyFieldText(content, QG_RUNTIME_DEMO_STORY_A12_TEXT);
    if (!write.ok) throw new Error("QG runtime demo fixture: legacy write refused");
    content = write.content;
  }

  return content;
}

export function buildQgRuntimeDemoContentThroughA03(input: QgRuntimeDemoHeroInput): MemorialContent {
  let content = buildQgRuntimeDemoContent(input);

  const pageACommit = commitPageA(content);
  if (!pageACommit.ok) throw new Error("QG runtime demo fixture: commitPageA refused");
  content = pageACommit.content;

  const pageBCommit = commitPageB(content);
  if (!pageBCommit.ok) throw new Error("QG runtime demo fixture: commitPageB refused");
  content = pageBCommit.content;

  const pageECommit = commitPageE(content, QG_RUNTIME_DEMO_MEDIA);
  if (!pageECommit.ok) throw new Error("QG runtime demo fixture: commitPageE refused");
  content = pageECommit.content;

  content = applyQgRuntimeDemoAnnouncement(content, QG_RUNTIME_DEMO_ANNOUNCEMENT_TEXT);
  const a01Commit = commitA01(content);
  if (!a01Commit.ok) throw new Error("QG runtime demo fixture: commitA01 refused");
  content = a01Commit.content;

  content = applyQgRuntimeDemoPrecisions(content, QG_RUNTIME_DEMO_PRECISIONS);
  const a02Commit = commitA02(content);
  if (!a02Commit.ok) throw new Error("QG runtime demo fixture: commitA02 refused");
  content = a02Commit.content;

  return content;
}
