import { notFound } from "next/navigation";
import type { Language } from "@/config/languages";
import { TraditionsV2 } from "@/components/memorial/traditions/v2/TraditionsV2";
import { TRADITIONS_V2_PILOT_CASES } from "@/components/memorial/traditions/v2/pilot-fixtures";
import { avisNameSerif, cormorantGaramond, ebGaramond, laBelleAurore, playfairDisplay } from "@/components/builder/fonts";

/**
 * Traditions & repères V2 : banc d'essai LOCAL du pilote Mobile Light (P1),
 * pour les captures de validation PO/QG. Inaccessible en production
 * (`notFound`) ; n'appartient à aucun parcours et n'est branché sur aucun
 * registre de rendu. `w` fixe la largeur du CONTENEUR.
 *
 *   /pilote/traditions-v2?case=reference&lang=fr&w=941
 *   /pilote/traditions-v2?fonts=1   (polices déjà chargées, pour le titre
 *                                   et la phrase manuscrite)
 */

const LANGUAGES: readonly Language[] = ["fr", "en", "es"];

export default async function TraditionsV2PilotPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : undefined);

  if (one("fonts") === "1") {
    const candidates = [
      { label: "EB Garamond 600", family: "var(--font-heritage-avis-name)", weight: 600 },
      { label: "EB Garamond 400", family: "var(--font-heritage-ceremony-serif)", weight: 400 },
      { label: "Playfair Display 500", family: "var(--font-heritage-serif)", weight: 500 },
      { label: "Playfair Display 600", family: "var(--font-heritage-serif)", weight: 600 },
      { label: "Cormorant Garamond 500", family: "var(--font-heritage-hero-serif)", weight: 500 },
      { label: "La Belle Aurore 400", family: "var(--font-heritage-hero-script)", weight: 400 },
    ];
    return (
      <main
        className={`${avisNameSerif.variable} ${ebGaramond.variable} ${playfairDisplay.variable} ${cormorantGaramond.variable} ${laBelleAurore.variable}`}
        style={{ background: "#f1e2d2", padding: 20 }}
      >
        {candidates.map((c) => (
          <div key={c.label} data-candidate={c.label} style={{ display: "flex", alignItems: "center", gap: 24, height: 120 }}>
            <span data-sample style={{ fontFamily: c.family, fontWeight: c.weight, fontSize: 72, lineHeight: 1, color: "#16190a", whiteSpace: "nowrap" }}>
              {c.label.startsWith("La Belle") ? "Merci d’accompagner notre famille" : "Traditions & repères"}
            </span>
            <span style={{ fontFamily: "sans-serif", fontSize: 14 }}>{c.label}</span>
          </div>
        ))}
      </main>
    );
  }

  const pilotCase = TRADITIONS_V2_PILOT_CASES.find((c) => c.id === one("case")) ?? TRADITIONS_V2_PILOT_CASES[0];
  const requested = one("lang") as Language | undefined;
  const language: Language = requested !== undefined && LANGUAGES.includes(requested) ? requested : "fr";
  const width = Number(one("w")) || null;

  return (
    <main style={{ background: "#d9d2c7", minHeight: "100dvh" }}>
      <div style={{ width: width !== null ? `${width}px` : "100%", marginInline: "auto" }} data-pilot-case={pilotCase.id}>
        <TraditionsV2 traditions={pilotCase.traditions} language={language} skinVariant="light" headingLevel="section" />
      </div>
    </main>
  );
}
