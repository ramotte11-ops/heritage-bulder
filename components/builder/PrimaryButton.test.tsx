// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PrimaryButton } from "./PrimaryButton";

afterEach(cleanup);

describe("PrimaryButton — immediate pending feedback", () => {
  it("keeps its normal label and arrow while idle", () => {
    const { container } = render(<PrimaryButton type="submit">Continuer</PrimaryButton>);

    expect(screen.getByRole("button", { name: "Continuer" })).toHaveProperty("disabled", false);
    expect(container.querySelector("svg")).toBeTruthy();
    expect(container.querySelector("[role=status]")).toBeNull();
  });

  it("becomes busy and disabled, replacing the label with an announced status", () => {
    const { container } = render(
      <PrimaryButton type="submit" pending pendingLabel="Un instant…">
        Continuer
      </PrimaryButton>,
    );

    const button = screen.getByRole("button", { name: "Un instant…" });
    expect(button).toHaveProperty("disabled", true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("status").textContent).toBe("Un instant…");
    expect(container.querySelector("svg")).toBeNull();
  });
});
