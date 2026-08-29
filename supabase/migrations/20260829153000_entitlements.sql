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
  -- Both nullable until the entitlement is claimed. Set together, in the
  -- same transaction, when a memorial is created from this entitlement.
  owner_id uuid references owners (id),
  -- No foreign key here yet: memorials does not exist until the next
  -- migration. The constraint is added by ALTER TABLE at the end of
  -- 20260829154000_memorials.sql once both tables exist — see the note
  -- there about this being a normal way to handle two tables that
  -- reference each other.
  memorial_id uuid,
  created_at timestamptz not null default now(),
  redeemed_at timestamptz,
  updated_at timestamptz not null default now(),

  -- A given Etsy/direct order can only be redeemed once.
  constraint entitlements_external_order_unique unique (source, external_order_id),
  -- redeemed_at / owner_id / memorial_id are set together, never
  -- partially — a plain row-local CHECK, no trigger needed.
  constraint entitlements_redeemed_consistency check (
    (status = 'redeemed' and owner_id is not null and memorial_id is not null and redeemed_at is not null)
    or (status <> 'redeemed')
  )
);

-- 1 entitlement -> at most 1 memorial. The reverse (1 memorial -> exactly
-- 1 entitlement) is enforced on the memorials table via a unique,
-- not-null entitlement_id — see 20260829154000_memorials.sql. Keeping
-- both pointers in sync (so they always point back at each other) is the
-- responsibility of the future redemption logic — a single transaction:
-- insert the memorial, then update this row — and is deliberately not
-- enforced by a trigger in V1, to avoid building that machinery for a
-- path nothing calls yet. See supabase/README.md.
create unique index entitlements_memorial_id_key on entitlements (memorial_id) where memorial_id is not null;

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
