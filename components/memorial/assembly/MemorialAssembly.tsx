import type { ComponentType } from "react";
import type { RendererKey } from "@/config/memorial-section-renderers";
import type { AssembledMemorial } from "@/lib/memorial/assembly/assemble-memorial";
import type { AssembledSection, RendererPropsMap } from "@/lib/memorial/assembly/renderer-adapters";
import { RENDERER_COMPONENTS } from "./renderer-registry";

/**
 * Étape 2 — Assembleur du Memorial: renders an `AssembledMemorial`
 * (lib/memorial/assembly/assemble-memorial.ts) — its sections, in
 * order, each through its own real renderer.
 *
 * Deliberately inert: no state, no hooks, no `"use client"` (a server
 * page can mount it; each renderer is its own client boundary), no
 * page chrome, no background, no spacing, no extra `SkinScope` (every
 * renderer brings its own). Each section sits in one neutral block
 * `<div data-memorial-section>` carrying no style. The visual seams
 * between sections are left exactly as the renderers produce them —
 * they are for the QG to observe, not for this component to smooth.
 *
 * An `unavailable` Memorial renders nothing at all (QG D1): what to say
 * instead belongs to the caller (the future Preview), never to a
 * placeholder here. A failed section is simply absent from `sections`.
 *
 * Assumes, like the four renderers, a full-viewport-width mount.
 */
export interface MemorialAssemblyProps {
  assembled: AssembledMemorial;
}

function renderSection<K extends RendererKey>(section: AssembledSection & { rendererKey: K }) {
  const Renderer = RENDERER_COMPONENTS[section.rendererKey] as ComponentType<RendererPropsMap[K]>;
  return <Renderer {...(section.props as RendererPropsMap[K] & object)} />;
}

export function MemorialAssembly({ assembled }: MemorialAssemblyProps) {
  if (assembled.status !== "assembled") return null;

  return (
    <div data-memorial-assembly="">
      {assembled.sections.map((section) => (
        <div key={section.sectionId} data-memorial-section={section.sectionId}>
          {renderSection(section)}
        </div>
      ))}
    </div>
  );
}
