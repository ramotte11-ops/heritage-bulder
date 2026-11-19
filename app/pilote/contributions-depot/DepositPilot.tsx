"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Language } from "@/config/languages";
import { ebGaramond, ebGaramondItalic, laBelleAurore, offeringsMediumSerif } from "@/components/builder/fonts";
import { contributionsSignatureScript } from "@/components/memorial/contributions/contribution-fonts";
import { ContributionDepositWindow } from "@/components/memorial/contributions/ContributionDepositWindow";
import { ContributionsSceneEmpty } from "@/components/memorial/contributions/ContributionsSceneEmpty";
import type { ContributionDepositTransport } from "@/components/memorial/contributions/deposit-transport";
import { checkContributionText, checkOptionalCaption } from "@/lib/memorial/contributions/contribution-text";

const FONTS = [ebGaramond, ebGaramondItalic, offeringsMediumSerif, laBelleAurore, contributionsSignatureScript].map((f) => f.variable).join(" ");

/** Simulation : mêmes validations que le serveur (module partagé), résultat choisi par l'URL. */
function simulated(outcome: "auto" | "pending" | "busy"): ContributionDepositTransport {
  const wait = () => new Promise((r) => setTimeout(r, 400));
  return {
    open: async () => ({ status: "ready", formToken: "pilote" }),
    depositText: async ({ type, authorName, text }) => {
      await wait();
      if (!checkContributionText("authorName", authorName).ok) return { status: "invalid", field: "authorName" };
      if (!checkContributionText(type === "condolence" ? "condolence" : "story", text).ok) return { status: "invalid", field: "text" };
      if (outcome === "busy") return { status: "busy" };
      return { status: outcome === "pending" || type === "testimonial" ? "pending" : "published" };
    },
    depositPhoto: async ({ authorName, caption }) => {
      await wait();
      if (!checkContributionText("authorName", authorName).ok) return { status: "invalid", field: "authorName" };
      if (!checkOptionalCaption(caption).ok) return { status: "invalid", field: "caption" };
      return outcome === "busy" ? { status: "busy" } : { status: "pending" };
    },
  };
}

export function DepositPilot({ theme, language, outcome, categories }: { theme: "light" | "dark"; language: Language; outcome: "auto" | "pending" | "busy"; categories: { condolences: boolean; stories: boolean; photos: boolean } }) {
  // Comme la lecture agrandie M5-C : la fenêtre n'existe qu'après le rendu dans le navigateur (portail).
  const [open, setOpen] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- ouverture initiale du banc d'essai, une fois monté
  useEffect(() => setOpen(true), []);
  const trigger = useRef<HTMLButtonElement>(null);
  const transport = useMemo(() => simulated(outcome), [outcome]);
  return (
    <main className={FONTS} style={{ background: theme === "dark" ? "#1d1b19" : "#f3ece0", minHeight: "100vh", padding: "24px 0" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <ContributionsSceneEmpty frame="desktop" theme={theme} title="Contributions des proches" subtitle="Souvenirs, pensées et mots d’amour partagés par la famille et les amis en mémoire d’Élise Martin." closing="Vos mots feront vivre sa mémoire et perpétueront sa lumière." />
        <p style={{ textAlign: "center" }}>
          <button ref={trigger} type="button" onClick={() => setOpen(true)} data-pilot-open="">
            Rouvrir la fenêtre (pilote)
          </button>
        </p>
      </div>
      {open ? (
        <ContributionDepositWindow language={language} theme={theme} categories={categories} transport={transport} onClose={() => setOpen(false)} returnFocusRef={trigger} fontsClassName={FONTS} />
      ) : null}
    </main>
  );
}
