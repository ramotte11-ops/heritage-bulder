"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import type { MemorialContent } from "@/types/memorial";
import type { SkinVariant } from "@/config/skins";
import { HeroIdentityStep } from "@/components/builder/HeroIdentityStep";
import { HeroPhraseStep } from "@/components/builder/HeroPhraseStep";
import { HeroRevealStep } from "@/components/builder/HeroRevealStep";
import { DeathNoticeAnnouncementStep } from "@/components/builder/DeathNoticeAnnouncementStep";
import { DeathNoticePrecisionsStep } from "@/components/builder/DeathNoticePrecisionsStep";
import { DeathNoticePreviewStep } from "@/components/builder/DeathNoticePreviewStep";
import {
  needsPageA,
  needsPageB,
  needsPageC,
  needsPageD,
  needsPageE,
} from "@/lib/builder/guided-flow/hero-step";
import { needsA01, needsA02, needsA03 } from "@/lib/builder/guided-flow/death-notice-step";
import {
  QG_RUNTIME_DEMO_BIRTH,
  QG_RUNTIME_DEMO_DEATH,
  QG_RUNTIME_DEMO_DEFAULT_SKIN_VARIANT,
  QG_RUNTIME_DEMO_EDITORIAL_CONTEXT,
  QG_RUNTIME_DEMO_LANGUAGE,
  QG_RUNTIME_DEMO_NAME_LONG,
  QG_RUNTIME_DEMO_NAME_NORMAL,
  QG_RUNTIME_DEMO_PHOTO,
  QG_RUNTIME_DEMO_SKIN,
  buildQgRuntimeDemoContent,
  buildQgRuntimeDemoContentThroughA03,
} from "@/lib/builder/qg-runtime-demo";
import { RecitDeVieIntemporel } from "@/components/memorial/life-story/RecitDeVieIntemporel";
import { writePersonWords } from "@/lib/memorial/person-words";
import { writeLovedThings } from "@/lib/memorial/loved-things";
import { writeLegacy } from "@/lib/memorial/legacy";
import styles from "./page.module.css";

/**
 * QG Runtime Demo (mini-mission before Mission 040).
 *
 * Replaces the Mission 003 fixture demo that used to live at this exact
 * URL (`/builder/demo` -> a list of two `DEMO_MEMORIALS`, each opening
 * `BuilderShell` directly at `/builder/demo/[demoId]`). That old demo
 * predates every Guided Flow mission (023-039B): it rendered the
 * *finished-Builder* section editor straight away, never the real
 * parcours (T01…T08, A01-A03) a family — or QG reviewing the product —
 * actually walks through on `/builder/[memorialId]`. It was accurate for
 * Mission 003, and has been silently wrong about what "the Builder"
 * looks like for a dozen missions since. See
 * `lib/builder/qg-runtime-demo.ts`'s own docstring for the fixture this
 * page is built on; `lib/builder/demo-memorials.ts`/`demo-content.ts`
 * still exist unchanged (they remain real test fixtures for the
 * unrelated Mission 003 `BuilderShell`/`builder-state` unit tests) but
 * are no longer reachable from any route.
 *
 * ## What this page is
 *
 * A client-only page with NO Supabase import, no Auth, no entitlement,
 * no server action, and no network call anywhere in its module graph
 * (verify: this file and lib/builder/qg-runtime-demo.ts import only
 * pure Guided Flow logic and the real screen components). All state is
 * a plain `useState` — a browser refresh loses everything, on purpose,
 * exactly like the Mission 003 demo it replaces.
 *
 * It renders the SAME gate sequence `app/builder/[memorialId]/page.tsx`
 * evaluates (`needsPageA` -> … -> `needsA03`) against a local `content`
 * value, and the SAME screen components that route renders — never a
 * parallel demo-only version of any of them. `persist` is a local
 * function that only calls `setContent` and resolves immediately; there
 * is nothing durable anywhere in this page for it to fail against.
 *
 * PAGE C/D (T06/T07, the Hero photo upload/crop) are the one real
 * Guided Flow screen this page cannot show: `HeroPhotoStep` uploads real
 * bytes to real Supabase Storage, which this mission forbids standing up
 * and forbids faking with a second, parallel storage mechanism. Every
 * scenario this page ever constructs pre-completes T06/T07 with a
 * deterministic fixture `Media` through the real, pure `commitPageC`/
 * `commitPageD` functions (see qg-runtime-demo.ts), so `needsPageC`/
 * `needsPageD` are always false in practice — the branch below exists
 * only as an honest fallback if that invariant is ever broken, never a
 * screen a reviewer should actually see.
 */

type Scenario = "normal" | "long";

function scenarioHeroInput(scenario: Scenario) {
  return {
    displayName: scenario === "long" ? QG_RUNTIME_DEMO_NAME_LONG : QG_RUNTIME_DEMO_NAME_NORMAL,
    birth: QG_RUNTIME_DEMO_BIRTH,
    death: QG_RUNTIME_DEMO_DEATH,
  };
}

const LANGUAGE = QG_RUNTIME_DEMO_LANGUAGE;
const EDITORIAL_CONTEXT = QG_RUNTIME_DEMO_EDITORIAL_CONTEXT;

/**
 * Récit de vie Runtime V1.3.1 — QG Runtime Demo control panel (mission
 * brief section 14). A dedicated preview mode, entirely additive: it
 * never touches the gated Hero/A01-A03 flow above (`needsPageA` ->
 * ... -> `needsA03`), never mounts `BuilderShell`, and never persists
 * anything beyond this page's own local `useState`. Toggled by
 * `showRecit`, independent from `scenario`/`generation` so switching
 * back to the guided flow resumes exactly where it was left.
 *
 * Content is built through the real `writePersonWords`/`writeLovedThings`/
 * `writeLegacy` functions (lib/memorial/person-words.ts,
 * loved-things.ts, legacy.ts) — the same functions
 * `PersonSheetStep`/Mission 044's combined A10+A11+A12 sheet itself
 * calls — never a hand-shaped `content.personWords`/… object, mirroring
 * `buildQgRuntimeDemoContent`'s own doctrine (this file's top docstring).
 */
type RecitScenario =
  | "A10"
  | "A11"
  | "A12"
  | "A10_A11"
  | "A10_A12"
  | "A11_A12"
  | "A10_A11_A12"
  | "A10_LONG";

const RECIT_SCENARIOS: { id: RecitScenario; label: string }[] = [
  { id: "A10", label: "A10 seul" },
  { id: "A11", label: "A11 seul" },
  { id: "A12", label: "A12 seul" },
  { id: "A10_A11", label: "A10+A11" },
  { id: "A10_A12", label: "A10+A12" },
  { id: "A11_A12", label: "A11+A12" },
  { id: "A10_A11_A12", label: "A10+A11+A12" },
  { id: "A10_LONG", label: "A10 long" },
];

const RECIT_A10_TEXT =
  "Elle avait un rire qui remplissait toute la pièce, et une patience infinie pour écouter chacun, jusqu'au bout.";
const RECIT_A11_TEXT =
  "Le jardin au printemps, les repas dominicaux en famille, et le café du matin pris lentement sur la terrasse.";
const RECIT_A12_TEXT =
  "Un héritage de gentillesse, de curiosité, et l'habitude de toujours tendre la main en premier.";
const RECIT_A10_LONG_TEXT = Array.from(
  { length: 6 },
  (_, i) =>
    `Paragraphe ${i + 1} — un très long texte familial, écrit tel quel par la famille, jamais résumé ni reformulé par HERITAGE, pour vérifier que la section Récit de vie grandit naturellement avec le contenu réel plutôt que d'être bornée à une hauteur fixe.`,
).join("\n");

function buildRecitScenarioContent(scenario: RecitScenario): MemorialContent {
  let content: MemorialContent = {};
  const includeA10 = scenario === "A10" || scenario === "A10_A11" || scenario === "A10_A12" || scenario === "A10_A11_A12" || scenario === "A10_LONG";
  const includeA11 = scenario === "A11" || scenario === "A10_A11" || scenario === "A11_A12" || scenario === "A10_A11_A12";
  const includeA12 = scenario === "A12" || scenario === "A10_A12" || scenario === "A11_A12" || scenario === "A10_A11_A12";

  if (includeA10) {
    content = writePersonWords(content, { text: scenario === "A10_LONG" ? RECIT_A10_LONG_TEXT : RECIT_A10_TEXT });
  }
  if (includeA11) {
    content = writeLovedThings(content, { text: RECIT_A11_TEXT });
  }
  if (includeA12) {
    content = writeLegacy(content, { text: RECIT_A12_TEXT });
  }
  return content;
}

export default function QgRuntimeDemoPage() {
  const [scenario, setScenario] = useState<Scenario>("normal");
  const [content, setContent] = useState<MemorialContent>(() =>
    buildQgRuntimeDemoContent(scenarioHeroInput("normal")),
  );
  const [skinVariant, setSkinVariant] = useState<SkinVariant>(QG_RUNTIME_DEMO_DEFAULT_SKIN_VARIANT);
  // Bumped on every preset/reset click to force a full remount of the
  // current step: HeroIdentityStep/HeroPhraseStep/… each seed their own
  // local editing state from `content` once, at mount — an external
  // content swap must remount them, never rely on a prop-change re-render
  // to reset that internal copy.
  const [generation, setGeneration] = useState(0);

  // Récit de vie Runtime V1.3.1 QG Runtime Demo panel — entirely
  // independent from the gated flow above (see this file's own
  // `RECIT_SCENARIOS` docstring).
  const [showRecit, setShowRecit] = useState(false);
  const [recitScenario, setRecitScenario] = useState<RecitScenario>("A10_A11_A12");

  function applyRecitScenario(next: RecitScenario) {
    setRecitScenario(next);
    setShowRecit(true);
  }

  async function persist(next: MemorialContent) {
    setContent(next);
    return { updatedAt: new Date().toISOString() };
  }

  async function saveSkinVariant(variant: string) {
    setSkinVariant(variant as SkinVariant);
  }

  function applyScenario(next: Scenario) {
    setScenario(next);
    setContent(buildQgRuntimeDemoContent(scenarioHeroInput(next)));
    setSkinVariant(QG_RUNTIME_DEMO_DEFAULT_SKIN_VARIANT);
    setGeneration((n) => n + 1);
  }

  function jumpToA03() {
    setContent(buildQgRuntimeDemoContentThroughA03(scenarioHeroInput(scenario)));
    setGeneration((n) => n + 1);
  }

  function resetDemo() {
    applyScenario(scenario);
  }

  let stepLabel: string;
  let body: ReactNode;

  if (showRecit) {
    const recitContent = buildRecitScenarioContent(recitScenario);
    stepLabel = `Récit de vie — ${RECIT_SCENARIOS.find((s) => s.id === recitScenario)?.label ?? recitScenario}`;
    body = <RecitDeVieIntemporel content={recitContent} language={LANGUAGE} skinVariant={skinVariant} />;
  } else if (needsPageA(content)) {
    stepLabel = "Hero — PAGE A (nom, dates)";
    body = (
      <HeroIdentityStep
        language={LANGUAGE}
        editorialContext={EDITORIAL_CONTEXT}
        content={content}
        persist={persist}
      />
    );
  } else if (needsPageB(content)) {
    stepLabel = "Hero — PAGE B (phrase)";
    body = (
      <HeroPhraseStep
        language={LANGUAGE}
        editorialContext={EDITORIAL_CONTEXT}
        content={content}
        persist={persist}
      />
    );
  } else if (needsPageC(content) || needsPageD(content)) {
    // See this file's top docstring — structurally unreachable in this
    // demo, kept only as an honest fallback rather than a crash.
    stepLabel = "Hero — photo (indisponible dans ce banc d'essai)";
    body = (
      <div className={styles.notice}>
        <p>
          L&rsquo;étape photo (upload Storage réel) n&rsquo;est pas disponible dans ce banc
          d&rsquo;essai local. Réinitialisez la démonstration.
        </p>
        <button type="button" className={styles.panelButton} onClick={resetDemo}>
          Réinitialiser
        </button>
      </div>
    );
  } else if (needsPageE(content)) {
    stepLabel = "Hero — PAGE E (révélation, Light/Dark)";
    body = (
      <HeroRevealStep
        language={LANGUAGE}
        editorialContext={EDITORIAL_CONTEXT}
        content={content}
        photo={QG_RUNTIME_DEMO_PHOTO}
        initialSkinVariant={skinVariant}
        persist={persist}
        saveSkinVariant={saveSkinVariant}
      />
    );
  } else if (needsA01(content)) {
    stepLabel = "A01 — annonce";
    body = (
      <DeathNoticeAnnouncementStep
        language={LANGUAGE}
        editorialContext={EDITORIAL_CONTEXT}
        content={content}
        persist={persist}
      />
    );
  } else if (needsA02(content)) {
    stepLabel = "A02 — précisions";
    body = (
      <DeathNoticePrecisionsStep
        language={LANGUAGE}
        editorialContext={EDITORIAL_CONTEXT}
        content={content}
        persist={persist}
      />
    );
  } else if (needsA03(content)) {
    stepLabel = "A03 — aperçu de l'avis (DeathNoticeIntemporel)";
    body = (
      <DeathNoticePreviewStep
        language={LANGUAGE}
        editorialContext={EDITORIAL_CONTEXT}
        content={content}
        skin={QG_RUNTIME_DEMO_SKIN}
        skinVariant={skinVariant}
        persist={persist}
      />
    );
  } else {
    stepLabel = "Parcours QG terminé (A01/A02/A03 validés)";
    body = (
      <div className={styles.notice}>
        <h1>Parcours QG terminé</h1>
        <p>
          A01, A02 et A03 sont vérifiés pour ce contenu de démonstration. Cette démo
          s&rsquo;arrête ici — elle n&rsquo;ouvre jamais le Builder final (`BuilderShell`) et ne
          publie jamais rien.
        </p>
        <button type="button" className={styles.panelButton} onClick={resetDemo}>
          Recommencer
        </button>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.banner} role="status">
        QG RUNTIME DEMO — données fictives — aucune sauvegarde
      </div>

      <div className={styles.controlPanel} aria-label="Contrôles QG Runtime Demo">
        <p className={styles.panelStep}>{stepLabel}</p>

        <div className={styles.panelGroup}>
          <span className={styles.panelGroupLabel}>Nom</span>
          <button
            type="button"
            className={styles.panelButton}
            aria-pressed={scenario === "normal"}
            onClick={() => applyScenario("normal")}
          >
            Normal
          </button>
          <button
            type="button"
            className={styles.panelButton}
            aria-pressed={scenario === "long"}
            onClick={() => applyScenario("long")}
          >
            Long
          </button>
        </div>

        <div className={styles.panelGroup}>
          <span className={styles.panelGroupLabel}>Ambiance</span>
          <button
            type="button"
            className={styles.panelButton}
            aria-pressed={skinVariant === "light"}
            onClick={() => setSkinVariant("light")}
          >
            Light
          </button>
          <button
            type="button"
            className={styles.panelButton}
            aria-pressed={skinVariant === "dark"}
            onClick={() => setSkinVariant("dark")}
          >
            Dark
          </button>
        </div>

        <div className={styles.panelGroup}>
          <span className={styles.panelGroupLabel}>Récit de vie V1.3.1</span>
          {RECIT_SCENARIOS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={styles.panelButton}
              aria-pressed={showRecit && recitScenario === s.id}
              onClick={() => applyRecitScenario(s.id)}
            >
              {s.label}
            </button>
          ))}
          {showRecit && (
            <button type="button" className={styles.panelButton} onClick={() => setShowRecit(false)}>
              Retour au parcours
            </button>
          )}
        </div>

        <div className={styles.panelGroup}>
          <button type="button" className={styles.panelButton} onClick={jumpToA03}>
            Aller à A03 (annonce + 5 précisions)
          </button>
          <button type="button" className={styles.panelButton} onClick={resetDemo}>
            Réinitialiser
          </button>
        </div>

        <p className={styles.panelHint}>
          Desktop/mobile : redimensionnez la fenêtre ou utilisez le mode responsive des
          DevTools — le renderer Intemporel détecte la vraie largeur de la fenêtre.
        </p>
      </div>

      <div className={styles.stage} key={generation}>
        {body}
      </div>
    </div>
  );
}
