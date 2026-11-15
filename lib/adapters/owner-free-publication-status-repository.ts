/**
 * QG 017 A2 — the database is the sole authority for the account's free
 * publication right. `unknown` is deliberate: the family must never see an
 * inferred answer when the official read is unavailable or malformed.
 */
export type OwnerFreePublicationStatus =
  | {
      status: "window_open";
      windowUntil: string;
      activeFreeDrafts: number;
      maxFreeDrafts: number;
    }
  | {
      status: "opens_on_next_save";
      activeFreeDrafts: number;
      maxFreeDrafts: number;
    }
  | {
      status: "used" | "expired";
      renewsAt: string | null;
      activeFreeDrafts: number;
      maxFreeDrafts: number;
    }
  | { status: "unknown" };

export const UNKNOWN_OWNER_FREE_PUBLICATION_STATUS: OwnerFreePublicationStatus = {
  status: "unknown",
};

export interface OwnerFreePublicationStatusRepository {
  /** `ownerId` comes only from the server-validated Heritage actor. */
  read(ownerId: string): Promise<OwnerFreePublicationStatus>;
}
