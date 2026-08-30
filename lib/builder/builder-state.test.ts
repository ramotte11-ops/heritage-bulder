import { describe, expect, it } from "vitest";
import {
  createInitialBuilderState,
  getManagedSections,
  getPreviewSections,
  selectSection,
  setMode,
  toggleSection,
  updateSectionContent,
} from "./builder-state";
import { DEMO_MEMORIALS } from "./demo-memorials";

const announcementMemorial = DEMO_MEMORIALS["demo-announcement"];
const remembranceMemorial = DEMO_MEMORIALS["demo-remembrance"];

describe("createInitialBuilderState", () => {
  it("seeds state from the memorial's own editorial context, sections and draft content", () => {
    const state = createInitialBuilderState(announcementMemorial);

    expect(state.editorialContext).toBe("announcement");
    expect(state.enabledSections).toEqual(announcementMemorial.enabledSections);
    expect(state.content).toEqual(announcementMemorial.draft.content);
    expect(state.mode).toBe("edit");
  });

  it("does not mutate the source memorial when state is later changed", () => {
    const state = createInitialBuilderState(announcementMemorial);
    toggleSection(state, "ceremony");
    updateSectionContent(state, "hero", { title: "changed" });

    expect(announcementMemorial.enabledSections).not.toContain("ceremony");
    expect(announcementMemorial.draft.content.hero).not.toEqual({ title: "changed" });
  });
});

describe("toggleSection", () => {
  it("enables a disabled optional section that is valid for the context", () => {
    const state = createInitialBuilderState(announcementMemorial);
    expect(state.enabledSections).not.toContain("ceremony");

    const next = toggleSection(state, "ceremony");
    expect(next.enabledSections).toContain("ceremony");
  });

  it("disables an already-enabled optional section", () => {
    const state = createInitialBuilderState(announcementMemorial);
    expect(state.enabledSections).toContain("gallery");

    const next = toggleSection(state, "gallery");
    expect(next.enabledSections).not.toContain("gallery");
  });

  it("is a no-op for a core section (hero)", () => {
    const state = createInitialBuilderState(announcementMemorial);
    const next = toggleSection(state, "hero");
    expect(next).toBe(state);
  });

  it("is a no-op for a core section that differs per context (deathNotice)", () => {
    const state = createInitialBuilderState(announcementMemorial);
    const next = toggleSection(state, "deathNotice");
    expect(next).toBe(state);
  });

  it("is a no-op for a section id that isn't part of the current context at all", () => {
    // "memoryMessage" only exists for remembrance, not announcement.
    const state = createInitialBuilderState(announcementMemorial);
    const next = toggleSection(state, "memoryMessage");
    expect(next).toBe(state);
    expect(next.enabledSections).not.toContain("memoryMessage");
  });
});

describe("selectSection / setMode", () => {
  it("updates the selected section without touching anything else", () => {
    const state = createInitialBuilderState(announcementMemorial);
    const next = selectSection(state, "gallery");

    expect(next.selectedSectionId).toBe("gallery");
    expect(next.enabledSections).toEqual(state.enabledSections);
    expect(next.content).toEqual(state.content);
  });

  it("switches mode between edit and preview while preserving the rest of the state", () => {
    const state = createInitialBuilderState(announcementMemorial);
    const withToggle = toggleSection(state, "ceremony");
    const inPreview = setMode(withToggle, "preview");
    const backToEdit = setMode(inPreview, "edit");

    expect(inPreview.mode).toBe("preview");
    expect(inPreview.enabledSections).toEqual(withToggle.enabledSections);
    expect(backToEdit.mode).toBe("edit");
    expect(backToEdit.enabledSections).toContain("ceremony");
  });
});

describe("updateSectionContent", () => {
  it("merges a patch into existing content for a section without touching other sections", () => {
    const state = createInitialBuilderState(announcementMemorial);
    const next = updateSectionContent(state, "hero", { title: "Nouveau titre" });

    expect(next.content.hero).toMatchObject({ title: "Nouveau titre" });
    expect(next.content.deathNotice).toEqual(state.content.deathNotice);
  });

  it("creates content for a section that had none yet", () => {
    const state = createInitialBuilderState(announcementMemorial);
    expect(state.content.ceremony).toBeUndefined();

    const next = updateSectionContent(state, "ceremony", { body: "Détails de la cérémonie" });
    expect(next.content.ceremony).toEqual({ body: "Détails de la cérémonie" });
  });
});

describe("getPreviewSections / getManagedSections", () => {
  it("preview only includes enabled sections; managed includes all sections for the context", () => {
    const state = createInitialBuilderState(announcementMemorial);

    const preview = getPreviewSections(state).map((s) => s.id);
    const managed = getManagedSections(state).map((s) => s.id);

    expect(preview).toEqual(["hero", "deathNotice", "story", "gallery"]);
    expect(managed).toEqual([
      "hero",
      "deathNotice",
      "story",
      "ceremony",
      "traditions",
      "gallery",
      "testimonials",
      "condolences",
      "video",
    ]);
  });

  it("demonstrates the same engine driving the remembrance context without any special-casing", () => {
    const state = createInitialBuilderState(remembranceMemorial);

    const preview = getPreviewSections(state).map((s) => s.id);
    expect(preview).toEqual(["hero", "gallery", "memoryMessage"]);
  });
});
