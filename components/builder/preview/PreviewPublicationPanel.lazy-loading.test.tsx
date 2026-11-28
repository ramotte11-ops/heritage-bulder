// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PreviewPublication } from "@/lib/memorial/publication-preview-types";

const verificationModule = vi.hoisted(() => {
  type Module = { EmailVerificationStep: () => string };
  let resolve!: (module: Module) => void;
  const promise = new Promise<Module>((done) => (resolve = done));
  return {
    promise,
    release: () => resolve({ EmailVerificationStep: () => "verification loaded" }),
  };
});

vi.mock("@/components/auth/EmailVerificationStep", () => verificationModule.promise);

import { PreviewPublicationPanel } from "./PreviewPublicationPanel";

afterEach(cleanup);

const publication: PreviewPublication = {
  revision: 5,
  accessLevel: "avis",
  digest: "c".repeat(64),
  gallery: { total: 0, limit: 6, selection: undefined, proposed: false, choices: [] },
  premiumSections: [],
  readiness: "publishable",
  otherActiveFreeDrafts: 0,
};

describe("PreviewPublicationPanel — lazy e-mail verification", () => {
  it("shows an announced fallback only while the verification module loads", async () => {
    const { container } = render(
      <PreviewPublicationPanel
        language="fr"
        publication={publication}
        recap={{ offer: "free", visible: [{ sectionId: "hero", archived: false }], galleryCount: null, videoCount: null, previewOnlyVideoCount: 0, contributions: null, hiddenSections: [] }}
        publish={vi.fn(async () => "email_unverified" as const)}
        reload={vi.fn(async () => true)}
        builderPath="/builder/memorial-a"
        onBackToCreation={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Publier" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmer la publication" }));

    expect((await screen.findByRole("status")).textContent).toBe("Un instant…");
    expect(container.querySelector("[data-email-verification-loading]")).not.toBeNull();

    await act(async () => verificationModule.release());
    expect(await screen.findByText("verification loaded")).toBeTruthy();
    await waitFor(() => expect(container.querySelector("[data-email-verification-loading]")).toBeNull());
  });
});
