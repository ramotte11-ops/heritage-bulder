import { describe, expect, it } from "vitest";
import type { MemorialContent } from "@/types/memorial";
import { commitA06, writeCeremonyVenueName } from "@/lib/builder/guided-flow/ceremony-step";
import { saveTextThenStep } from "./save-text-then-step";
import { ConflictError, InMemoryEditRepository } from "./in-memory-edit-repository.test-helper";

/** Mission 04-J — the combined server logic against an in-memory RPC contract. */

const STORED = {
  hero: { displayName: "Jean Dupont", birth: null, death: null, shortPhrase: null, photo: null },
  guidedFlow: { A04: { status: "completed", answer: "yes" }, A05: { status: "skipped" } },
  ceremony: { date: null, time: null, venueName: null, address: null, access: null, note: null },
  presentation: { hiddenSections: ["gallery"] },
} as unknown as MemorialContent;

function ok<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  if (!result.ok) throw new Error("fixture");
  return result as Extract<T, { ok: true }>;
}

/** What the browser sends: its copy (WITHOUT the stored presentation), typed text, and the step. */
const BROWSER_COPY = { ...STORED } as Record<string, unknown>;
delete BROWSER_COPY.presentation;
const TEXT = ok(writeCeremonyVenueName(BROWSER_COPY as MemorialContent, "Église Saint-Martin")).content;
const FINAL = ok(commitA06(TEXT)).content;

const venueOf = (c: MemorialContent) => (c as { ceremony: { venueName: string | null } }).ceremony.venueName;
const a06Of = (c: MemorialContent) => (c as { guidedFlow: { A06?: unknown } }).guidedFlow.A06;
const presentationOf = (c: MemorialContent) => (c as { presentation?: unknown }).presentation;

function setup(revision = 7) {
  const repository = new InMemoryEditRepository(STORED, revision);
  const run = (expectedRevision = 7) =>
    saveTextThenStep({
      repository,
      access: { memorialId: "m-1", ownerId: "o-1" },
      text: TEXT,
      final: FINAL,
      expectedRevision,
    });
  return { repository, run };
}

describe("Mission 04-J — two historical writes, one request", () => {
  it("full success: write 1 (text, rev 7) THEN write 2 (step, rev 8) — two separate commits, both reported", async () => {
    const { repository, run } = setup();
    const response = await run();

    expect(repository.commits.map((c) => c.expectedRevision)).toEqual([7, 8]);
    expect(venueOf(repository.commits[0].content)).toBe("Église Saint-Martin");
    expect(a06Of(repository.commits[0].content)).toBeUndefined();
    expect(a06Of(repository.commits[1].content)).toEqual({ status: "completed" });
    expect(response).toEqual({
      status: "done",
      text: { status: "saved", updatedAt: "2026-01-01T00:00:08.000Z", revision: 8 },
      step: { status: "saved", updatedAt: "2026-01-01T00:00:09.000Z", revision: 9 },
    });
    expect(repository.revision).toBe(9);
  });

  it("each write keeps the STORED presentation, exactly like saveDraftAction", async () => {
    const { repository, run } = setup();
    await run();
    for (const commit of repository.commits) expect(presentationOf(commit.content)).toEqual({ hiddenSections: ["gallery"] });
  });

  it("each write carries its own server-computed audit targets (the diff of that write only)", async () => {
    const { repository, run } = setup();
    await run();
    expect(repository.commits[0].mutationTargets.some((t) => t.includes("ceremony"))).toBe(true);
    expect(repository.commits[1].mutationTargets.some((t) => t.includes("guidedFlow"))).toBe(true);
    expect(repository.commits[0].operation).toBe("content.saved");
    expect(repository.commits[1].operation).toBe("content.saved");
  });
});

describe("Mission 04-J — partial failure: write 1 kept, write 2 refused or interrupted", () => {
  it("write 2 refused by the revision check: the text STAYS saved, the step is not validated", async () => {
    const { repository, run } = setup();
    repository.inject(2, "before", () => new ConflictError());
    const response = await run();

    expect(response).toMatchObject({ text: { status: "saved", revision: 8 }, step: { status: "conflict" } });
    expect(venueOf(repository.content)).toBe("Église Saint-Martin");
    expect(a06Of(repository.content)).toBeUndefined();
    expect(repository.revision).toBe(8);
  });

  it("write 2 interrupted (network / database error): the text STAYS saved, the step reports « failed »", async () => {
    const { repository, run } = setup();
    repository.inject(2, "before", () => new Error("connection reset"));
    const response = await run();

    expect(response).toMatchObject({ text: { status: "saved", revision: 8 }, step: { status: "failed" } });
    expect(venueOf(repository.content)).toBe("Église Saint-Martin");
    expect(a06Of(repository.content)).toBeUndefined();
  });

  it("write 1 refused by the revision check: nothing written, write 2 never attempted", async () => {
    const { repository, run } = setup();
    repository.inject(1, "before", () => new ConflictError());
    const response = await run();

    expect(response).toEqual({ status: "done", text: { status: "conflict" }, step: { status: "notAttempted" } });
    expect(repository.commits).toEqual([]);
  });

  it("write 1 failing otherwise: the request fails as a whole, nothing written (the RPC is atomic)", async () => {
    const { repository, run } = setup();
    repository.inject(1, "before", () => new Error("connection reset"));
    await expect(run()).rejects.toThrow("connection reset");
    expect(repository.commits).toEqual([]);
    expect(repository.content).toBe(STORED);
  });
});

describe("Mission 04-J — a lost response is reconciled, never replayed", () => {
  it("both writes done, answer lost: the retry with the SAME revision writes NOTHING and answers « saved »", async () => {
    const { repository, run } = setup();
    await run(); // the browser never sees this answer
    const retry = await run(7);

    expect(repository.commits).toHaveLength(2); // no double validation
    expect(retry).toMatchObject({
      text: { status: "saved", revision: 9, reconciled: true },
      step: { status: "saved", revision: 9, reconciled: true },
    });
  });

  it("only write 1 done (crash between the writes), answer lost: the retry runs write 2 ONLY", async () => {
    const { repository, run } = setup();
    repository.inject(2, "before", () => new Error("server crashed"));
    await run(); // text saved, step failed — and the browser never sees it
    const retry = await run(7);

    expect(repository.commits.map((c) => c.expectedRevision)).toEqual([7, 8]);
    expect(a06Of(repository.commits[1].content)).toEqual({ status: "completed" });
    expect(retry).toMatchObject({ text: { status: "saved", reconciled: true }, step: { status: "saved", revision: 9 } });
  });

  it("write 2 applied but its answer lost inside the server: the retry sees the final content and writes nothing", async () => {
    const { repository, run } = setup();
    repository.inject(2, "after", () => new Error("timeout after commit"));
    const first = await run();
    expect(first).toMatchObject({ step: { status: "failed" } }); // honest: unconfirmed, never « saved »
    const retry = await run(7);
    expect(repository.commits).toHaveLength(2);
    expect(retry).toMatchObject({ step: { status: "saved", reconciled: true } });
  });

  it("somebody else wrote other content meanwhile: conflict, nothing written, nothing overwritten", async () => {
    const { repository, run } = setup();
    repository.content = ok(writeCeremonyVenueName(STORED, "Autre lieu (autre appareil)")).content;
    repository.revision = 8;
    const response = await run(7);

    expect(response).toEqual({ status: "done", text: { status: "conflict" }, step: { status: "notAttempted" } });
    expect(repository.commits).toEqual([]);
    expect(venueOf(repository.content)).toBe("Autre lieu (autre appareil)");
  });

  it("an older expected revision can never overwrite a newer draft", async () => {
    const { repository, run } = setup();
    await run(); // now at 9
    repository.content = ok(writeCeremonyVenueName(repository.content, "Lieu corrigé ensuite")).content;
    repository.revision = 10;
    const stale = await run(7);

    expect(stale).toMatchObject({ text: { status: "conflict" } });
    expect(venueOf(repository.content)).toBe("Lieu corrigé ensuite");
    expect(repository.commits).toHaveLength(2);
  });
});

describe("Mission 04-J — publication and audit", () => {
  it("a published memorial: « unsupported », nothing written, no audit event — the browser keeps the historical path", async () => {
    const { repository, run } = setup();
    repository.firstPublishedAt = "2026-10-01T10:00:00.000Z";
    repository.status = "published";

    expect(await run()).toEqual({ status: "unsupported" });
    expect(repository.commits).toEqual([]);
    expect(repository.audit).toEqual([]);
  });

  it("before publication: no audit event, exactly like the historical two requests", async () => {
    const { repository, run } = setup();
    await run();
    expect(repository.audit).toEqual([]);
  });

  it("published between the read and the write: refused by the commit's lifecycle check, nothing written", async () => {
    const { repository, run } = setup();
    const load = repository.load.bind(repository);
    repository.load = async () => {
      const snapshot = await load();
      repository.firstPublishedAt = "2026-10-01T10:00:00.000Z"; // published right after the read
      repository.status = "published";
      return snapshot;
    };
    const response = await run();
    expect(response).toMatchObject({ text: { status: "conflict" } });
    expect(repository.commits).toEqual([]);
    expect(repository.audit).toEqual([]);
  });
});

describe("Mission 04-K — lost responses, case by case (revision-bounded identity)", () => {
  it("1. write 1 done, its answer lost (crash before write 2): the retry runs write 2 ONLY", async () => {
    const { repository, run } = setup();
    repository.inject(2, "before", () => new Error("crash"));
    await run();
    expect(repository.commits.map((c) => c.expectedRevision)).toEqual([7]);

    const retry = await run(7);
    expect(repository.commits.map((c) => c.expectedRevision)).toEqual([7, 8]);
    expect(retry).toMatchObject({ text: { status: "saved", revision: 8, reconciled: true }, step: { status: "saved", revision: 9 } });
  });

  it("2. write 2 done, its answer lost inside the server: the retry writes nothing and confirms both", async () => {
    const { repository, run } = setup();
    repository.inject(2, "after", () => new Error("timeout after commit"));
    expect(await run()).toMatchObject({ step: { status: "failed" } });

    const retry = await run(7);
    expect(repository.commits).toHaveLength(2);
    expect(retry).toMatchObject({ text: { status: "saved", revision: 9 }, step: { status: "saved", revision: 9, reconciled: true } });
  });

  it("3. both writes done, the final answer lost: the retry writes nothing (no double validation)", async () => {
    const { repository, run } = setup();
    await run();
    const retry = await run(7);
    expect(repository.commits).toHaveLength(2);
    expect(retry).toMatchObject({ step: { status: "saved", reconciled: true } });
  });

  it("4a. answer lost, then another tab changed the venue: conflict, nothing written, the other tab's text kept", async () => {
    const { repository, run } = setup();
    await run(); // now 9
    repository.content = ok(writeCeremonyVenueName(repository.content, "Corrigé dans un autre onglet")).content;
    repository.revision = 10;

    expect(await run(7)).toMatchObject({ text: { status: "conflict" }, step: { status: "notAttempted" } });
    expect(repository.commits).toHaveLength(2);
    expect(venueOf(repository.content)).toBe("Corrigé dans un autre onglet");
  });

  it("4b. answer lost, then another writer stored IDENTICAL content at a later revision: still a conflict (identity is not equality)", async () => {
    const { repository, run } = setup();
    await run(); // 9, final content
    repository.revision = 10; // same content, written again by someone else

    expect(await run(7)).toMatchObject({ text: { status: "conflict" } });
    expect(repository.commits).toHaveLength(2);
  });

  it("4c. write 1 done, answer lost, then another writer stored the same text at r+2: conflict, write 2 NOT run on top", async () => {
    const { repository, run } = setup();
    repository.inject(2, "before", () => new Error("crash"));
    await run(); // 8, text
    repository.revision = 9; // someone else wrote (the same text) meanwhile

    expect(await run(7)).toMatchObject({ text: { status: "conflict" } });
    expect(repository.commits).toHaveLength(1);
    expect(a06Of(repository.content)).toBeUndefined();
  });

  it("5. repeated retries after an uncertain result stay idempotent: no write, same confirmed revision", async () => {
    const { repository, run } = setup();
    await run();
    const first = await run(7);
    const second = await run(7);
    expect(repository.commits).toHaveLength(2);
    expect(first).toEqual(second);
  });
});

describe("Mission 04-K — partial failure and revisions", () => {
  it("text saved, step failed: the retry from the TEXT revision does not rewrite the text (write 1 is a no-op)", async () => {
    const { repository, run } = setup();
    repository.inject(2, "before", () => new Error("connection reset"));
    expect(await run(7)).toMatchObject({ text: { status: "saved", revision: 8 }, step: { status: "failed" } });

    const retry = await run(8); // the browser follows the text revision
    expect(repository.commits.map((c) => c.expectedRevision)).toEqual([7, 8]); // exactly one more write: the step
    expect(retry).toMatchObject({ text: { status: "saved", revision: 8 }, step: { status: "saved", revision: 9 } });
  });

  it("published BETWEEN the two writes: the text stays, the step is refused by the commit's lifecycle check, no audit event", async () => {
    const { repository, run } = setup();
    const commitDraft = repository.commitDraft.bind(repository);
    let calls = 0;
    repository.commitDraft = async (input) => {
      calls += 1;
      if (calls === 2) {
        repository.firstPublishedAt = "2026-10-01T10:00:00.000Z";
        repository.status = "published";
      }
      return commitDraft(input);
    };
    const response = await run();

    expect(response).toMatchObject({ text: { status: "saved", revision: 8 }, step: { status: "conflict" } });
    expect(venueOf(repository.content)).toBe("Église Saint-Martin");
    expect(a06Of(repository.content)).toBeUndefined();
    expect(repository.audit).toEqual([]); // write 1 before publication: none; write 2 not written
  });
});
