/**
 * Mission 003 demo-only content shape for the Builder shell.
 *
 * This is NOT the product's section content model — that model doesn't
 * exist yet (see types/memorial.ts's MemorialSectionContent comment, and
 * supabase/README.md's rationale for leaving memorial_drafts.content as
 * JSONB). This type exists only to give the Builder demo something
 * minimal and generic to edit and preview, uniformly across every
 * section, without presuming what any particular section (Hero,
 * Gallery, ...) will actually contain once that model is designed by a
 * later mission.
 *
 * The index signature makes this structurally a `MemorialSectionContent`
 * (`Record<string, unknown>`), so it fits directly into the real
 * `MemorialContent` type from types/memorial.ts — no separate, competing
 * content type is introduced.
 */
export interface DemoSectionContent {
  [key: string]: unknown;
  title?: string;
  body?: string;
}

export const EMPTY_DEMO_CONTENT: DemoSectionContent = {};
