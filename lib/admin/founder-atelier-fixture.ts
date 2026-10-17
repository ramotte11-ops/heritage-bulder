import "server-only";

import type { MemorialContent } from "@/types/memorial";
import type { MediaResolver } from "@/lib/memorial/assembly/media-resolver";
import { fullAnnouncementWithTraditions, FIXTURE_HERO_MEDIA_ID } from "@/lib/memorial/assembly/test-fixtures";
import {
  QG_RUNTIME_DEMO_BIRTH,
  QG_RUNTIME_DEMO_DEATH,
  QG_RUNTIME_DEMO_PHOTO_DATA_URL,
} from "@/lib/builder/qg-runtime-demo";
import { readHero, setHeroBirth, setHeroDeath, setHeroShortPhrase, updateHero } from "@/lib/memorial/hero";
import { CEREMONY_V2_PILOT_CASES } from "@/components/memorial/ceremony/v2/pilot-fixtures";
import { writeCeremony } from "@/lib/memorial/ceremony";
import { TRADITIONS_V2_PILOT_CASES } from "@/components/memorial/traditions/v2/pilot-fixtures";
import { writeTraditions } from "@/lib/memorial/traditions";
import { readPersonWords, setPersonWordsText, writePersonWords } from "@/lib/memorial/person-words";
import { readLovedThings, setLovedThingsText, writeLovedThings } from "@/lib/memorial/loved-things";
import { readLegacy, setLegacyText, writeLegacy } from "@/lib/memorial/legacy";
import { updateGallery } from "@/lib/memorial/gallery-content";
import { A13_PILOT_MEDIA_POOL } from "@/lib/memorial/gallery/a13-pilot-fixtures";
import { commitA03 } from "@/lib/builder/guided-flow/death-notice-step";

const GALLERY_MEDIA_IDS = A13_PILOT_MEDIA_POOL.map(
  (_, index) => `${String(index + 1).padStart(8, "0")}-0000-4000-8000-00000000000${(index + 1) % 10}`,
);

function withRepresentativeHero(content: MemorialContent): MemorialContent {
  let hero = setHeroShortPhrase(readHero(content), "Sa douceur continue de nous accompagner.");
  const birth = setHeroBirth(hero, QG_RUNTIME_DEMO_BIRTH);
  if (!birth.ok) throw new Error(`Founder Atelier fixture: Hero birth refused (${birth.reason})`);
  hero = birth.hero;
  const death = setHeroDeath(hero, QG_RUNTIME_DEMO_DEATH);
  if (!death.ok) throw new Error(`Founder Atelier fixture: Hero death refused (${death.reason})`);
  const updated = updateHero(content, death.hero);
  const verifiedNotice = commitA03(updated);
  if (!verifiedNotice.ok) {
    throw new Error(`Founder Atelier fixture: Death Notice verification refused (${verifiedNotice.reason})`);
  }
  return verifiedNotice.content;
}

function withRepresentativeStory(content: MemorialContent): MemorialContent {
  let next = writePersonWords(
    content,
    setPersonWordsText(readPersonWords(content), "Éléonore avançait avec curiosité, un rire lumineux et le goût des histoires partagées."),
  );
  next = writeLovedThings(
    next,
    setLovedThingsText(readLovedThings(next), "Les jardins au petit matin, les livres annotés et les longues tablées du dimanche."),
  );
  return writeLegacy(
    next,
    setLegacyText(readLegacy(next), "Elle nous laisse la patience d'écouter et l'envie de prendre soin les uns des autres."),
  );
}

export function buildFounderAtelierContent(): MemorialContent {
  let content = withRepresentativeHero(fullAnnouncementWithTraditions());
  content = writeCeremony(content, CEREMONY_V2_PILOT_CASES[0].ceremony);
  content = writeTraditions(content, TRADITIONS_V2_PILOT_CASES[0].traditions);
  content = withRepresentativeStory(content);

  const gallery = updateGallery(content, {
    items: GALLERY_MEDIA_IDS.map((mediaId, index) => ({
      mediaId,
      caption: A13_PILOT_MEDIA_POOL[index].captions["une-ligne"],
    })),
  });
  if (!gallery.ok) throw new Error(`Founder Atelier fixture: Gallery refused (${gallery.reason})`);
  return gallery.content;
}

export const resolveFounderAtelierMedia: MediaResolver = async ({ mediaId, purpose }) => {
  if (purpose === "hero") {
    return mediaId === FIXTURE_HERO_MEDIA_ID
      ? { mediaId, readUrl: QG_RUNTIME_DEMO_PHOTO_DATA_URL }
      : null;
  }

  const index = GALLERY_MEDIA_IDS.indexOf(mediaId);
  const media = A13_PILOT_MEDIA_POOL[index];
  return media
    ? { mediaId, readUrl: media.src, width: media.width, height: media.height }
    : null;
};
