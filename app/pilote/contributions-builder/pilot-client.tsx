"use client";

import { useState } from "react";
import type { Language } from "@/config/languages";
import type { SkinVariant } from "@/config/skins";
import { translate } from "@/lib/i18n/translate";
import { writeContributionsSettings, type ContributionsFeatures } from "@/lib/memorial/contributions/contributions-settings";
import type { MemorialContent } from "@/types/memorial";
import { BuilderScreen } from "@/components/builder/BuilderScreen";
import { ContributionsPreparation } from "@/components/builder/ContributionsPreparation";
import { PrimaryButton } from "@/components/builder/PrimaryButton";
import screenStyles from "@/components/builder/BuilderScreen.module.css";

/** Brouillon fictif du banc d'essai : d'autres rubriques déjà remplies, qui doivent rester intactes. */
const PILOT_DRAFT = { hero: { displayName: "Élise Martin" }, legacy: { text: "Sa bienveillance." }, guidedFlow: { A13: { status: "skipped" } } } as unknown as MemorialContent;

export function ContributionsBuilderPilot({ language, skinVariant, initial }: { language: Language; skinVariant: SkinVariant; initial: ContributionsFeatures }) {
  const [features, setFeatures] = useState<ContributionsFeatures>(initial);
  const [saved, setSaved] = useState<MemorialContent | null>(null);
  return (
    <BuilderScreen progress={0.9} allowSticky>
      <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: "var(--heritage-space-sm)" }}>
        <h1 style={{ fontFamily: "var(--heritage-font-family-serif)", fontWeight: 600, fontSize: "1.75rem", color: "var(--heritage-text-primary)", margin: 0 }}>
          {translate(language, "contributionsStep.title")}
        </h1>
        <p style={{ fontSize: "0.9375rem", color: "var(--heritage-text-secondary)", margin: 0 }}>{translate(language, "contributionsStep.subtitle")}</p>
      </div>
      <form
        style={{ display: "flex", flexDirection: "column", gap: "var(--heritage-space-breathing)" }}
        onSubmit={(e) => {
          e.preventDefault();
          setSaved(writeContributionsSettings(PILOT_DRAFT, features));
        }}
      >
        <ContributionsPreparation language={language} skinVariant={skinVariant} features={features} onChange={setFeatures} />
        <div className={screenStyles.ctaWrap}>
          <PrimaryButton type="submit">{translate(language, "common.continue")}</PrimaryButton>
        </div>
      </form>
      {saved ? (
        <pre data-pilot-saved="" style={{ fontSize: 12, whiteSpace: "pre-wrap", background: "rgba(0,0,0,0.05)", padding: 12, borderRadius: 8 }}>
          {JSON.stringify(saved, null, 2)}
        </pre>
      ) : null}
    </BuilderScreen>
  );
}
