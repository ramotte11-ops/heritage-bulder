import { notFound } from "next/navigation";
import { AttentionsJournal } from "@/components/owner/AttentionsJournal";
import { FamilyDashboard, type FamilyDashboardView } from "@/components/owner/FamilyDashboard";
import { isLanguage, type Language } from "@/config/languages";
import type { OwnerFreePublicationStatus } from "@/lib/adapters/owner-free-publication-status-repository";
import type { FamilyTribute } from "@/lib/owner/family-space";
import type { FamilyTributePhoto } from "@/lib/owner/load-tribute-photos";

/**
 * Espace famille — pilote de recette visuelle. DONNÉES ILLUSTRATIVES
 * (celles de la maquette du Studio), aucune session, aucune lecture.
 *
 * Page de DÉVELOPPEMENT : fichier `page.dev.tsx`, routé par `next dev`
 * seulement (`next.config.ts`, `pageExtensionsFor`) ; absent de tout build
 * de production. `notFound()` reste une seconde barrière. Elle monte le
 * MÊME composant que `/owner` (`FamilyDashboard`).
 *
 *   /pilote/espace-famille                 les deux hommages de la maquette
 *   /pilote/espace-famille?etat=trois      trois hommages, dont un sans photo ; limite atteinte
 *   /pilote/espace-famille?etat=sans-offrande
 *   /pilote/espace-famille?etat=vide | erreur
 *   /pilote/espace-famille?vue=carnet      le carnet des attentions d'un hommage
 *   &lang=fr|en|es
 */

/** Portrait illustratif dessiné (aucune photographie réelle dans le dépôt). */
function portrait(skin: string, hair: string, coat: string, glow: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500"><defs><radialGradient id="g" cx="35%" cy="30%" r="90%"><stop offset="0" stop-color="${glow}"/><stop offset="1" stop-color="#6f6a4a"/></radialGradient></defs><rect width="400" height="500" fill="url(#g)"/><circle cx="90" cy="110" r="70" fill="#fff" opacity=".12"/><circle cx="330" cy="70" r="50" fill="#fff" opacity=".1"/><path d="M40 500c0-110 70-170 160-170s160 60 160 170z" fill="${coat}"/><rect x="170" y="270" width="60" height="80" rx="24" fill="${skin}"/><ellipse cx="200" cy="215" rx="78" ry="92" fill="${skin}"/><path d="M118 205c-8-80 40-125 86-125s92 40 80 128c-14-52-44-78-84-80-38-2-70 24-82 77z" fill="${hair}"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const ELISE = "11111111-1111-4111-8111-111111111111";
const JEAN = "22222222-2222-4222-8222-222222222222";
const THIRD = "33333333-3333-4333-8333-333333333333";

const TRIBUTES: FamilyTribute[] = [
  {
    id: ELISE, displayName: "Élise Martin", language: "fr", state: "in_preparation", years: "1948 – 2023",
    photo: { mediaId: "m1", crop: null }, publicSlug: null,
    freeDeadlines: { publishUntil: "2026-11-25T10:00:00.000Z", draftUntil: "2026-12-30T10:00:00.000Z" },
  },
  {
    id: JEAN, displayName: "Jean-Baptiste Dufresne-Lemoine", language: "fr", state: "published", years: "1939 – 2022",
    photo: { mediaId: "m2", crop: null }, publicSlug: "jean-baptiste-dufresne-lemoine-a1b2c3", freeDeadlines: null,
  },
];

const THIRD_TRIBUTE: FamilyTribute = {
  id: THIRD, displayName: null, language: "fr", state: "in_preparation", years: null,
  photo: null, publicSlug: null,
  freeDeadlines: { publishUntil: null, draftUntil: "2026-12-30T10:00:00.000Z" },
};

const PHOTOS = new Map<string, FamilyTributePhoto>([
  [ELISE, { readUrl: portrait("#e8c6a8", "#d9d4cc", "#e9dfd0", "#f0d9c0"), frame: null }],
  [JEAN, { readUrl: portrait("#dcb394", "#8a8378", "#6b4a3c", "#e9cfa0"), frame: null }],
]);

export default async function FamilySpacePilotPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const language: Language = typeof params.lang === "string" && isLanguage(params.lang) ? params.lang : "fr";
  const state = typeof params.etat === "string" ? params.etat : "maquette";

  if (params.vue === "carnet") {
    return (
      <AttentionsJournal
        language={language}
        email="famille@example.com"
        tribute={TRIBUTES[1]}
        counts={{ coeur: 12, bougie: 7, lys: 9 }}
        offerings={{
          offerings: [
            { id: "o1", kind: "lys", createdAt: "2026-11-15T09:00:00.000Z" },
            { id: "o2", kind: "bougie", createdAt: "2026-11-12T18:30:00.000Z" },
            { id: "o3", kind: "coeur", createdAt: "2026-11-11T07:10:00.000Z" },
            { id: "o4", kind: "bougie", createdAt: "2026-11-10T20:45:00.000Z" },
            { id: "o5", kind: "coeur", createdAt: "2026-11-09T12:00:00.000Z" },
          ],
          hasMore: true,
        }}
        spaceHref="/pilote/espace-famille"
        newerHref={null}
        olderHref="/pilote/espace-famille?vue=carnet"
      />
    );
  }

  const three = state === "trois";
  const tributes = three ? [...TRIBUTES, THIRD_TRIBUTE] : TRIBUTES;
  const publication: OwnerFreePublicationStatus = three
    ? { status: "window_open", windowUntil: "2026-11-25T10:00:00.000Z", activeFreeDrafts: 3, maxFreeDrafts: 3 }
    : { status: "window_open", windowUntil: "2026-11-25T10:00:00.000Z", activeFreeDrafts: 1, maxFreeDrafts: 3 };

  const view: FamilyDashboardView =
    state === "vide"
      ? { status: "none" }
      : state === "erreur"
        ? { status: "error" }
        : {
            status: "tributes",
            tributes,
            photos: PHOTOS,
            selected: TRIBUTES[1],
            attentions:
              state === "sans-offrande"
                ? { status: "ready", counts: { coeur: 0, bougie: 0, lys: 0 }, latest: [], hasMore: false }
                : {
                    status: "ready",
                    counts: { coeur: 12, bougie: 7, lys: 9 },
                    latest: [
                      { id: "o1", kind: "lys", createdAt: "2026-11-15T09:00:00.000Z" },
                      { id: "o2", kind: "bougie", createdAt: "2026-11-12T18:30:00.000Z" },
                    ],
                    hasMore: true,
                  },
          };

  return (
    <FamilyDashboard
      language={language}
      languageParam={typeof params.lang === "string" && isLanguage(params.lang) ? params.lang : null}
      email="famille@example.com"
      isOwner
      publication={publication}
      view={view}
      now={new Date("2026-11-16T12:00:00.000Z")}
    />
  );
}
