"use client";

import { useMemo, useState } from "react";
import type { SkinVariant } from "@/config/skins";
import {
  FOUNDER_ATELIER_SECTIONS,
  founderAtelierStatus,
  type FounderAtelierDevice,
  type FounderAtelierSectionId,
} from "@/lib/admin/founder-atelier";
import styles from "./page.module.css";

const STATUS_LABELS = {
  integrated: "Intégré",
  provisional: "Provisoire",
  notIntegrated: "Non intégré",
  unavailable: "Non disponible",
} as const;

export function FounderAtelier() {
  const [sectionId, setSectionId] = useState<FounderAtelierSectionId>("hero");
  const [variant, setVariant] = useState<SkinVariant>("light");
  const [device, setDevice] = useState<FounderAtelierDevice>("desktop");
  const section = FOUNDER_ATELIER_SECTIONS.find((candidate) => candidate.id === sectionId)!;
  const status = founderAtelierStatus(sectionId, variant, device);
  const previewUrl = useMemo(
    () => `/admin/atelier/preview?section=${encodeURIComponent(sectionId)}&theme=${variant}`,
    [sectionId, variant],
  );

  return (
    <main className={styles.main}>
      <header className={styles.header} id="atelier-summary">
        <div>
          <p className={styles.eyebrow}>Accès privé · lecture seule</p>
          <h1>Atelier HERITAGE</h1>
          <p className={styles.intro}>Consultation artistique et QA des renderers réellement raccordés à la skin Intemporel.</p>
        </div>
        <a className={styles.adminLink} href="/admin">Support admin</a>
      </header>

      <nav className={styles.summary} aria-label="Rubriques de l’Atelier">
        {FOUNDER_ATELIER_SECTIONS.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            aria-pressed={candidate.id === sectionId}
            onClick={() => setSectionId(candidate.id)}
          >
            <span>{candidate.label}</span>
            <small>{STATUS_LABELS[candidate.status]}</small>
          </button>
        ))}
      </nav>

      <section className={styles.workspace} aria-labelledby="preview-title">
        <div className={styles.toolbar}>
          <div className={styles.current}>
            <a href="#atelier-summary" className={styles.back}>Retour au sommaire</a>
            <h2 id="preview-title">{section.label}</h2>
            <div className={styles.statusLine}>
              <span className={styles.status} data-status={status}>{STATUS_LABELS[status]}</span>
              <code>{section.rendererKey}</code>
            </div>
            <p>{section.note}</p>
          </div>

          <div className={styles.controls}>
            <fieldset>
              <legend>Ambiance</legend>
              <button type="button" aria-pressed={variant === "light"} onClick={() => setVariant("light")}>Light</button>
              <button type="button" aria-pressed={variant === "dark"} onClick={() => setVariant("dark")}>Dark</button>
            </fieldset>
            <fieldset>
              <legend>Format</legend>
              <button type="button" aria-pressed={device === "mobile"} onClick={() => setDevice("mobile")}>Mobile</button>
              <button type="button" aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")}>Desktop</button>
            </fieldset>
          </div>
        </div>

        <div className={styles.stage} data-device={device}>
          <iframe
            key={`${sectionId}-${variant}`}
            className={styles.preview}
            src={previewUrl}
            title={`${section.label} — ${device} ${variant}`}
          />
        </div>
      </section>
    </main>
  );
}
