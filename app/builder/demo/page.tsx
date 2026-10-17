"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import type { MemorialContent } from "@/types/memorial";
import type { SkinVariant } from "@/config/skins";
import { WelcomeStep } from "@/components/builder/WelcomeStep";
import { AnnouncementChoiceStep } from "@/components/builder/AnnouncementChoiceStep";
import { HeroIdentityStep } from "@/components/builder/HeroIdentityStep";
import { HeroPhraseStep } from "@/components/builder/HeroPhraseStep";
import { HeroRevealStep } from "@/components/builder/HeroRevealStep";
import { DeathNoticeAnnouncementStep } from "@/components/builder/DeathNoticeAnnouncementStep";
import { DeathNoticePrecisionsStep } from "@/components/builder/DeathNoticePrecisionsStep";
import { DeathNoticePreviewStep } from "@/components/builder/DeathNoticePreviewStep";
import { CeremonyMomentStep } from "@/components/builder/CeremonyMomentStep";
import { CeremonyDateTimeStep } from "@/components/builder/CeremonyDateTimeStep";
import { CeremonyVenueStep } from "@/components/builder/CeremonyVenueStep";
import { CeremonyAddressStep } from "@/components/builder/CeremonyAddressStep";
import { CeremonyProgrammeStep } from "@/components/builder/CeremonyProgrammeStep";
import { CeremonyNoteStep } from "@/components/builder/CeremonyNoteStep";
import { TraditionsStep } from "@/components/builder/TraditionsStep";
import { PersonSheetStep } from "@/components/builder/PersonSheetStep";
import { GuidedFlowPause } from "@/components/builder/GuidedFlowPause";
import { JourneyContext, type JourneyNavigation } from "@/components/builder/journey/journey-context";
import {
  createPendingInputRegistry,
  hasIncompleteNativeInput,
  PendingInputRegistryContext,
} from "@/components/builder/journey/pending-input";
import { heroStepProgress } from "@/lib/builder/guided-flow/hero-step";
import { readHero } from "@/lib/memorial/hero";
import {
  currentJourneyScreen,
  resolveJourney,
  resolveRevisionTarget,
  type JourneyScreenId,
} from "@/lib/builder/guided-flow/journey";
import {
  QG_RUNTIME_DEMO_BIRTH,
  QG_RUNTIME_DEMO_DEATH,
  QG_RUNTIME_DEMO_DEFAULT_SKIN_VARIANT,
  QG_RUNTIME_DEMO_LANGUAGE,
  QG_RUNTIME_DEMO_NAME_LONG,
  QG_RUNTIME_DEMO_NAME_NORMAL,
  QG_RUNTIME_DEMO_PHOTO,
  QG_RUNTIME_DEMO_SKIN,
  buildQgRuntimeDemoContent,
  buildQgRuntimeDemoContentThroughA03,
} from "@/lib/builder/qg-runtime-demo";
import { RecitDeVieV2 } from "@/components/memorial/life-story/v2/RecitDeVieV2";
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
 *
 * B03 — the screen sequence now comes from `currentJourneyScreen`
 * (lib/builder/guided-flow/journey.ts — the same gates as the real
 * route, in the same order), and « Mon parcours » works here too, with a
 * local revision target standing in for the route's `?etape=`. The
 * ceremony, traditions and person sheet are shown; the Gallery (real
 * uploads) gets the same honest notice as PAGE C/D.
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

/**
 * Récit de vie — QG Runtime Demo control panel, Handoff GREEN QG
 * `HERITAGE_RDV_HANDOFF_RUNTIME_V1_0_QG_AUDIT` (mission section 14's own
 * QA matrix: "trois fallbacks courts, 80/80/80... 240/240/240, puis
 * chaque matière à 240 avec les deux autres courtes"). Entirely
 * additive, exactly like the withdrawn V1.3.1 panel it replaces: never
 * touches the gated Hero/A01-A03 flow above, never persists anything
 * beyond this page's own local `useState`. Content is built through the
 * real `writePersonWords`/`writeLovedThings`/`writeLegacy` functions —
 * never a hand-shaped `content.personWords`/… object.
 */
type RecitScenario = "FALLBACKS" | "SHORT" | "STRESS_240" | "MIXED";

const RECIT_SCENARIOS: { id: RecitScenario; label: string }[] = [
  { id: "FALLBACKS", label: "3 fallbacks (vide)" },
  { id: "SHORT", label: "Textes courts" },
  { id: "STRESS_240", label: "Stress 240/240/240" },
  { id: "MIXED", label: "Mixte (famille + fallback)" },
];

const RECIT_SHORT_A10 = "Élise avançait avec douceur.";
const RECIT_SHORT_A11 = "Elle aimait les livres et la mer.";
const RECIT_SHORT_A12 = "Elle laisse une tendresse profonde.";

/** Exactly 240 Unicode code points each, built deterministically so the
 * length is exact and auditable rather than eyeballed. */
function repeatToLength(sentence: string, length: number): string {
  const units = Array.from(sentence.repeat(Math.ceil(length / sentence.length)));
  return units.slice(0, length).join("");
}
const RECIT_STRESS_A10 = repeatToLength("Une présence qui demeure dans chaque souvenir partagé. ", 240);
const RECIT_STRESS_A11 = repeatToLength("Ce qu'elle aimait continue de vivre dans nos gestes. ", 240);
const RECIT_STRESS_A12 = repeatToLength("Ce qu'elle nous laisse ne s'efface pas avec le temps. ", 240);

function buildRecitScenarioContent(scenario: RecitScenario): MemorialContent {
  let content: MemorialContent = {};
  if (scenario === "FALLBACKS") return content;

  if (scenario === "SHORT") {
    content = writePersonWords(content, { text: RECIT_SHORT_A10 });
    content = writeLovedThings(content, { text: RECIT_SHORT_A11 });
    content = writeLegacy(content, { text: RECIT_SHORT_A12 });
    return content;
  }

  if (scenario === "STRESS_240") {
    content = writePersonWords(content, { text: RECIT_STRESS_A10 });
    content = writeLovedThings(content, { text: RECIT_STRESS_A11 });
    content = writeLegacy(content, { text: RECIT_STRESS_A12 });
    return content;
  }

  // MIXED — only A10 filled, A11/A12 fall back.
  content = writePersonWords(content, { text: RECIT_SHORT_A10 });
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

  // Récit de vie QG Runtime Demo panel — independent from the gated
  // flow above (see this file's own `RECIT_SCENARIOS` docstring).
  const [showRecit, setShowRecit] = useState(false);
  const [recitScenario, setRecitScenario] = useState<RecitScenario>("FALLBACKS");

  // Builder Welcome — shown first, exactly where the real route shows it
  // (right after T01, which this page has no screen for). Purely local:
  // its CTA only flips this flag; `content` is never touched.
  const [welcomeDone, setWelcomeDone] = useState(false);

  // B03 — the screen opened from « Mon parcours » (the demo's `?etape=`).
  const [revising, setRevising] = useState<JourneyScreenId | null>(null);
  const [pendingInputs] = useState(createPendingInputRegistry);

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
    setRevising(null);
    setContent(buildQgRuntimeDemoContent(scenarioHeroInput(next)));
    setSkinVariant(QG_RUNTIME_DEMO_DEFAULT_SKIN_VARIANT);
    setGeneration((n) => n + 1);
  }

  function jumpToA03() {
    setRevising(null);
    setContent(buildQgRuntimeDemoContentThroughA03(scenarioHeroInput(scenario)));
    setGeneration((n) => n + 1);
  }

  function resetDemo() {
    applyScenario(scenario);
  }

  let stepLabel: string;
  let body: ReactNode;

  // B03 — « Mon parcours » in the demo: the same pure journey the real
  // route computes (`resolveJourney`), with a local revision target in
  // place of the route's `?etape=` (validated by the same
  // `resolveRevisionTarget`). Nothing is persisted anywhere.
  const revisionTarget = resolveRevisionTarget(content, revising);
  const journey: JourneyNavigation = {
    language: LANGUAGE,
    snapshot: resolveJourney(content, revisionTarget),
    skinVariant,
    async openScreen(id) {
      setRevising(id);
      setGeneration((n) => n + 1);
      return true;
    },
    async resume() {
      setRevising(null);
      setGeneration((n) => n + 1);
      return true;
    },
    finishStep() {
      if (revisionTarget === null) return;
      setRevising(null);
      setGeneration((n) => n + 1);
    },
    hasPendingInput: () => pendingInputs.hasPending() || hasIncompleteNativeInput(),
  };

  function unavailableNotice(what: string) {
    return (
      <div className={styles.notice}>
        <p>
          {what} (upload Storage réel) n&rsquo;est pas disponible dans ce banc d&rsquo;essai local.
          Utilisez « Mon parcours » ou réinitialisez la démonstration.
        </p>
        <button type="button" className={styles.panelButton} onClick={resetDemo}>
          Réinitialiser
        </button>
      </div>
    );
  }

  /** The same screens the real route renders, keyed by journey id. */
  function demoScreen(id: JourneyScreenId | null): { label: string; screen: ReactNode } {
    switch (id) {
      case "identity":
        return { label: "Hero — PAGE A (nom, dates)", screen: <HeroIdentityStep language={LANGUAGE} content={content} persist={persist} />};
      case "announcementChoice":
        return { label: "A00 — choix de l'annonce de décès", screen: <AnnouncementChoiceStep language={LANGUAGE} content={content} persist={persist} />};
      case "phrase":
        return { label: "Hero — PAGE B (phrase)", screen: <HeroPhraseStep language={LANGUAGE} content={content} persist={persist} />};
      case "photo":
      case "crop":
        // See this file's top docstring — PAGE C/D need real Storage.
        return { label: "Hero — photo (indisponible dans ce banc d'essai)", screen: unavailableNotice("L'étape photo")};
      case "reveal":
        return {
          label: "Hero — PAGE E (révélation, Light/Dark)",
          screen: <HeroRevealStep
            language={LANGUAGE}
            content={content}
            photo={QG_RUNTIME_DEMO_PHOTO}
            initialSkinVariant={skinVariant}
            persist={persist}
            saveSkinVariant={saveSkinVariant}
          />,
        };
      case "announcementText":
        return { label: "A01 — annonce", screen: <DeathNoticeAnnouncementStep language={LANGUAGE} content={content} persist={persist} />};
      case "announcementDetails":
        return { label: "A02 — précisions", screen: <DeathNoticePrecisionsStep language={LANGUAGE} content={content} persist={persist} />};
      case "announcementPreview":
        return {
          label: "A03 — aperçu de l'avis (DeathNoticeIntemporel)",
          screen: <DeathNoticePreviewStep
            language={LANGUAGE}
            content={content}
            skin={QG_RUNTIME_DEMO_SKIN}
            skinVariant={skinVariant}
            persist={persist}
          />,
        };
      case "ceremonyMoment":
        return { label: "A04 — un moment est-il prévu ?", screen: <CeremonyMomentStep language={LANGUAGE} content={content} persist={persist} />};
      case "ceremonyDateTime":
        return { label: "A05 — date et heure", screen: <CeremonyDateTimeStep language={LANGUAGE} content={content} persist={persist} />};
      case "ceremonyVenue":
        return { label: "A06 — lieu", screen: <CeremonyVenueStep language={LANGUAGE} content={content} persist={persist} />};
      case "ceremonyAddress":
        return { label: "A07 — adresse", screen: <CeremonyAddressStep language={LANGUAGE} content={content} persist={persist} />};
      case "ceremonyProgramme":
        return { label: "A14 — déroulement de la cérémonie", screen: <CeremonyProgrammeStep language={LANGUAGE} content={content} persist={persist} />};
      case "ceremonyNote":
        return { label: "A08 — informations pratiques", screen: <CeremonyNoteStep language={LANGUAGE} content={content} persist={persist} />};
      case "traditions":
        return {
          label: "A09 — traditions & repères",
          screen: <TraditionsStep language={LANGUAGE} content={content} skin={QG_RUNTIME_DEMO_SKIN} persist={persist} />,
        };
      case "personSheet":
        return { label: "A10-A12 — quelques mots sur la personne", screen: <PersonSheetStep language={LANGUAGE} content={content} persist={persist} />};
      case "gallery":
        return { label: "A13 — galerie (indisponible dans ce banc d'essai)", screen: unavailableNotice("La galerie")};
      case null:
        return {
          label: "Parcours terminé (écran de repos)",
          screen: <GuidedFlowPause language={LANGUAGE} progress={heroStepProgress(content, readHero(content))} />,
        };
    }
  }

  if (showRecit) {
    const recitContent = buildRecitScenarioContent(recitScenario);
    stepLabel = `Récit de vie — ${RECIT_SCENARIOS.find((s) => s.id === recitScenario)?.label ?? recitScenario}`;
    body = <RecitDeVieV2 content={recitContent} language={LANGUAGE} skinVariant={skinVariant} />;
  } else if (!welcomeDone) {
    stepLabel = "Bienvenue (après T01)";
    body = (
      <WelcomeStep
        language={LANGUAGE}
        content={content}
        persist={async () => {
          setWelcomeDone(true);
          return { updatedAt: new Date().toISOString() };
        }}
      />
    );
  } else {
    const { label, screen } = demoScreen(revisionTarget ?? currentJourneyScreen(content));
    stepLabel = revisionTarget !== null ? `Révision — ${label}` : label;
    body = (
      <PendingInputRegistryContext.Provider value={pendingInputs}>
        <JourneyContext.Provider value={journey}>{screen}</JourneyContext.Provider>
      </PendingInputRegistryContext.Provider>
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
          <span className={styles.panelGroupLabel}>Récit de vie</span>
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
