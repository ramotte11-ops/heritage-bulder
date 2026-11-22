import "server-only";
import { getHeritageActor } from "@/lib/auth/heritage-session";
import { requireOwner, type HeritageActor } from "@/lib/auth/heritage-actor";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { SupabaseOwnedMemorialListRepository } from "@/lib/adapters/supabase/owned-memorial-list-repository";
import { SupabaseFamilySpaceRepository } from "@/lib/adapters/supabase/family-space-repository";
import type { FamilySpaceRepository, FamilyTributeDetails } from "@/lib/adapters/family-space-repository";
import {
  UNKNOWN_OWNER_FREE_PUBLICATION_STATUS,
  type OwnerFreePublicationStatus,
} from "@/lib/adapters/owner-free-publication-status-repository";
import { loadOwnerFreePublicationStatus } from "@/lib/memorial/load-owner-free-publication-status";
import { buildFamilyTributes, type FamilyTribute } from "./family-space";

/**
 * Espace famille — the one server entry of every page of the space.
 *
 * Unchanged security path: the session is the validated one
 * (`getHeritageActor`), the Owner is the one inside that actor
 * (`requireOwner`), and every list is read with the SESSION-scoped client,
 * under row-level security. Nothing here accepts an id from the request.
 *
 * - `visitor`: no session — the page redirects to `/login`.
 * - `error`: the session or the tribute list could not be read. Never an
 *   empty space standing in for a failure.
 * - `none`: signed in, but no Owner yet or no tribute.
 * - `ready`: the family's tributes, oldest first, and the repository the
 *   page then asks for the selected tribute's attentions.
 */
export type FamilySpace =
  | { status: "visitor" }
  | { status: "error"; email: string | null }
  | { status: "none"; email: string | null; isOwner: boolean; publication: OwnerFreePublicationStatus }
  | {
      status: "ready";
      email: string | null;
      actor: HeritageActor;
      publication: OwnerFreePublicationStatus;
      tributes: FamilyTribute[];
      repository: FamilySpaceRepository;
    };

export async function loadFamilySpace(): Promise<FamilySpace> {
  let actor: HeritageActor;
  try {
    actor = await getHeritageActor();
  } catch (error) {
    console.error("Owner space: actor resolution failed:", error instanceof Error ? error.message : error);
    return { status: "error", email: null };
  }

  if (actor.audience === "visitor") return { status: "visitor" };
  const email = actor.identity?.email ?? null;

  const gate = requireOwner(actor);
  if (gate.status !== "granted") {
    return { status: "none", email, isOwner: false, publication: UNKNOWN_OWNER_FREE_PUBLICATION_STATUS };
  }

  // Mission 04-G / L1.2 — once the Owner gate is granted, the three reads
  // below depend on nothing but the Owner's id, so they run together: the
  // free publication status, the list of the family's tributes, and their
  // details. Every outcome is decided afterwards exactly as when they ran
  // one after the other (see each branch). The only difference: when the
  // family has no tribute, the details were read anyway — their result is
  // ignored.
  const clientRead = settle(createServerSupabaseClient());
  const [publication, memorialsRead, detailsRead] = await Promise.all([
    loadOwnerFreePublicationStatus(gate.owner.id),
    clientRead.then((client) =>
      client.ok ? settle(new SupabaseOwnedMemorialListRepository(client.value).listOwnedMemorials(gate.owner.id)) : client,
    ),
    clientRead.then((client) =>
      client.ok ? settle(new SupabaseFamilySpaceRepository(client.value).listTributeDetails(gate.owner.id)) : client,
    ),
  ]);

  const client = await clientRead;
  if (!client.ok || !memorialsRead.ok) {
    const error = client.ok ? (memorialsRead.ok ? null : memorialsRead.error) : client.error;
    console.error("Owner space: memorial list failed:", error instanceof Error ? error.message : error);
    return { status: "error", email };
  }

  const memorials = memorialsRead.value;
  if (memorials.length === 0) return { status: "none", email, isOwner: true, publication };

  const repository = new SupabaseFamilySpaceRepository(client.value);
  // Statuses, years and photo references are an enrichment of the list:
  // if they cannot be read, the family still reaches every tribute.
  let details: Map<string, FamilyTributeDetails> = new Map();
  if (detailsRead.ok) {
    details = detailsRead.value;
  } else {
    console.error(
      "Owner space: tribute details failed:",
      detailsRead.error instanceof Error ? detailsRead.error.message : detailsRead.error,
    );
  }

  return {
    status: "ready",
    email,
    actor,
    publication,
    tributes: buildFamilyTributes(memorials, details),
    repository,
  };
}

type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

/** A read that never rejects: its failure is kept for the caller to decide. */
function settle<T>(promise: Promise<T>): Promise<Settled<T>> {
  return promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
}
