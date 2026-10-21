"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SkinVariant } from "@/config/skins";
import type { OfferingKind } from "@/config/symbolic-offerings-v1-tokens";
import { SymbolicOfferingsV1, type OfferingsV1State } from "@/components/memorial/symbolic-offerings/v1/SymbolicOfferingsSceneV1";

/**
 * Banc d'essai M2 (page de développement seulement, voir `page.dev.tsx`) :
 * essais libres des trois gestes, retour aux cartes, serveur SIMULÉ.
 * `transmit` ne fait qu'attendre puis répondre : aucune requête, aucune
 * écriture, aucun geste enregistré.
 */

export interface OfferingsPilotSettings {
  variant: SkinVariant;
  width: number | null;
  outcome: "ok" | "fail";
  delay: number;
  reduced: "system" | "on" | "off";
  slow: boolean;
  /** Capture vidéo (outils de contrôle) : facteur de durée imposé. */
  captureScale?: number;
}

const WIDTHS = [null, 320, 390, 430, 1024, 1280, 1440] as const;
const DELAYS = [300, 600, 1500, 4000] as const;

const PHASE_LABEL: Record<string, string> = {
  cards: "cartes",
  "scene/pending": "scène — transmission simulée en cours",
  "scene/confirmed": "scène — confirmation simulée affichée",
  "scene/failed": "scène — échec simulé, « Réessayer » proposé",
  returning: "retour aux cartes",
};

function phaseKey(s: OfferingsV1State) {
  return s.phase === "scene" ? `scene/${s.status}` : s.phase;
}

export function OfferingsPilot({ initial }: { initial: OfferingsPilotSettings }) {
  const [settings, setSettings] = useState(initial);
  const [generation, setGeneration] = useState(0);
  const [phase, setPhase] = useState("cards");
  const [log, setLog] = useState<string[]>([]);
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const timeScale = settings.captureScale ?? (settings.slow ? 4 : 1);
  const update = (patch: Partial<OfferingsPilotSettings>, remount = false) => {
    setSettings((s) => ({ ...s, ...patch }));
    if (remount) setGeneration((g) => g + 1);
  };

  const transmit = useCallback((offering: OfferingKind) => {
    const { outcome, delay, slow, captureScale } = settingsRef.current;
    setLog((l) => [`${new Date().toLocaleTimeString("fr-FR")} — ${offering} : réponse simulée « ${outcome === "ok" ? "succès" : "échec"} » (aucune écriture)`, ...l].slice(0, 6));
    return new Promise<boolean>((resolve) => window.setTimeout(() => resolve(outcome === "ok"), delay * (captureScale ?? (slow ? 4 : 1))));
  }, []);

  const onStateChange = useCallback((s: OfferingsV1State) => setPhase(phaseKey(s)), []);

  const dark = settings.variant === "dark";
  const ui = { color: dark ? "#ece4d6" : "#2c261c", border: `1px solid ${dark ? "#5a4f40" : "#cfc3b2"}` };

  return (
    <main style={{ background: dark ? "#2a2119" : "#d9d2c7", minHeight: "100dvh", fontFamily: "system-ui, sans-serif", fontSize: 14 }}>
      <p role="note" data-pilot-banner style={{ margin: 0, padding: "8px 16px", background: "#fff1d6", color: "#5a3d06", fontWeight: 600, textAlign: "center" }}>
        Pilote — confirmation SIMULÉE : aucune écriture, aucun geste enregistré.
      </p>
      <form
        aria-label="Réglages du pilote"
        onSubmit={(e) => e.preventDefault()}
        style={{ display: "flex", flexWrap: "wrap", gap: "8px 20px", alignItems: "center", padding: "10px 16px", ...ui, borderWidth: "0 0 1px" }}
      >
        <label>
          Ambiance{" "}
          <select value={settings.variant} onChange={(e) => update({ variant: e.target.value as SkinVariant }, true)}>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <label>
          Largeur{" "}
          <select value={settings.width ?? ""} onChange={(e) => update({ width: e.target.value === "" ? null : Number(e.target.value) })}>
            {WIDTHS.map((w) => (
              <option key={w ?? "auto"} value={w ?? ""}>
                {w === null ? "pleine largeur" : `${w} px${w >= 1024 ? " (Desktop)" : ""}`}
              </option>
            ))}
          </select>
        </label>
        <label>
          Serveur simulé{" "}
          <select value={settings.outcome} onChange={(e) => update({ outcome: e.target.value as "ok" | "fail" })}>
            <option value="ok">succès</option>
            <option value="fail">échec</option>
          </select>
        </label>
        <label>
          Délai{" "}
          <select value={settings.delay} onChange={(e) => update({ delay: Number(e.target.value) })}>
            {DELAYS.map((d) => (
              <option key={d} value={d}>
                {(d / 1000).toLocaleString("fr-FR")} s
              </option>
            ))}
          </select>
        </label>
        <label>
          Réduction des animations{" "}
          <select value={settings.reduced} onChange={(e) => update({ reduced: e.target.value as OfferingsPilotSettings["reduced"] }, true)}>
            <option value="system">selon le système</option>
            <option value="on">activée</option>
            <option value="off">désactivée</option>
          </select>
        </label>
        <label>
          <input type="checkbox" checked={settings.slow} onChange={(e) => update({ slow: e.target.checked }, true)} /> Ralenti 25 %
        </label>
        <button type="button" onClick={() => setGeneration((g) => g + 1)}>
          Revenir aux cartes
        </button>
        <output aria-live="polite" data-pilot-phase={phase} style={{ fontWeight: 600 }}>
          État : {PHASE_LABEL[phase] ?? phase}
        </output>
      </form>
      <div style={{ width: settings.width !== null ? `${settings.width}px` : "100%", marginInline: "auto" }}>
        <SymbolicOfferingsV1
          key={generation}
          skinVariant={settings.variant}
          headingLevel="page"
          transmit={transmit}
          continueAction="returnToCards"
          reducedMotion={settings.reduced === "system" ? undefined : settings.reduced === "on"}
          timeScale={timeScale}
          onStateChange={onStateChange}
        />
      </div>
      <ol aria-label="Journal du serveur simulé" style={{ margin: 0, padding: "10px 16px 24px 36px", ...ui, border: 0 }}>
        {log.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ol>
    </main>
  );
}
