-- QG 004-B (complément) — correction sécurisée de l'adresse e-mail après la première sauvegarde.
--
-- NON APPLIQUÉE. À appliquer sur Supabase B uniquement sur GO QG explicite,
-- APRÈS 20261114120000_qg004b_owner_email_verification.sql.
--
-- Problème : owners_guard_free_email_v1 (HD423) refusait tout changement de
-- owners.email dès qu'un historique gratuit existait. Il protégeait le quota
-- « une publication gratuite par adresse sur 12 mois » : sans lui, l'ancienne
-- adresse, libérée, pourrait servir à un NOUVEAU compte (nouvel owner_id, aucun
-- historique) et donc à un quota neuf. Mais il bloquait aussi la correction
-- légitime d'une adresse mal saisie.
--
-- Principe retenu (aucun compteur commercial n'est modifié) :
--   * Les compteurs restent ceux du propriétaire (memorial_access_events par
--     owner_id) : changer d'adresse ne change ni l'owner_id, ni les dates des
--     mémoriaux (10 j, 45 j, visibilité), ni les droits Etsy/premium, et
--     n'accorde aucun droit gratuit.
--   * Toute ancienne adresse est inscrite dans owner_email_history. Une adresse
--     dont le propriétaire avait PROUVÉ le contrôle (owner_email_verifications)
--     y est RÉSERVÉE : aucun autre propriétaire ne peut ensuite l'utiliser
--     (HD424), ce qui empêche de recréer un compte neuf avec elle. Une adresse
--     jamais prouvée (faute de frappe) est libérée : aucune publication gratuite
--     n'a pu se faire sous elle (QG 004-B exige la preuve pour publier).
--   * HD423 est conservé, adapté : le changement n'est accepté que si l'ancienne
--     adresse vient d'être inscrite à l'historique, ce que seule
--     apply_owner_email_change_v1 (service_role) sait faire.
--   * Verrous : ligne du propriétaire (FOR UPDATE, l'ordre déjà suivi par les
--     fonctions gratuites), puis verrous consultatifs transactionnels sur
--     l'ancienne et la nouvelle adresse (triés), aussi pris par le déclencheur
--     de réservation lors de toute création/modification de propriétaire.

create table public.owner_email_history (
  email_normalized text not null
    check (email_normalized = lower(btrim(email_normalized)) and email_normalized <> ''),
  owner_id uuid not null references public.owners(id) on delete cascade,
  released_at timestamptz not null default clock_timestamp(),
  reserved boolean not null,
  primary key (email_normalized, owner_id)
);

comment on table public.owner_email_history is
  'QG 004-B. Anciennes adresses des propriétaires. reserved = l''adresse avait été prouvée par ce propriétaire : aucun autre propriétaire ne peut l''utiliser (HD424), pour que le quota gratuit par adresse ne puisse pas être contourné par un nouveau compte. Écrite uniquement par apply_owner_email_change_v1 (service_role). Aucun rôle applicatif n''y a accès.';

alter table public.owner_email_history enable row level security;
revoke all on table public.owner_email_history from public, anon, authenticated, service_role;

-- Verrou consultatif transactionnel sur une adresse (normalisée).
create or replace function public.owner_email_lock_v1(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('heritage-owner-email:' || lower(btrim(coalesce(p_email, ''))), 0)
  );
end;
$$;

revoke all on function public.owner_email_lock_v1(text) from public, anon, authenticated, service_role;

-- Réservation : aucun propriétaire ne prend une adresse réservée par un autre.
create or replace function public.owners_guard_reserved_email_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and lower(btrim(new.email)) is not distinct from lower(btrim(old.email)) then
    return new;
  end if;
  perform public.owner_email_lock_v1(new.email);
  if exists (
    select 1 from public.owner_email_history h
     where h.email_normalized = lower(btrim(new.email))
       and h.reserved
       and h.owner_id <> new.id
  ) then
    raise exception 'owner e-mail is reserved by another owner''s free access history' using errcode = 'HD424';
  end if;
  return new;
end;
$$;

revoke all on function public.owners_guard_reserved_email_v1() from public, anon, authenticated, service_role;

create trigger owners_guard_reserved_email
  before insert or update of email on public.owners
  for each row execute function public.owners_guard_reserved_email_v1();

-- HD423 adapté : un propriétaire avec historique gratuit ne change d'adresse que
-- si l'ancienne vient d'être inscrite à owner_email_history (seul chemin :
-- apply_owner_email_change_v1). Sans historique : inchangé (aucun contrôle).
create or replace function public.owners_guard_free_email_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(btrim(new.email)) is distinct from lower(btrim(old.email))
     and exists (select 1 from public.memorial_access_events ev where ev.owner_id = old.id)
     and not exists (
       select 1 from public.owner_email_history h
        where h.owner_id = old.id
          and h.email_normalized = lower(btrim(old.email))
          -- now() est l'heure de début de la transaction : seule une inscription
          -- faite dans CETTE transaction (apply_owner_email_change_v1) l'égale.
          and h.released_at = pg_catalog.now()
     ) then
    raise exception 'owner e-mail is bound to its free access history' using errcode = 'HD423';
  end if;
  return new;
end;
$$;

revoke all on function public.owners_guard_free_email_v1() from public, anon, authenticated, service_role;

-- Le changement d'adresse est désormais toujours possible pour un propriétaire
-- (les protections sont dans apply_owner_email_change_v1). Conservée pour l'API.
create or replace function public.owner_email_change_allowed_v1(p_auth_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return p_auth_user_id is not null;
end;
$$;

revoke all on function public.owner_email_change_allowed_v1(uuid) from public, anon, authenticated;
grant execute on function public.owner_email_change_allowed_v1(uuid) to service_role;

-- Changement d'adresse, transactionnel. Appelé par le serveur après que Supabase
-- Auth a vérifié un code envoyé à la NOUVELLE adresse (verifyOtp email_change)
-- et après re-authentification par mot de passe. Même owner_id, même compte
-- Auth ; aucune ligne de mémorial, de droit ni d'événement n'est modifiée.
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
  v_new text := lower(btrim(coalesce(p_new_email, '')));
  v_old text;
  v_reserved boolean;
begin
  if p_auth_user_id is null or v_new = '' then
    raise exception 'invalid email change request' using errcode = '22023';
  end if;
  select * into v_owner from public.owners o where o.auth_user_id = p_auth_user_id for update;
  if not found then
    return query select 'no_owner'::text, null::uuid;
    return;
  end if;
  v_old := lower(btrim(v_owner.email));
  if v_old = v_new then
    return query select 'unchanged'::text, v_owner.id;
    return;
  end if;
  -- Verrous d'adresse, toujours dans le même ordre (pas d'interblocage).
  perform public.owner_email_lock_v1(least(v_old, v_new));
  perform public.owner_email_lock_v1(greatest(v_old, v_new));

  if exists (select 1 from public.owners o where lower(o.email) = v_new and o.id <> v_owner.id) then
    return query select 'email_taken'::text, v_owner.id;
    return;
  end if;
  if exists (
    select 1 from public.owner_email_history h
     where h.email_normalized = v_new and h.reserved and h.owner_id <> v_owner.id
  ) then
    return query select 'email_reserved'::text, v_owner.id;
    return;
  end if;

  -- L'ancienne adresse était-elle prouvée par CE propriétaire ? Alors réservée.
  v_reserved := exists (
    select 1 from public.owner_email_verifications v
     where v.owner_id = v_owner.id
       and v.auth_user_id = v_owner.auth_user_id
       and v.email_normalized = v_old
  );
  insert into public.owner_email_history as h (email_normalized, owner_id, released_at, reserved)
  values (v_old, v_owner.id, pg_catalog.now(), v_reserved)
  on conflict on constraint owner_email_history_pkey do update
     set released_at = excluded.released_at,
         reserved = h.reserved or excluded.reserved;

  update public.owners set email = v_new where id = v_owner.id;

  insert into public.owner_email_verifications as v (owner_id, auth_user_id, email_normalized, verified_at, method)
  values (v_owner.id, p_auth_user_id, v_new, clock_timestamp(), 'email_change')
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

-- Une nouvelle adresse réservée par un autre propriétaire est refusée AVANT de
-- demander le changement à Supabase Auth (pas d'écart auth.users / owners).
create or replace function public.owner_email_available_v1(p_auth_user_id uuid, p_email text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_owner uuid;
begin
  if v_email = '' then
    return false;
  end if;
  select o.id into v_owner from public.owners o where o.auth_user_id = p_auth_user_id;
  return not exists (select 1 from public.owners o where lower(o.email) = v_email and o.id is distinct from v_owner)
     and not exists (
       select 1 from public.owner_email_history h
        where h.email_normalized = v_email and h.reserved and h.owner_id is distinct from v_owner
     );
end;
$$;

revoke all on function public.owner_email_available_v1(uuid, text) from public, anon, authenticated;
grant execute on function public.owner_email_available_v1(uuid, text) to service_role;
