import { notFound } from "next/navigation";
import { DEMO_MEMORIALS } from "@/lib/builder/demo-memorials";
import { BuilderShell } from "@/components/builder/BuilderShell";

/**
 * Opens one local demo memorial in the Builder shell. `demoId` is a key
 * into DEMO_MEMORIALS (a fixture map), not a real memorial id — nothing
 * here queries Supabase. See lib/builder/demo-memorials.ts.
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
