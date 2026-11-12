import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

/**
 * QG 003 — « absence de dépendances Supabase dans le chemin invité »,
 * proven on the WHOLE static import graph of the guest page (not a list of
 * files): from `app/pilote/builder-invite/page.dev.tsx`, every module the
 * guest Builder and its Preview load eagerly. Type-only imports are erased
 * and not followed. A dynamic `import()` is a separate chunk that is only
 * fetched when its branch runs: the two that exist (`HeroPhotoStep`'s and
 * `GalleryWorkshop`'s Storage upload) belong to the authenticated mode.
 */

const ROOT = resolve(import.meta.dirname, "../../..");
const ENTRY = join(ROOT, "app/pilote/builder-invite/page.dev.tsx");
const STATIC_IMPORT = /(?:^|\n)\s*(?:import|export)\s+(?!type\s)(?:[^'";]*?\sfrom\s+)?["']([^"']+)["']/g;
const DYNAMIC_IMPORT = /import\(\s*["']([^"']+)["']\s*\)/g;

function resolveModule(from: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = join(ROOT, specifier.slice(2));
  else if (specifier.startsWith(".")) base = resolve(dirname(from), specifier);
  else return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (/\.(?:ts|tsx|css)$/.test(candidate) && existsSync(candidate)) return candidate;
  }
  throw new Error(`Unresolved import ${specifier} from ${relative(ROOT, from)}`);
}

function staticGraph(entry: string = ENTRY) {
  const modules = new Set<string>();
  const packages = new Set<string>();
  const dynamic: string[] = [];
  const stack = [entry];
  while (stack.length > 0) {
    const file = stack.pop()!;
    if (modules.has(file)) continue;
    modules.add(file);
    if (file.endsWith(".css")) continue;
    const source = readFileSync(file, "utf8");
    for (const [, specifier] of source.matchAll(STATIC_IMPORT)) {
      const target = resolveModule(file, specifier);
      if (target === null) packages.add(specifier);
      else stack.push(target);
    }
    for (const [, specifier] of source.matchAll(DYNAMIC_IMPORT)) dynamic.push(`${relative(ROOT, file)} -> ${specifier}`);
  }
  return { modules: [...modules].map((file) => relative(ROOT, file)), packages: [...packages], dynamic };
}

describe("guest Builder import graph", () => {
  const graph = staticGraph();

  it("reaches the real Builder, Preview host and assembler", () => {
    expect(graph.modules).toEqual(expect.arrayContaining([
      "components/builder/guest/GuestBuilderRuntime.tsx",
      "components/builder/preview/BuilderPreviewHost.tsx",
      "components/memorial/assembly/MemorialAssembly.tsx",
      "lib/memorial/assembly/assemble-memorial.ts",
      "lib/guest-draft/guest-preview.ts",
      "components/memorial/symbolic-offerings/v1/offerings-preview.tsx",
    ]));
  });

  it("loads no Supabase module, no server action and no server media resolver", () => {
    expect(graph.packages.filter((name) => name.startsWith("@supabase"))).toEqual([]);
    expect(graph.modules.filter((file) => /supabase|server-media|owner-draft-media-resolver|actions\.ts$/.test(file))).toEqual([]);
    const serverModules = graph.modules.filter((file) =>
      !file.endsWith(".css") && /^\s*["']use server["']/m.test(readFileSync(join(ROOT, file), "utf8")));
    expect(serverModules).toEqual([]);
  });

  it("defers the only Supabase upload code to the authenticated branches", () => {
    expect(graph.dynamic.sort()).toEqual([
      "components/builder/GalleryWorkshop.tsx -> @/lib/media/authenticated-gallery-upload",
      "components/builder/GalleryWorkshop.tsx -> @/lib/media/authenticated-gallery-upload",
      "components/builder/HeroPhotoStep.tsx -> @/lib/supabase/browser-client",
    ]);
  });
});

// QG 008 Lot 2 — the production route of the same guest Builder carries the
// same guarantee: no Supabase, no server action. The durable save is a
// plain navigation (GuestDurableSaveEntry) to routes outside this graph.
describe("guest Builder import graph — production route /creer", () => {
  const graph = staticGraph(join(ROOT, "app/creer/page.tsx"));

  it("is the same guest Builder, with the durable-save entry", () => {
    expect(graph.modules).toEqual(expect.arrayContaining([
      "components/builder/guest/GuestBuilderRuntime.tsx",
      "components/builder/guest/GuestDurableSaveEntry.tsx",
    ]));
  });

  it("loads no Supabase module, no server action and none of the transfer screens", () => {
    expect(graph.packages.filter((name) => name.startsWith("@supabase"))).toEqual([]);
    expect(graph.modules.filter((file) => /supabase|server-media|actions\.ts$|components\/builder\/transfer\//.test(file))).toEqual([]);
    const serverModules = graph.modules.filter((file) =>
      !file.endsWith(".css") && /^\s*["']use server["']/m.test(readFileSync(join(ROOT, file), "utf8")));
    expect(serverModules).toEqual([]);
  });
});
