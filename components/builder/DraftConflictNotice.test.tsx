// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MemorialContent } from "@/types/memorial";
import {
  DraftRevisionProvider,
  useDraftRevisionCoordinator,
} from "@/lib/builder/draft-revision";
import { DraftConflictNotice } from "./DraftConflictNotice";

const INITIAL = { hero: { displayName: "Jeanne" } } as MemorialContent;
const LOCAL = { hero: { displayName: "Jeanne Martin" } } as MemorialContent;

function ConflictTrigger() {
  const coordinator = useDraftRevisionCoordinator();
  return (
    <button type="button" onClick={() => coordinator?.reportConflict(LOCAL)}>
      Simuler le conflit
    </button>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("DraftConflictNotice", () => {
  it("keeps the local form mounted and requires confirmation before a manual reload", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);

    render(
      <DraftRevisionProvider initialRevision={3} initialContent={INITIAL}>
        <DraftConflictNotice language="fr" />
        <ConflictTrigger />
        <input aria-label="Nom local" defaultValue="Jeanne Martin" />
      </DraftRevisionProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Simuler le conflit" }));

    expect(screen.getByRole("alert").textContent).toContain("ne sont pas enregistrées");
    expect(screen.getByDisplayValue("Jeanne Martin")).not.toBeNull();
    expect(screen.getByRole("button", { name: /Télécharger mes modifications/ })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Recharger la version enregistrée/ }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.getByDisplayValue("Jeanne Martin")).not.toBeNull();
  });
});
