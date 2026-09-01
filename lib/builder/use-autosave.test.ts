import { describe, expect, it, vi } from "vitest";
import { applyBeforeUnloadGuard } from "./use-autosave";

/**
 * Mission 010 review — the one piece of use-autosave.ts's `beforeunload`
 * wiring that can be unit-tested without jsdom or any DOM rendering
 * environment (this project's Vitest runs in "node" — see
 * vitest.config.mts). applyBeforeUnloadGuard is a plain, closure-free
 * function that only needs an object shaped like the two properties it
 * touches, so a fake object stands in for a real BeforeUnloadEvent.
 *
 * What remains untested here (and stays covered by inspection/typecheck/
 * build instead, per this project's established convention — see
 * autosave-integration.test.ts and this file's sibling
 * loss-protection.test.ts): the actual `window.addEventListener(
 * "beforeunload", ...)` wiring and the `useEffect`'s add/remove-on-every-
 * state-transition lifecycle, since exercising those needs a real
 * `window` and a rendered hook, which this codebase deliberately never
 * introduces a DOM environment for.
 */
describe("applyBeforeUnloadGuard", () => {
  it("calls preventDefault and sets a truthy legacy returnValue, never a custom message", () => {
    const event = { preventDefault: vi.fn(), returnValue: undefined as unknown };

    applyBeforeUnloadGuard(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.returnValue).toBe(true);
  });
});
