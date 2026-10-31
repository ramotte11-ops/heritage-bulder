// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PreviewFlushRegistryContext, createPreviewFlushRegistry } from "@/lib/builder/preview-flush-registry";
import { GuestDurableSaveEntry, durableSaveHref } from "./GuestDurableSaveEntry";

afterEach(cleanup);

describe("QG 008 Lot 2 — GuestDurableSaveEntry", () => {
  it("drains the local autosave BEFORE leaving for the durable save, in the family's language", async () => {
    const registry = createPreviewFlushRegistry();
    const order: string[] = [];
    registry.register(async () => { order.push("flush"); });
    const navigate = vi.fn((href: string) => order.push(`navigate:${href}`));
    render(
      <PreviewFlushRegistryContext.Provider value={registry}>
        <GuestDurableSaveEntry language="es" navigate={navigate} />
      </PreviewFlushRegistryContext.Provider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Guardar mi homenaje" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledOnce());
    expect(order).toEqual(["flush", "navigate:/brouillon/sauvegarder?langue=es"]);
  });

  it("stays on the Builder if the local save fails", async () => {
    const registry = createPreviewFlushRegistry();
    registry.register(async () => { throw new Error("quota"); });
    const navigate = vi.fn();
    render(
      <PreviewFlushRegistryContext.Provider value={registry}>
        <GuestDurableSaveEntry language="fr" navigate={navigate} />
      </PreviewFlushRegistryContext.Provider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer mon hommage" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Enregistrer mon hommage" }).hasAttribute("disabled")).toBe(false));
    expect(navigate).not.toHaveBeenCalled();
  });

  it("builds a fixed internal path, never anything from the content", () => {
    expect(durableSaveHref("fr")).toBe("/brouillon/sauvegarder?langue=fr");
  });
});
