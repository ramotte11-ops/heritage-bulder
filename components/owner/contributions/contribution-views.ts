import type { TranslationKey } from "@/lib/i18n/keys";
import type {
  getContributionSettings,
  getFamilyContributions,
  getPendingContributionCounts,
} from "@/lib/memorial/contributions/family-contribution-actions";

/**
 * Lot 3 — the family's contributions page: its four views and the result
 * shapes of the E5 Server Actions, derived from the actions themselves
 * (contract E5 § 1: `Awaited<ReturnType<…>>`, never a server module type).
 */
export const CONTRIBUTION_VIEWS = ["pending", "published", "hidden", "rejected"] as const;
export type ContributionView = (typeof CONTRIBUTION_VIEWS)[number];

/** Contributions read per page (E5 accepts 1 to 100). */
export const CONTRIBUTIONS_PAGE_SIZE = 20;

export type ContributionListResult = Awaited<ReturnType<typeof getFamilyContributions>>;
export type ContributionListOk = Extract<ContributionListResult, { status: "ok" }>;
export type FamilyContributionItem = ContributionListOk["items"][number];
export type ContributionCursor = ContributionListOk["nextCursor"];
export type ContributionSettingsResult = Awaited<ReturnType<typeof getContributionSettings>>;
export type PendingCountsResult = Awaited<ReturnType<typeof getPendingContributionCounts>>;

export function isContributionView(value: unknown): value is ContributionView {
  return typeof value === "string" && (CONTRIBUTION_VIEWS as readonly string[]).includes(value);
}

export const VIEW_LABELS: Record<ContributionView, TranslationKey> = {
  pending: "owner.contribViewPending",
  published: "owner.contribViewPublished",
  hidden: "owner.contribViewHidden",
  rejected: "owner.contribViewRejected",
};

export const VIEW_EMPTY: Record<ContributionView, TranslationKey> = {
  pending: "owner.contribEmptyPending",
  published: "owner.contribEmptyPublished",
  hidden: "owner.contribEmptyHidden",
  rejected: "owner.contribEmptyRejected",
};

export const STATUS_LABELS: Record<ContributionView, TranslationKey> = {
  pending: "owner.contribStatusPending",
  published: "owner.contribStatusPublished",
  hidden: "owner.contribStatusHidden",
  rejected: "owner.contribStatusRejected",
};

export const TYPE_LABELS: Record<FamilyContributionItem["type"], TranslationKey> = {
  condolence: "owner.contribTypeCondolence",
  testimonial: "owner.contribTypeTestimonial",
  photo: "owner.contribTypePhoto",
  memory_message: "owner.contribTypeMemory",
};

export type ModerationAction = "approve" | "reject" | "hide" | "unhide";

/**
 * The actions the family is offered — exactly the E5 transitions retained
 * by the PO (mission Lot 3 § C). `memory_message` (QG 008) stays read-only;
 * a declined contribution only shows its status.
 */
export function allowedActions(item: Pick<FamilyContributionItem, "type" | "status">): {
  moderate: ModerationAction[];
  canDelete: boolean;
} {
  if (item.type === "memory_message") return { moderate: [], canDelete: false };
  switch (item.status) {
    case "pending":
      return { moderate: ["approve", "reject"], canDelete: false };
    case "published":
      return { moderate: ["hide"], canDelete: true };
    case "hidden":
      return { moderate: ["unhide"], canDelete: true };
    default:
      return { moderate: [], canDelete: false };
  }
}
