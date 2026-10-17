import { notFound } from "next/navigation";
import { requireAdminForRequest } from "@/lib/admin/admin-session";
import { FounderAtelier } from "./FounderAtelier";

export default async function FounderAtelierPage() {
  const gate = await requireAdminForRequest();
  if (gate.status !== "granted") notFound();

  return <FounderAtelier />;
}
