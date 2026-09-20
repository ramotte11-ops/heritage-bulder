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
import { StoryIntemporel } from "@/components/memorial/story/StoryIntemporel";
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
  QG_RUNTIME_DEMO_STORY_COMBINATIONS,
  buildQgRuntimeDemoContent,
  buildQgRuntimeDemoContentThroughA03,
  buildQgRuntimeDemoStoryContent,
  type QgRuntimeDemoStoryCombination,
} from "@/lib/builder/qg-runtime-demo";
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
 *
 * ## "Récit de vie" (StoryIntemporel) — a direct visual-validation panel,
 * not a Guided Flow walk-through
 *
 * `StoryIntemporel` has no Builder screen of its own to gate behind (the
 * combined A10+A11+A12 sheet only ever WRITES the three matières; it
 * never renders the Memorial piece) and, as of this integration, no
 * assembled Memorial page exists anywhere in the repo for it to sit in
 * either — exactly `CeremonyIntemporel`'s own real, already-accepted
 * status (a fully built, fully tested renderer with no live mount point
 * yet). Reusing this demo (mission requirement: no second showcase) for
 * it therefore does NOT walk the real A04-A09 gate sequence — that would
 * mean fabricating Ceremony/Traditions data this renderer does not even
 * read. Instead, selecting a "Récit de vie" combination below swaps
 * `body` to render `StoryIntemporel` directly against a minimal fixture
 * `MemorialContent` built by `buildQgRuntimeDemoStoryContent` (the real
 * `write*FieldText` functions, never a hand-shaped `content.personWords`/
 * `lovedThings`/`legacy`), leaving the ordinary step sequence completely
 * untouched underneath (closing the panel returns exactly where the
 * demo already was). The existing "Ambiance" Light/Dark toggle is reused
 * as-is; desktop/mobile is still the reviewer's own window/DevTools
 * resize, same hint as every other screen here.
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

export default function QgRuntimeDemoPage() {
  const [scenario, setScenario] = useState<Scenario>("normal");
  const [content, setContent] = useState<MemorialContent>(() =>
    buildQgRuntimeDemoContent(scenarioHeroInput("normal")),
  );
  const [skinVariant, setSkinVariant] = useState<SkinVariant>(QG_RUNTIME_DEMO_DEFAULT_SKIN_VARIANT);
  const [storyCombo, setStoryCombo] = useState<QgRuntimeDemoStoryCombination | null>(null);
  // Bumped on every preset/reset click to force a full remount of the
  // current step: HeroIdentityStep/HeroPhraseStep/… each seed their own
  // local editing state from `content` once, at mount — an external
  // content swap must remount them, never rely on a prop-change re-render
  // to reset that internal copy.
  const [generation, setGeneration] = useState(0);

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

  if (storyCombo !== null) {
    stepLabel = `Récit de vie — ${storyCombo}`;
    body = (
      <StoryIntemporel
        content={buildQgRuntimeDemoStoryContent(storyCombo)}
        language={LANGUAGE}
        skinVariant={skinVariant}
      />
    );
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
          <button type="button" className={styles.panelButton} onClick={jumpToA03}>
            Aller à A03 (annonce + 5 précisions)
          </button>
          <button type="button" className={styles.panelButton} onClick={resetDemo}>
            Réinitialiser
          </button>
        </div>

        <div className={styles.panelGroup}>
          <span className={styles.panelGroupLabel}>Récit de vie</span>
          {QG_RUNTIME_DEMO_STORY_COMBINATIONS.map((combo) => (
            <button
              key={combo}
              type="button"
              className={styles.panelButton}
              aria-pressed={storyCombo === combo}
              onClick={() => setStoryCombo(combo)}
            >
              {combo}
            </button>
          ))}
          {storyCombo !== null && (
            <button type="button" className={styles.panelButton} onClick={() => setStoryCombo(null)}>
              Fermer
            </button>
          )}
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
