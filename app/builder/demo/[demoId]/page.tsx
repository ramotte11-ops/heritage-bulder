import { notFound } from "next/navigation";
import { DEMO_MEMORIALS } from "@/lib/builder/demo-memorials";
import { BuilderShell } from "@/components/builder/BuilderShell";

/**
 * Opens one local demo memorial in the Builder shell. `demoId` is a key
 * into DEMO_MEMORIALS (a fixture map), not a real memorial id — nothing
 * here queries Supabase. See lib/builder/demo-memorials.ts.
 *
 * Mission 021: moved from `/builder/[demoId]` to `/builder/demo/[demoId]`
 * so this fixture route no longer occupies the URL segment the real
 * Builder entry point now uses (`app/builder/[memorialId]/page.tsx`).
 * `BuilderShell` is called with no `persist` here, exactly as before —
 * this route still never writes to Supabase.
 */
export default async function BuilderDemoPage({
  params,
}: {
  params: Promise<{ demoId: string }>;
}) {
  const { demoId } = await params;
  const memorial = DEMO_MEMORIALS[demoId];

  if (!memorial) {
    notFound();
  }

  return <BuilderShell memorial={memorial} />;
}
