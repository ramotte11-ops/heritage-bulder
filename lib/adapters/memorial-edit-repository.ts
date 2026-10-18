import type { Language } from "@/config/languages";
import type { SkinVariant } from "@/config/skins";
import type { Skin } from "@/config/skins";
import type { MemorialContent, MemorialStatus } from "@/types/memorial";

export interface MemorialEditSnapshot {
  status: MemorialStatus;
  firstPublishedAt: string | null;
  language: Language | null;
  skin: Skin;
  skinVariant: SkinVariant;
  draft: {
    content: MemorialContent;
    updatedAt: string;
    revision: number;
  };
}

export interface DraftEditCommit {
  memorialId: string;
  ownerId: string;
  expectedRevision: number;
  expectedStatus: MemorialStatus;
  expectedFirstPublishedAt: string | null;
  content: MemorialContent;
  operation: "content.saved" | "visibility.changed";
  mutationTargets: readonly string[];
}

export interface ConfigurationEditCommit {
  memorialId: string;
  ownerId: string;
  expectedStatus: MemorialStatus;
  expectedFirstPublishedAt: string | null;
  target: "language" | "skinVariant";
  expectedValue: string | null;
  value: string;
  mutationTargets: readonly string[];
}

export interface MemorialEditRepository {
  load(memorialId: string): Promise<MemorialEditSnapshot | null>;
  commitDraft(input: DraftEditCommit): Promise<{ updatedAt: string; revision: number }>;
  commitConfiguration(input: ConfigurationEditCommit): Promise<void>;
}

export class MemorialEditConflictError extends Error {
  readonly code = "MEMORIAL_EDIT_CONFLICT";

  constructor() {
    super("This memorial changed while you were editing. Reload and try again.");
    this.name = "MemorialEditConflictError";
  }
}
