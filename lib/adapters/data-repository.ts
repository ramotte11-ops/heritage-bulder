/**
 * Generic data access contract.
 *
 * Application code depends on this interface, never on a database client
 * directly (e.g. never importing a Supabase client outside this layer). A
 * future mission implements it (e.g. `DataRepository<Memorial>` backed by
 * Supabase) — no implementation exists yet.
 */
export interface DataRepository<T, Id = string> {
  findById(id: Id): Promise<T | null>;
  create(entity: T): Promise<T>;
  update(id: Id, patch: Partial<T>): Promise<T>;
}
