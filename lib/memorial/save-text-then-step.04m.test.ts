import { describe, expect, it } from "vitest";
import type { MemorialContent } from "@/types/memorial";
import { commitA06, skipA06, writeCeremonyVenueName } from "@/lib/builder/guided-flow/ceremony-step";
import { changedMemorialContentMutations, memorialContentEqual } from "./edit-mutations";
import { commitAuthorizedDraftEdit } from "./persist-edit";
import { withStoredPresentation } from "./section-visibility";
import { saveTextThenStep, type TextThenStepAttempt, type TextThenStepResponse } from "./save-text-then-step";
import { ConflictError, InMemoryEditRepository } from "./in-memory-edit-repository.test-helper";

/**
 * Mission 04-M — targeted control: `attempt: "retry"` is a CLAIM made by
 * the browser, never verified by the server. These tests show that a
 * forged « retry » gains nothing over the historical save contract
 * (saveDraftAction, app/builder/[memorialId]/actions.ts): no old write
 * over a newer version, no extra validation, no privilege, no
 * confirmation of a state that is not stored. Fictitious data only.
 */

const ACCESS = { memorialId: "m-1", ownerId: "o-1" };
const BASE = {
  hero: { displayName: "Jean Dupont", birth: null, death: null, shortPhrase: null, photo: null },
  guidedFlow: { A04: { status: "completed", answer: "yes" }, A05: { status: "skipped" } },
  ceremony: { date: null, time: null, venueName: null, address: null, access: null, note: null },
} as unknown as MemorialContent;

function ok<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  if (!result.ok) throw new Error("fixture");
  return result as Extract<T, { ok: true }>;
}
const venue = (c: MemorialContent, v: string) => ok(writeCeremonyVenueName(c, v)).content;
const TEXT = venue(BASE, "Église Saint-Martin");
const FINAL = ok(commitA06(TEXT)).content;
const SKIP = ok(skipA06(TEXT)).content;
const OTHER = venue(BASE, "Temple de l'Oratoire (autre onglet)");
const OTHER_FINAL = ok(commitA06(OTHER)).content;

const venueOf = (c: MemorialContent) => (c as { ceremony: { venueName: string | null } }).ceremony.venueName;

/** saveDraftAction's own decisions against a repository. */
async function historicalSave(repository: InMemoryEditRepository, content: MemorialContent, expectedRevision: number) {
  const snapshot = await repository.load();
  const next = withStoredPresentation(content, snapshot.draft.content);
  try {
    const written = await commitAuthorizedDraftEdit({
      repository,
      access: ACCESS,
      snapshot,
      expectedRevision,
      content: next,
      operation: "content.saved",
      mutations: changedMemorialContentMutations(snapshot.draft.content, next),
    });
    return { status: "saved" as const, ...written };
  } catch (error) {
    if (error instanceof ConflictError) return { status: "conflict" as const };
    throw error;
  }
}

function run(repository: InMemoryEditRepository, text: MemorialContent, final: MemorialContent, expectedRevision: number, attempt: TextThenStepAttempt) {
  return saveTextThenStep({ repository, access: ACCESS, text, final, expectedRevision, attempt });
}

const stepSaved = (r: TextThenStepResponse) => r.status === "done" && r.step.status === "saved";

/**
 * Every stored state a request can meet, every expected revision a forger
 * can choose (including the r+1 / r+2 window, on purpose), every request.
 */
const STORED_STATES: Array<[string, MemorialContent]> = [
  ["vierge", BASE],
  ["texte", TEXT],
  ["texte+étape", FINAL],
  ["texte+passé", SKIP],
  ["autre texte", OTHER],
  ["autre texte+étape", OTHER_FINAL],
];
const REQUESTS: Array<[string, MemorialContent, MemorialContent]> = [
  ["texte → étape", TEXT, FINAL],
  ["texte → passer", TEXT, SKIP],
  ["texte+étape → texte+étape (déjà validé)", FINAL, ok(commitA06(FINAL)).content],
  ["vierge → contenu arbitraire", BASE, OTHER_FINAL],
];
const STORED_REVISION = 10;
const EXPECTED = [0, 5, 7, 8, 9, 10, 11, 1_000_000];

const matrix = STORED_STATES.flatMap(([storedName, stored]) =>
  REQUESTS.flatMap(([requestName, text, final]) =>
    EXPECTED.map((expected) => ({ storedName, stored, requestName, text, final, expected })),
  ),
);

describe("Mission 04-M — scénario 1 : une première requête FRAUDULEUSEMENT marquée « retry »", () => {
  it.each(matrix)(
    "stocké « $storedName » (rév. 10), requête « $requestName », révision attendue $expected : rien de plus que le contrat historique",
    async ({ stored, text, final, expected }) => {
      const repository = new InMemoryEditRepository(stored, STORED_REVISION);
      const response = await run(repository, text, final, expected, "retry");

      // (a) Never an old write over a newer version: every commit is made
      //     on the revision the server JUST read, and only over a stored
      //     draft that is exactly the request's own text (or, at the exact
      //     expected revision, the normal CAS write).
      for (const commit of repository.commits) {
        expect(commit.expectedRevision).toBeGreaterThanOrEqual(STORED_REVISION);
      }
      if (expected !== STORED_REVISION && repository.commits.length > 0) {
        expect(memorialContentEqual(stored, withStoredPresentation(text, stored))).toBe(true);
        expect(repository.commits).toHaveLength(1); // write 2 only — the text is never rewritten
      }
      // (b) No extra validation: at most the two historical writes; and in
      //     the retry branch (revision ≠ expected), none at all when the
      //     requested final content is already stored. At the exact
      //     revision, « retry » is « first » (see the next test), i.e. the
      //     two historical writes, decision for decision.
      expect(repository.commits.length).toBeLessThanOrEqual(2);
      if (expected !== STORED_REVISION && memorialContentEqual(stored, withStoredPresentation(final, stored))) {
        expect(repository.commits).toHaveLength(0);
      }
      if (expected === STORED_REVISION) {
        const twin = new InMemoryEditRepository(stored, STORED_REVISION);
        const h = await historicalSave(twin, text, expected);
        if (h.status === "saved") await historicalSave(twin, final, h.revision);
        expect(repository.commits.length).toBe(twin.commits.length);
        expect(repository.content).toEqual(twin.content);
      }
      // (c) No false confirmation: « step saved » ⇒ the stored draft IS the
      //     requested final content, right now.
      if (stepSaved(response)) expect(memorialContentEqual(repository.content, withStoredPresentation(final, stored))).toBe(true);
      // (d) Never more than the historical contract: whatever « retry »
      //     confirms or writes, saveDraftAction(text, e) then
      //     saveDraftAction(final, returned revision) — or the re-sent final
      //     write saveDraftAction(final, e) — reaches the same stored state.
      if (stepSaved(response)) {
        const viaText = new InMemoryEditRepository(stored, STORED_REVISION);
        const first = await historicalSave(viaText, text, expected);
        const h1 = first.status === "saved" ? await historicalSave(viaText, final, first.revision) : first;
        const viaFinal = new InMemoryEditRepository(stored, STORED_REVISION);
        const h2 = await historicalSave(viaFinal, final, expected);
        const reached = [
          h1.status === "saved" ? viaText.content : null,
          h2.status === "saved" ? viaFinal.content : null,
        ].filter((c): c is MemorialContent => c !== null);
        expect(reached.some((c) => memorialContentEqual(c, repository.content))).toBe(true);
      }
    },
  );

  it("à la révision attendue exacte, « retry » et « first » sont strictement identiques (même code, mêmes écritures, même réponse)", async () => {
    for (const [, stored] of STORED_STATES) {
      for (const [, text, final] of REQUESTS) {
        const a = new InMemoryEditRepository(stored, STORED_REVISION);
        const b = new InMemoryEditRepository(stored, STORED_REVISION);
        expect(await run(a, text, final, STORED_REVISION, "retry")).toEqual(await run(b, text, final, STORED_REVISION, "first"));
        expect(a.commits).toEqual(b.commits);
        expect(a.content).toEqual(b.content);
      }
    }
  });

  it("une révision attendue choisie dans la fenêtre (r-1, r-2) ne permet pas d'écraser une autre version : conflit, rien d'écrit", async () => {
    for (const expected of [8, 9]) {
      const repository = new InMemoryEditRepository(OTHER, STORED_REVISION);
      expect(await run(repository, TEXT, FINAL, expected, "retry")).toMatchObject({ text: { status: "conflict" }, step: { status: "notAttempted" } });
      expect(repository.commits).toHaveLength(0);
      expect(venueOf(repository.content)).toBe("Temple de l'Oratoire (autre onglet)");
    }
  });

  it("un hommage publié : « retry » ne change rien — « unsupported », aucune écriture, aucun audit", async () => {
    const repository = new InMemoryEditRepository(FINAL, STORED_REVISION);
    repository.status = "published";
    repository.firstPublishedAt = "2026-10-01T10:00:00.000Z";
    for (const expected of [8, 9, 10]) {
      expect(await run(repository, TEXT, FINAL, expected, "retry")).toEqual({ status: "unsupported" });
    }
    expect(repository.commits).toEqual([]);
    expect(repository.audit).toEqual([]);
  });
});

describe("Mission 04-M — scénarios 2 à 6", () => {
  it("2. autre onglet, contenu IDENTIQUE : « first » = conflit (comme saveDraftAction(texte)) ; « retry » confirme l'ÉTAT sans écrire — comme saveDraftAction(final) renvoyé, et sans preuve d'auteur", async () => {
    const first = new InMemoryEditRepository(FINAL, 9);
    expect(await run(first, TEXT, FINAL, 7, "first")).toMatchObject({ text: { status: "conflict" } });
    expect(await historicalSave(new InMemoryEditRepository(FINAL, 9), TEXT, 7)).toEqual({ status: "conflict" });

    const retry = new InMemoryEditRepository(FINAL, 9);
    expect(await run(retry, TEXT, FINAL, 7, "retry")).toMatchObject({ text: { reconciled: true }, step: { status: "saved", revision: 9 } });
    expect(retry.commits).toHaveLength(0);
    // Historical: the browser re-sending its final write gets the same confirmation (empty diff).
    expect(await historicalSave(new InMemoryEditRepository(FINAL, 9), FINAL, 7)).toMatchObject({ status: "saved", revision: 9 });
  });

  it("3. révision avancée par une opération concurrente PENDANT la reprise (entre la lecture et l'écriture 2) : conflit, la version concurrente est conservée", async () => {
    const repository = new InMemoryEditRepository(TEXT, 8); // write 1 of the lost operation was done
    const commitDraft = repository.commitDraft.bind(repository);
    repository.commitDraft = async (input) => {
      repository.content = OTHER;
      repository.revision += 1; // concurrent writer lands first
      return commitDraft(input);
    };
    expect(await run(repository, TEXT, FINAL, 7, "retry")).toMatchObject({ text: { status: "saved", reconciled: true }, step: { status: "conflict" } });
    expect(repository.commits).toHaveLength(0);
    expect(repository.content).toEqual(OTHER);
  });

  it("3b. révision avancée par une opération concurrente AVANT la reprise : conflit, rien d'écrit", async () => {
    const repository = new InMemoryEditRepository(BASE, 7);
    await run(repository, TEXT, FINAL, 7, "first"); // 9, answer lost
    expect((await historicalSave(repository, OTHER_FINAL, 9)).status).toBe("saved"); // 10, other tab
    expect(await run(repository, TEXT, FINAL, 7, "retry")).toMatchObject({ text: { status: "conflict" } });
    expect(repository.commits).toHaveLength(3);
    expect(repository.content).toEqual(OTHER_FINAL);
  });

  it("4. réponse réellement perdue (après l'écriture 1 seule, puis après les deux) : la reprise légitime termine sans réécrire", async () => {
    const afterText = new InMemoryEditRepository(BASE, 7);
    afterText.inject(2, "before", () => new Error("crash"));
    await run(afterText, TEXT, FINAL, 7, "first");
    expect(await run(afterText, TEXT, FINAL, 7, "retry")).toMatchObject({ step: { status: "saved", revision: 9 } });
    expect(afterText.commits.map((c) => c.expectedRevision)).toEqual([7, 8]);

    const afterBoth = new InMemoryEditRepository(BASE, 7);
    afterBoth.inject(2, "after", () => new Error("timeout after commit"));
    await run(afterBoth, TEXT, FINAL, 7, "first");
    expect(await run(afterBoth, TEXT, FINAL, 7, "retry")).toMatchObject({ step: { status: "saved", revision: 9 } });
    expect(afterBoth.commits).toHaveLength(2);
  });

  it("5. rejouer une validation déjà effectuée, autant de fois qu'on veut, « first » ou « retry », à toute révision ANCIENNE : aucune écriture de plus", async () => {
    const repository = new InMemoryEditRepository(BASE, 7);
    await run(repository, TEXT, FINAL, 7, "first");
    for (const attempt of ["first", "retry"] as const) {
      for (const expected of [0, 6, 7, 8, 10]) {
        const response = await run(repository, TEXT, FINAL, expected, attempt);
        expect(["conflict", "saved"]).toContain(response.status === "done" ? response.text.status : "x");
      }
    }
    expect(repository.commits).toHaveLength(2);
    expect(repository.revision).toBe(9);
  });

  it("5b. à la révision COURANTE, un texte sans l'étape est une nouvelle opération : deux écritures, exactement comme saveDraftAction ×2 — indépendant de « retry »", async () => {
    for (const attempt of ["first", "retry"] as const) {
      const repository = new InMemoryEditRepository(FINAL, 9);
      await run(repository, TEXT, FINAL, 9, attempt);
      const twin = new InMemoryEditRepository(FINAL, 9);
      const h = await historicalSave(twin, TEXT, 9);
      if (h.status === "saved") await historicalSave(twin, FINAL, h.revision);
      expect(repository.commits).toEqual(twin.commits);
      expect(repository.content).toEqual(twin.content);
    }
  });

  it("6. droits retirés entre deux opérations (revérification du propriétaire par la fonction, 42501) : rien d'écrit, jamais « saved » pour l'étape", async () => {
    const refused = () => Object.assign(new Error("memorial edit refused"), { code: "42501" });
    const repository = new InMemoryEditRepository(BASE, 7);
    repository.inject(2, "before", () => new Error("crash"));
    await run(repository, TEXT, FINAL, 7, "first"); // text stored (8), step lost
    repository.inject(3, "before", refused); // ownership removed before the retry's write
    expect(await run(repository, TEXT, FINAL, 7, "retry")).toMatchObject({ step: { status: "failed" } });
    expect(repository.commits).toHaveLength(1);
  });
});
