// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";

const { linkStatus } = vi.hoisted(() => ({ linkStatus: { pending: false } }));
vi.mock("next/link", () => ({
  default: ({ href, className, children }: { href: string; className?: string; children: ReactNode }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
  useLinkStatus: () => linkStatus,
}));

const { BackToSpaceLink } = await import("./BackToSpaceLink");

afterEach(() => {
  cleanup();
  linkStatus.pending = false;
});

describe("Mission 04-G / L1.3 — « Retour à mon espace »", () => {
  it("idle: the same link to /owner, same class, same text, no busy signal", () => {
    render(<BackToSpaceLink language="fr" className="pause-link" />);
    const link = screen.getByRole("link", { name: "Retour à mon espace" });
    expect(link.getAttribute("href")).toBe("/owner");
    expect(link.className).toBe("pause-link");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it.each([
    ["fr", "Un instant…"],
    ["en", "Just a moment…"],
    ["es", "Un momento…"],
  ] as const)("while /owner is loading (%s): « %s », announced politely", (language, wait) => {
    linkStatus.pending = true;
    render(<BackToSpaceLink language={language} className="pause-link" />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/owner");
    const status = within(link).getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toBe(wait);
  });

  it.each([
    ["en", "Back to my space"],
    ["es", "Volver a mi espacio"],
  ] as const)("idle label is translated (%s)", (language, label) => {
    render(<BackToSpaceLink language={language} />);
    expect(screen.getByRole("link").textContent).toBe(label);
  });
});
