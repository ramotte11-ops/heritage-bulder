"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { MemorialContent } from "@/types/memorial";

export type DraftSaveResponse =
  | { status: "saved"; updatedAt: string; revision: number }
  | { status: "conflict" };

export type ConfigurationSaveResponse = { status: "saved" } | { status: "conflict" };

type LegacyDraftSaveResponse = { updatedAt: string; revision?: number };

export type DraftSaveTransport = (
  content: MemorialContent,
  expectedRevision: number,
) => Promise<DraftSaveResponse | LegacyDraftSaveResponse>;

export class DraftRevisionConflictError extends Error {
  readonly code = "DRAFT_REVISION_CONFLICT";

  constructor() {
    super("The memorial changed while this form was open.");
    this.name = "DraftRevisionConflictError";
  }
}

export function isDraftRevisionConflict(error: unknown): error is DraftRevisionConflictError {
  return error instanceof DraftRevisionConflictError;
}

interface DraftRevisionContextValue {
  conflictContent: MemorialContent | null;
  conflictDownloadValue: unknown;
  reportConflict(content?: MemorialContent, downloadValue?: unknown): void;
  save(content: MemorialContent, transport: DraftSaveTransport): Promise<{ updatedAt: string; revision: number }>;
  commit(
    content: MemorialContent | null,
    operation: (expectedRevision: number) => Promise<DraftSaveResponse | LegacyDraftSaveResponse>,
  ): Promise<{ updatedAt: string; revision: number }>;
}

const DraftRevisionContext = createContext<DraftRevisionContextValue | null>(null);

export function DraftRevisionProvider({
  initialRevision,
  initialContent,
  children,
}: {
  initialRevision: number;
  initialContent: MemorialContent;
  children: ReactNode;
}) {
  const revision = useRef(initialRevision);
  const conflict = useRef(false);
  const commitTail = useRef<Promise<void>>(Promise.resolve());
  const [conflictContent, setConflictContent] = useState<MemorialContent | null>(null);
  const [conflictDownloadValue, setConflictDownloadValue] = useState<unknown>(null);

  const markConflict = useCallback((content: MemorialContent, downloadValue: unknown = content) => {
    conflict.current = true;
    setConflictContent(content);
    setConflictDownloadValue(downloadValue);
  }, []);

  const commit = useCallback(
    (
      content: MemorialContent | null,
      operation: (expectedRevision: number) => Promise<DraftSaveResponse | LegacyDraftSaveResponse>,
    ): Promise<{ updatedAt: string; revision: number }> => {
      const pending = commitTail.current.then(async () => {
        if (conflict.current) throw new DraftRevisionConflictError();

        const result = await operation(revision.current);
        if ("status" in result && result.status === "conflict") {
          markConflict(content ?? initialContent);
          throw new DraftRevisionConflictError();
        }

        if (!("revision" in result) || result.revision === undefined) {
          throw new Error("The draft save did not return a revision.");
        }

        revision.current = result.revision;
        return { updatedAt: result.updatedAt, revision: result.revision };
      });

      // Keep same-tab writes FIFO, but let a failed caller observe its own
      // rejection without poisoning later queue bookkeeping.
      commitTail.current = pending.then(
        () => undefined,
        () => undefined,
      );
      return pending;
    },
    [initialContent, markConflict],
  );

  const value = useMemo<DraftRevisionContextValue>(
    () => ({
      conflictContent,
      conflictDownloadValue,
      reportConflict: (content = initialContent, downloadValue = content) =>
        markConflict(content, downloadValue),
      commit,
      save: (content, transport) => commit(content, (expectedRevision) => transport(content, expectedRevision)),
    }),
    [commit, conflictContent, conflictDownloadValue, initialContent, markConflict],
  );

  return <DraftRevisionContext.Provider value={value}>{children}</DraftRevisionContext.Provider>;
}

/**
 * Gives every draft-writing screen the same browser revision. The fallback
 * keeps isolated component tests and the local demo compatible; the real
 * Builder is always inside DraftRevisionProvider.
 */
export function useRevisionedDraftPersist(
  transport: DraftSaveTransport,
): (content: MemorialContent) => Promise<{ updatedAt: string; revision?: number }>;
export function useRevisionedDraftPersist(transport: undefined): undefined;
export function useRevisionedDraftPersist(
  transport: DraftSaveTransport | undefined,
): ((content: MemorialContent) => Promise<{ updatedAt: string; revision?: number }>) | undefined;
export function useRevisionedDraftPersist(
  transport: DraftSaveTransport | undefined,
): ((content: MemorialContent) => Promise<{ updatedAt: string; revision?: number }>) | undefined {
  const coordinator = useContext(DraftRevisionContext);
  const save = useCallback(
    async (content: MemorialContent) => {
      if (transport === undefined) throw new Error("Draft persistence is unavailable.");
      if (coordinator !== null) return coordinator.save(content, transport);

      // Isolated component tests use historical one-argument fakes.
      const result = await (transport as unknown as (
        value: MemorialContent,
      ) => Promise<DraftSaveResponse | { updatedAt: string }>)(content);
      if ("status" in result) {
        if (result.status === "conflict") throw new DraftRevisionConflictError();
        return { updatedAt: result.updatedAt, revision: result.revision };
      }
      return result;
    },
    [coordinator, transport],
  );
  return transport === undefined ? undefined : save;
}

export function useDraftRevisionCoordinator(): DraftRevisionContextValue | null {
  return useContext(DraftRevisionContext);
}
