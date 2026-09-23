import Link from "next/link";
import type { Language } from "@/config/languages";
import { translate } from "@/lib/i18n/translate";
import { BuilderScreen } from "./BuilderScreen";
import styles from "./GuidedFlowPause.module.css";

interface GuidedFlowPauseProps {
  language: Language;
  /** 0 to 1 — the real engine's progress for this memorial (never 1
   * while steps not yet built are still ahead of the family). */
  progress: number;
}

/**
 * Builder continuity mission — the Guided Flow's resting screen.
 *
 * Shown by app/builder/[memorialId]/page.tsx once every step built so
 * far is genuinely behind the family (today: past the combined
 * A10+A11+A12 sheet for `announcement`, past PAGE E for `remembrance`),
 * in place of the old "your memorial still needs to be configured"
 * dead end — which blamed the family for a step (`slug`) no screen asks
 * them for.
 *
 * Deliberately says nothing about what comes next: no gallery, no
 * publication, no invented step. It confirms the answers are stored
 * (they are — every previous step persisted before routing here) and
 * offers the one real way back: the owner space (/owner), which lists
 * this Owner's memorials and reopens this Builder. When a later mission
 * builds the next step, its own gate is inserted before this screen and
 * the family simply lands there instead.
 *
 * A Server Component: no state, no autosave, nothing to persist.
 */
export function GuidedFlowPause({ language, progress }: GuidedFlowPauseProps) {
  return (
    <BuilderScreen progress={progress}>
      <div className={styles.copy}>
        <h1 className={styles.title}>{translate(language, "flowPause.title")}</h1>
        <p className={styles.body}>{translate(language, "flowPause.body")}</p>
      </div>

      <Link href="/owner" className={styles.link}>
        {translate(language, "flowPause.backToSpace")}
      </Link>
    </BuilderScreen>
  );
}
