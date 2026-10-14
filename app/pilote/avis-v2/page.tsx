import { notFound } from "next/navigation";
import { Cormorant_Garamond, EB_Garamond } from "next/font/google";
import type { Language } from "@/config/languages";
import type { SkinVariant } from "@/config/skins";
import { playfairDisplay } from "@/components/builder/fonts";
import { DeathNoticeV2 } from "@/components/memorial/death-notice/v2/DeathNoticeV2";
import { DEATH_NOTICE_V2_PILOT_CASES } from "@/components/memorial/death-notice/v2/pilot-fixtures";

/**
 * Avis de décès V2 : banc d'essai LOCAL du pilote Mobile (Light et Dark),
 * pour les captures de validation PO/QG. Inaccessible en production
 * (`notFound`) ; n'appartient à aucun parcours.
 *
 *   /pilote/avis-v2?case=reference&lang=fr&w=941&v=dark
 *   /pilote/avis-v2?fonts=1   (comparaison des polices candidates du nom)
 */

const cormorantBold = Cormorant_Garamond({ subsets: ["latin"], weight: ["600", "700"], variable: "--cand-cormorant" });
const ebGaramondBold = EB_Garamond({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--cand-eb" });

const LANGUAGES: readonly Language[] = ["fr", "en", "es"];

export default async function AvisV2PilotPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : undefined);

  if (one("fonts") === "1") {
    const candidates = [
      { label: "Cormorant Garamond 600", family: "var(--cand-cormorant)", weight: 600 },
      { label: "Cormorant Garamond 700", family: "var(--cand-cormorant)", weight: 700 },
      { label: "EB Garamond 500", family: "var(--cand-eb)", weight: 500 },
      { label: "EB Garamond 600", family: "var(--cand-eb)", weight: 600 },
      { label: "EB Garamond 700", family: "var(--cand-eb)", weight: 700 },
      { label: "Playfair Display 600", family: "var(--font-heritage-serif)", weight: 600 },
    ];
    return (
      <main
        className={`${cormorantBold.variable} ${ebGaramondBold.variable} ${playfairDisplay.variable}`}
        style={{ background: "#f4dfc7", padding: 20 }}
      >
        {candidates.map((c) => (
          <div key={c.label} data-candidate={c.label} style={{ display: "flex", alignItems: "center", gap: 24, height: 130 }}>
            <span
              data-name
              style={{ fontFamily: c.family, fontWeight: c.weight, fontSize: 88, lineHeight: 1, color: "#211d13", whiteSpace: "nowrap" }}
            >
              Élise Martin
            </span>
            <span style={{ fontFamily: "sans-serif", fontSize: 14 }}>{c.label}</span>
          </div>
        ))}
      </main>
    );
  }

  const pilotCase = DEATH_NOTICE_V2_PILOT_CASES.find((c) => c.id === one("case")) ?? DEATH_NOTICE_V2_PILOT_CASES[0];
  const requested = one("lang") as Language | undefined;
  const language: Language = requested !== undefined && LANGUAGES.includes(requested) ? requested : "fr";
  const width = Number(one("w")) || null;
  const skinVariant: SkinVariant = one("v") === "dark" ? "dark" : "light";

  return (
    <main style={{ background: "#d9d2c7", minHeight: "100dvh" }}>
      <div style={{ width: width !== null ? `${width}px` : "100%", marginInline: "auto" }} data-pilot-case={pilotCase.id}>
        <DeathNoticeV2
          hero={pilotCase.hero}
          deathNotice={pilotCase.deathNotice}
          language={language}
          skinVariant={skinVariant}
          headingLevel="section"
        />
      </div>
    </main>
  );
}
