-- Mission 002: Entitlements — the right to create exactly one memorial,
-- issued by a purchase. See Mission 000 answer G: the entitlement is
-- proof/activation of a purchase, NOT the owner's permanent access
-- mechanism (that stays the owner's session, via magic link — a later
-- mission).
create table entitlements (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('etsy', 'direct')),
  -- Etsy receipt/order id today; any future direct-sale order reference
  -- tomorrow. Nullable because a future source might not assign one at
  -- creation time.
  external_order_id text,
  -- Mirrors config/skins.ts Skin values. A CHECK, not a foreign key:
  -- skins are HERITAGE product configuration (code), not a database
  -- table — see supabase/README.md.
  skin_id text not null check (skin_id in ('intemporel')),
  status text not null default 'available'
    check (status in ('available', 'redeemed', 'revoked')),
  -- Nullable until the entitlement is claimed. Set together with
  -- redeemed_at, in the same transaction, when a memorial is created
  -- from this entitlement.
  owner_id uuid references owners (id),
  created_at timestamptz not null default now(),
  redeemed_at timestamptz,
  updated_at timestamptz not null default now(),

  -- A given Etsy/direct order can only be redeemed once.
  constraint entitlements_external_order_unique unique (source, external_order_id),
  -- redeemed_at / owner_id are set together, never partially — a plain
  -- row-local CHECK, no trigger needed.
  constraint entitlements_redeemed_consistency check (
    (status = 'redeemed' and owner_id is not null and redeemed_at is not null)
    or (status <> 'redeemed')
  )
);

-- Mission 002 correction: this table deliberately has NO memorial_id
-- column. "1 Entitlement -> 0 or 1 Memorial" has exactly one source of
-- truth: memorials.entitlement_id (NOT NULL UNIQUE — see
-- 20260829154000_memorials.sql), which already guarantees both that
-- every memorial has exactly one entitlement AND that no two memorials
-- share one — so no reverse pointer is needed to enforce "at most one
-- memorial per entitlement" either. A memorial's entitlement (or an
-- entitlement's memorial, if any) is found by querying
-- `memorials where entitlement_id = ...`, which is already indexed by
-- that column's own UNIQUE constraint. An earlier version of this
-- migration also stored entitlements.memorial_id, a second pointer back
-- to the same relationship — removed because two pointers for one
-- relationship is two sources of truth that can silently disagree, for
-- no benefit V1 actually needs. See supabase/README.md.

create index entitlements_owner_id_idx on entitlements (owner_id) where owner_id is not null;

create trigger entitlements_set_updated_at
  before update on entitlements
  for each row
  execute function set_updated_at();

alter table entitlements enable row level security;

-- An owner may see their own redeemed entitlements (e.g. a future "your
-- purchases" screen). No INSERT/UPDATE policy for clients: entitlements
-- are created and redeemed by trusted server-side logic only (Etsy
-- fulfillment, redemption flow) — not built in Mission 002.
create policy entitlements_select_own on entitlements
  for select
  to authenticated
  using (owner_id = current_owner_id());
