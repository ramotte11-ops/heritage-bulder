import type { Language } from "@/config/languages";
import type { EditorialContext } from "@/config/memorial";
import type { SkinVariant } from "@/config/skins";
import type { HeroContent } from "@/types/hero";
import type { DeathNoticeContent } from "@/types/death-notice";
import type { DeathNoticePrecisionField } from "@/lib/memorial/death-notice";
import type { TranslationKey } from "@/lib/i18n/keys";
import { translate } from "@/lib/i18n/translate";
import { formatHeroDateRange } from "@/lib/memorial/format-hero-date";
import { DEATH_NOTICE_INTEMPOREL_ASSETS } from "@/config/death-notice-intemporel-tokens";
import { SkinScope } from "@/components/memorial/SkinScope";
import { cormorantGaramond } from "@/components/builder/fonts";
import styles from "./DeathNoticeIntemporel.module.css";

/**
 * Mission 039B (A03) — the real Death Notice ("Avis de décès") editorial
 * renderer, Intemporel skin.
 *
 * Composes the Studio's own Runtime Split Pack (the sheet's entire
 * artistic envelope — torn edges, layered papers, depth, peripheral
 * botanicals, the HERITAGE seal, all baked into three master images per
 * variant — `config/death-notice-intemporel-tokens.ts`) with the
 * family's real canonical content, exactly the same discipline
 * `HeroIntemporel.tsx` already established for the Hero: no family text
 * is ever baked into an asset, every asset is decorative only, and this
 * is the SAME renderer a future Live Preview and the published memorial
 * page will use — never a miniature or a mock built specially for the
 * Builder's own A03 screen (`DeathNoticePreviewStep.tsx`).
 *
 * ## Content vs. skin (AGENTS.md section 12)
 *
 * This component takes only canonical `HeroContent`/`DeathNoticeContent`
 * plus the family's `language` — never a second content model, never a
 * duplicate of `hero.ts`/`death-notice.ts`'s own fields. Everything
 * drawn here is either family content or a Studio-provided decorative
 * asset; a future `musulman`/`juif`/`hindou` A03 would be its own sibling
 * component (`DeathNoticeMusulman.tsx`, etc.) taking the exact same two
 * content props, never a fork inside this one. `DeathNoticePreviewStep.tsx`
 * is the ONE place that decides whether this component even gets
 * rendered for a given `memorial.skin` — see that component's own
 * docstring (Mission 039B "correction finale" — the skin guard).
 *
 * ## The extensible Runtime Split Pack envelope (Mission 039B
 * "intégration finale")
 *
 * `Studio fournit l'art ; Claude assemble` — this component no longer
 * reconstructs any papeterie itself (a flat CSS-tiled background, a
 * hand-drawn border/shadow, separately-composed botanicals or seal).
 * `.envelope` (module stylesheet) stacks exactly three Studio masters:
 *
 *   - `.envelopeTop`    — `runtimeTop`, fixed, rendered once, at its own
 *     natural 1448:1086 aspect ratio. NEVER stretched.
 *   - `.envelopeMiddle` — `runtimeMiddle`, `background-repeat: repeat-y`,
 *     filling however much vertical space the family's real content
 *     needs — see the module stylesheet's own docstring for how that
 *     height is derived without any JS measurement.
 *   - `.envelopeBottom` — `runtimeBottom`, fixed, rendered once, anchored
 *     to the sheet's own bottom edge. Carries the HERITAGE seal baked in
 *     — this component renders NO separate seal element anymore.
 *
 * `skinVariant` selects which complete set of three applies — a `light`
 * memorial NEVER mixes a `dark` master with a `light` one or vice versa
 * (`config/death-notice-intemporel-tokens.ts`'s own `Record<SkinVariant,
 * string>` shape makes a cross-variant mix a type error, not just a
 * convention). `.content` (the family's real text) renders ON TOP of
 * this envelope, positioned within its own safe padding so it never
 * overlaps the masters' own torn edges, botanicals, or seal.
 *
 * ## Modular precision blocks (AGENTS.md section 9)
 *
 * Each of A02's five precisions renders as its own block — icon, label,
 * family text — and is entirely absent, no reserved space, no empty
 * label, when the family never entered it. Blocks are grouped into rows
 * of (at most) two for the desktop/tablet two-column layout; on a narrow
 * viewport the same markup stacks to one column via CSS alone — see the
 * module's own stylesheet. This adapts to 1 through 5 precisions without
 * any asset-side change (AGENTS.md section 10). The five pictograms
 * themselves are UNCHANGED by this mission's integration — see this
 * file's own "precision icon" comment below and the tokens file's own
 * docstring for why.
 *
 * ## Dates (AGENTS.md section 7)
 *
 * Reuses `formatHeroDateRange` exactly as `HeroIntemporel` does — no
 * second date-formatting rule, no invented age-at-death.
 */
export interface DeathNoticeIntemporelProps {
  hero: HeroContent;
  deathNotice: DeathNoticeContent;
  editorialContext: EditorialContext;
  language: Language;
  skinVariant: SkinVariant;
}

const PRECISION_BLOCKS: readonly {
  field: DeathNoticePrecisionField;
  labelKey: TranslationKey;
  icon: string;
}[] = [
  {
    field: "generalLocation",
    labelKey: "deathNotice.blockLocation",
    icon: DEATH_NOTICE_INTEMPOREL_ASSETS.precisionIcons.generalLocation,
  },
  {
    field: "familyMessage",
    labelKey: "deathNotice.blockFamilyMessage",
    icon: DEATH_NOTICE_INTEMPOREL_ASSETS.precisionIcons.familyMessage,
  },
  {
    field: "thought",
    labelKey: "deathNotice.blockThought",
    icon: DEATH_NOTICE_INTEMPOREL_ASSETS.precisionIcons.thought,
  },
  {
    field: "quote",
    labelKey: "deathNotice.blockQuote",
    icon: DEATH_NOTICE_INTEMPOREL_ASSETS.precisionIcons.quote,
  },
  {
    field: "other",
    labelKey: "deathNotice.blockOther",
    icon: DEATH_NOTICE_INTEMPOREL_ASSETS.precisionIcons.other,
  },
];

interface VisiblePrecisionBlock {
  field: DeathNoticePrecisionField;
  labelKey: TranslationKey;
  icon: string;
  text: string;
}

/** Groups the currently-visible blocks into rows of (at most) two, in
 * the fixed canonical order above — the exact grouping the two-column
 * desktop layout renders, with mobile falling back to one column per
 * row via CSS alone (module stylesheet). A lone 5th (or 3rd, 1st...)
 * block simply ends up alone in its own row — never a reserved empty
 * cell beside it. */
function chunkIntoRows<T>(items: readonly T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size));
  }
  return rows;
}

export function DeathNoticeIntemporel({
  hero,
  deathNotice,
  editorialContext,
  language,
  skinVariant,
}: DeathNoticeIntemporelProps) {
  const dateRangeText = formatHeroDateRange(hero.birth, hero.death, language);
  const contextLabel = translate(
    language,
    editorialContext === "announcement" ? "context.announcementTitle" : "context.remembranceTitle",
  );

  const visibleBlocks: VisiblePrecisionBlock[] = PRECISION_BLOCKS.filter(
    (block) => deathNotice.precisions[block.field] !== null,
  ).map((block) => ({ ...block, text: deathNotice.precisions[block.field] as string }));

  const precisionRows = chunkIntoRows(visibleBlocks, 2);

  // The one place a `SkinVariant` picks WHICH complete Runtime Split
  // Pack asset set applies — see config/death-notice-intemporel-tokens.ts's
  // own docstring. Every one of these is a real Studio asset for its
  // variant, never a Light asset reused for Dark (or vice versa) — the
  // `Record<SkinVariant, string>` shape makes cross-variant mixing a
  // type error, not just a discipline.
  const topSrc = DEATH_NOTICE_INTEMPOREL_ASSETS.runtimeTop[skinVariant];
  const middleSrc = DEATH_NOTICE_INTEMPOREL_ASSETS.runtimeMiddle[skinVariant];
  const bottomSrc = DEATH_NOTICE_INTEMPOREL_ASSETS.runtimeBottom[skinVariant];
  const ornamentSrc = DEATH_NOTICE_INTEMPOREL_ASSETS.ornamentBranch[skinVariant];

  return (
    <SkinScope skin="intemporel" skinVariant={skinVariant}>
      <div className={`${styles.wrap} ${cormorantGaramond.variable}`}>
        <div className={styles.sheet}>
          {/* The entire artistic envelope — torn edges, layered papers,
              depth, peripheral botanicals, the HERITAGE seal — all baked
              into these three Studio masters. This component draws NONE
              of it itself (Mission 039B "intégration finale" section 2).
              `.envelope`'s own total height is driven by `.content`'s
              natural flow, one sibling below — see the module
              stylesheet's own docstring. */}
          <div className={styles.envelope} aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={topSrc} alt="" aria-hidden="true" className={styles.envelopeTop} />
            <div className={styles.envelopeMiddle} style={{ backgroundImage: `url(${middleSrc})` }} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={bottomSrc} alt="" aria-hidden="true" className={styles.envelopeBottom} />
          </div>

          <article className={styles.content}>
            <p className={styles.eyebrow}>{contextLabel}</p>
            <h1 className={styles.title}>{translate(language, "deathNotice.previewTitle")}</h1>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ornamentSrc} alt="" aria-hidden="true" className={styles.ornament} />

            <h2 className={styles.name}>{hero.displayName ?? ""}</h2>
            {dateRangeText !== null && <p className={styles.dates}>{dateRangeText}</p>}

            <div className={styles.divider} aria-hidden="true" />

            {deathNotice.announcementText !== null && (
              <p className={styles.announcement}>{deathNotice.announcementText}</p>
            )}

            {precisionRows.length > 0 && (
              <div className={styles.precisions}>
                {precisionRows.map((row) => (
                  <div key={row.map((block) => block.field).join("-")} className={styles.precisionRow}>
                    {row.map((block) => (
                      <div key={block.field} className={styles.precisionBlock}>
                        <div className={styles.precisionHeading}>
                          {/* A generic, single-color pictogram (the SAME
                              file in both variants — kept unchanged by
                              this mission, per its own README/doctrine),
                              tinted to the current ink color via a CSS
                              mask rather than a second (Dark) icon asset,
                              so it stays legible on either paper tone.
                              Never an <img>: a mask has no content of its
                              own to need alt text; the adjacent label
                              already carries it. */}
                          <span
                            aria-hidden="true"
                            className={styles.precisionIcon}
                            style={{
                              WebkitMaskImage: `url(${block.icon})`,
                              maskImage: `url(${block.icon})`,
                            }}
                          />
                          <span className={styles.precisionLabel}>{translate(language, block.labelKey)}</span>
                        </div>
                        <p className={styles.precisionText}>{block.text}</p>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </article>
        </div>
      </div>
    </SkinScope>
  );
}
