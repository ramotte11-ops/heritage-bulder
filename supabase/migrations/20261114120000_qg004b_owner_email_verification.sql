-- QG 004-B — preuve HERITAGE de propriété de l'adresse e-mail (vérification différée).
--
-- NON APPLIQUÉE. À appliquer sur Supabase B uniquement sur GO QG explicite.
--
-- Contexte : la famille crée son compte (e-mail + mot de passe) et sauvegarde son
-- brouillon tout de suite ; la confirmation native de Supabase (« Confirm email »)
-- sera désactivée, donc auth.users.email_confirmed_at sera rempli automatiquement
-- et NE PROUVE PLUS RIEN. La preuve de contrôle de la boîte e-mail est désormais
-- tenue ici, par HERITAGE :
--   * écrite uniquement par record_owner_email_verification_v1 / apply_owner_email_change_v1
--     (service_role), appelées par le serveur juste après une vérification Supabase
--     réussie (code OTP d'e-mail, code de récupération, code de changement d'adresse) ;
--   * valable tant que owners.email ne change pas (comparaison sur l'adresse actuelle) ;
--   * exigée PAR LA BASE (déclencheurs) pour : publier (memorial_published_snapshots),
--     passer un mémorial à l'offre complète, rattacher un droit Etsy à un propriétaire.
-- Les comptes, brouillons et publications existants ne sont pas modifiés : les
-- contrôles ne portent que sur les écritures futures.

create table public.owner_email_verifications (
  owner_id uuid primary key references public.owners(id) on delete cascade,
  auth_user_id uuid not null,
  email_normalized text not null
    check (email_normalized = lower(btrim(email_normalized)) and email_normalized <> ''),
  verified_at timestamptz not null default clock_timestamp(),
  method text not null check (method in ('email_otp', 'password_recovery', 'email_change'))
);

comment on table public.owner_email_verifications is
  'QG 004-B. Preuve HERITAGE de contrôle de la boîte e-mail d''un propriétaire (jamais email_confirmed_at). Une ligne par propriétaire ; valable tant que owners.email est égale à email_normalized et que le compte Auth est le même. Écrite uniquement par record_owner_email_verification_v1 et apply_owner_email_change_v1 (service_role). Aucun rôle applicatif n''y a accès directement.';

alter table public.owner_email_verifications enable row level security;
revoke all on table public.owner_email_verifications from public, anon, authenticated, service_role;

-- Vrai si la preuve existe pour l'adresse ACTUELLE du propriétaire et son compte Auth.
create or replace function public.owner_email_verified_v1(p_owner_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_owner_id is null then
    return false;
  end if;
  return exists (
    select 1
      from public.owners o
      join public.owner_email_verifications v on v.owner_id = o.id
     where o.id = p_owner_id
       and o.auth_user_id is not null
       and v.auth_user_id = o.auth_user_id
       and v.email_normalized = lower(btrim(o.email))
  );
end;
$$;

revoke all on function public.owner_email_verified_v1(uuid) from public, anon, authenticated;
grant execute on function public.owner_email_verified_v1(uuid) to service_role;

-- Enregistre la preuve après une vérification Supabase réussie. Le propriétaire est
-- retrouvé UNIQUEMENT par son compte Auth ; l'adresse vérifiée doit être son adresse
-- actuelle. Jamais de rattachement par adresse seule.
create or replace function public.record_owner_email_verification_v1(
  p_auth_user_id uuid,
  p_email text,
  p_method text
)
returns table (outcome text, owner_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner public.owners%rowtype;
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if p_auth_user_id is null or v_email = '' or p_method not in ('email_otp', 'password_recovery') then
    raise exception 'invalid email verification request' using errcode = '22023';
  end if;
  select * into v_owner from public.owners o where o.auth_user_id = p_auth_user_id for update;
  if not found then
    return query select 'no_owner'::text, null::uuid;
    return;
  end if;
  if lower(btrim(v_owner.email)) is distinct from v_email then
    return query select 'email_mismatch'::text, v_owner.id;
    return;
  end if;
  insert into public.owner_email_verifications as v (owner_id, auth_user_id, email_normalized, verified_at, method)
  values (v_owner.id, p_auth_user_id, v_email, clock_timestamp(), p_method)
  on conflict on constraint owner_email_verifications_pkey do update
     set auth_user_id = excluded.auth_user_id,
         email_normalized = excluded.email_normalized,
         verified_at = excluded.verified_at,
         method = excluded.method;
  return query select 'recorded'::text, v_owner.id;
end;
$$;

revoke all on function public.record_owner_email_verification_v1(uuid, text, text) from public, anon, authenticated;
grant execute on function public.record_owner_email_verification_v1(uuid, text, text) to service_role;

-- Le changement d'adresse est-il possible ? Non dès qu'un historique gratuit existe :
-- owners_guard_free_email_v1 (HD423) fige alors l'adresse pour protéger le quota
-- « une publication gratuite par adresse » ; ce verrou n'est PAS levé ici (décision QG).
-- Appelé AVANT de demander le changement à Supabase Auth, pour ne jamais créer
-- d'écart entre auth.users.email et owners.email.
create or replace function public.owner_email_change_allowed_v1(p_auth_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  if p_auth_user_id is null then
    return false;
  end if;
  select o.id into v_owner from public.owners o where o.auth_user_id = p_auth_user_id;
  if not found then
    return true;
  end if;
  return not exists (select 1 from public.memorial_access_events ev where ev.owner_id = v_owner);
end;
$$;

revoke all on function public.owner_email_change_allowed_v1(uuid) from public, anon, authenticated;
grant execute on function public.owner_email_change_allowed_v1(uuid) to service_role;

-- Changement d'adresse : appelé après que Supabase Auth a vérifié un code envoyé à
-- la NOUVELLE adresse (verifyOtp type email_change) et que auth.users.email vaut
-- déjà cette adresse. Met owners.email en cohérence et enregistre la preuve.
create or replace function public.apply_owner_email_change_v1(
  p_auth_user_id uuid,
  p_new_email text
)
returns table (outcome text, owner_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner public.owners%rowtype;
  v_email text := lower(btrim(coalesce(p_new_email, '')));
begin
  if p_auth_user_id is null or v_email = '' then
    raise exception 'invalid email change request' using errcode = '22023';
  end if;
  select * into v_owner from public.owners o where o.auth_user_id = p_auth_user_id for update;
  if not found then
    return query select 'no_owner'::text, null::uuid;
    return;
  end if;
  if exists (select 1 from public.owners o where lower(o.email) = v_email and o.id <> v_owner.id) then
    return query select 'email_taken'::text, v_owner.id;
    return;
  end if;
  begin
    update public.owners set email = v_email where id = v_owner.id;
  exception when sqlstate 'HD423' then
    return query select 'email_locked'::text, v_owner.id;
    return;
  end;
  insert into public.owner_email_verifications as v (owner_id, auth_user_id, email_normalized, verified_at, method)
  values (v_owner.id, p_auth_user_id, v_email, clock_timestamp(), 'email_change')
  on conflict on constraint owner_email_verifications_pkey do update
     set auth_user_id = excluded.auth_user_id,
         email_normalized = excluded.email_normalized,
         verified_at = excluded.verified_at,
         method = excluded.method;
  return query select 'changed'::text, v_owner.id;
end;
$$;

revoke all on function public.apply_owner_email_change_v1(uuid, text) from public, anon, authenticated;
grant execute on function public.apply_owner_email_change_v1(uuid, text) to service_role;

-- Garde de base : refuse l'écriture tant que le propriétaire concerné n'a pas de
-- preuve valable pour son adresse actuelle. SQLSTATE HV403.
create or replace function public.require_owner_email_verified_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  if tg_table_name = 'memorial_published_snapshots' then
    select m.owner_id into v_owner from public.memorials m where m.id = new.memorial_id;
  else
    v_owner := new.owner_id;
  end if;
  if not public.owner_email_verified_v1(v_owner) then
    raise exception 'owner email address not verified' using errcode = 'HV403';
  end if;
  return new;
end;
$$;

revoke all on function public.require_owner_email_verified_v1() from public, anon, authenticated, service_role;

-- Publication (première et suivantes) : toute écriture du contenu publié.
create trigger memorial_published_snapshots_require_verified_email
  before insert or update on public.memorial_published_snapshots
  for each row execute function public.require_owner_email_verified_v1();

-- Droit commercial : passage d'un mémorial à l'offre complète.
create trigger memorials_complete_requires_verified_email
  before update of access_level on public.memorials
  for each row
  when (new.access_level = 'complet' and old.access_level is distinct from 'complet')
  execute function public.require_owner_email_verified_v1();

-- Activation Etsy : rattachement d'un droit Etsy à un propriétaire.
create trigger entitlements_etsy_link_requires_verified_email
  before update of owner_id on public.entitlements
  for each row
  when (new.owner_id is not null and old.owner_id is distinct from new.owner_id and new.source = 'etsy')
  execute function public.require_owner_email_verified_v1();
