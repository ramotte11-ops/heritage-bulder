-- =====================================================================
-- HERITAGE HOMMAGE — INSTALLATION 1/5 — 20261116120000_lot2_offering_signature
-- =====================================================================
-- Source : supabase/migrations/20261116120000_lot2_offering_signature.sql
-- SHA-256 du fichier : caf4fbac85dad8eb2fbbdb0a2a88a5909635d1283e9f6d45240b24b1cc54f6c2
--
-- Cible UNIQUE : nudqzbdfnjzlnyffllgs (HERITAGE HOMMAGE - PRODUCTION).
-- INTERDIT : pbgzyyqdbdrhgnkzmxyn (projet historique « heritage hommage »).
-- AVANT de coller : l'adresse du navigateur doit contenir
--   supabase.com/dashboard/project/nudqzbdfnjzlnyffllgs/ . La référence prévaut sur le nom.
-- Coller TOUT le fichier dans une requête vide du SQL Editor, sans rien
-- sélectionner, puis « Run ». Une fenêtre peut avertir d'opérations
-- destructives (drop, revoke) : c'est attendu pour ce fichier.
-- Fichier généré par scripts/db/build-sql-editor-installation.py :
-- NE PAS MODIFIER À LA MAIN.
--
-- Résultat attendu : une ligne « OK » (verdict). Toute erreur commençant
-- par « STOP » ou toute autre erreur : RIEN n'a été modifié ; ne pas
-- relancer, copier le message et prévenir le QG.
-- =====================================================================

do $heritage_install$
declare
  c_version  constant text := '20261116120000';
  c_name     constant text := 'lot2_offering_signature';
  c_previous constant text := '20261116100000';
  c_count    constant integer := 44;
  c_sha256   constant text := 'caf4fbac85dad8eb2fbbdb0a2a88a5909635d1283e9f6d45240b24b1cc54f6c2';
  c_txn      constant integer := 0;
  c_source   constant text := $heritage_source$-- HERITAGE HOMMAGE — Lot 2 (Espace famille) : signature facultative d'une
-- offrande symbolique, visible de la seule famille.
--
-- Décision PO (16/11/2026, V2 validée) : après avoir déposé une fleur, une
-- bougie ou un cœur, le visiteur PEUT signer son geste d'un prénom ou d'un
-- surnom (40 caractères au plus). Le geste reste déposé sans compte et sans
-- signature ; la signature n'apparaît jamais sur la page publique et n'est
-- lue que par la famille (Carnet des attentions).
--
-- Additive : aucune migration existante n'est modifiée ;
-- `record_symbolic_offering_v1` est INCHANGÉE — les dépôts anonymes
-- continuent exactement comme avant, et la signature s'ajoute APRÈS, sur la
-- ligne déjà créée, sans jamais en créer une autre.
--
-- Ce que cette migration ajoute :
--   A. Deux colonnes facultatives sur `symbolic_offerings` (`signature`,
--      `signed_at`) et leurs contraintes de forme : 1 à 40 caractères, sans
--      espace aux extrémités, sans caractère de contrôle ni caractère
--      invisible de mise en forme (direction du texte, espaces de largeur
--      nulle) ; `signed_at` présent si et seulement si `signature` l'est,
--      jamais antérieur au geste.
--   B. Droits de lecture de la famille passés AU NIVEAU DES COLONNES : la
--      famille lit toujours ses gestes (même règle RLS
--      `symbolic_offerings_select_own`), y compris la signature, mais plus
--      la clé d'idempotence — qui sert désormais de preuve pour signer.
--   C. `sign_symbolic_offering_v1(slug, clé, signature)` : la seule voie
--      d'écriture d'une signature, `service_role` seulement (le serveur,
--      jamais le navigateur). Une instruction UPDATE unique, donc atomique :
--      elle ne signe qu'un geste encore non signé, de moins de 30 minutes,
--      désigné par le slug public ET sa clé d'idempotence (UUID aléatoire
--      tiré par le navigateur du visiteur). Issues :
--        'signed'          la signature est rattachée ;
--        'already_signed'  la même signature l'était déjà (nouvel envoi) ;
--        'refused'         slug inconnu, geste introuvable, déjà signé
--                          autrement, ou délai dépassé.
--      Une demande mal formée (signature hors forme) LÈVE une erreur : le
--      serveur normalise avant d'appeler, c'est une erreur de câblage.
--
-- Aucune donnée existante n'est modifiée ni supprimée. Aucun droit
-- d'écriture n'est accordé à un rôle client. La fonction ne journalise rien.
--
-- Retour arrière : supabase/rollbacks/20261116120000_lot2_offering_signature.down.sql
-- Contrôles : supabase/verifications/lot2_signature_preflight.sql (avant)
--             supabase/verifications/lot2_signature_postflight.sql (après)

-- ---------------------------------------------------------------------
-- A. Colonnes et contraintes
-- ---------------------------------------------------------------------
alter table public.symbolic_offerings
  add column if not exists signature text,
  add column if not exists signed_at timestamptz;

alter table public.symbolic_offerings
  drop constraint if exists symbolic_offerings_signature_shape,
  drop constraint if exists symbolic_offerings_signature_signed_at,
  drop constraint if exists symbolic_offerings_signed_after_created;

alter table public.symbolic_offerings
  add constraint symbolic_offerings_signature_shape check (
    signature is null
    or (
      char_length(signature) between 1 and 40
      and signature = btrim(signature)
      and signature !~ '[[:cntrl:]]'
      and signature !~ '[\u200B\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]'
    )
  ),
  add constraint symbolic_offerings_signature_signed_at check ((signature is null) = (signed_at is null)),
  add constraint symbolic_offerings_signed_after_created check (signed_at is null or signed_at >= created_at);

comment on column public.symbolic_offerings.signature is
  'Lot 2. Signature facultative du visiteur (prénom ou surnom, 1 à 40 caractères), ajoutée après le geste par sign_symbolic_offering_v1() seulement. Lue par la seule famille (RLS symbolic_offerings_select_own) ; jamais publique.';
comment on column public.symbolic_offerings.signed_at is
  'Lot 2. Moment où la signature a été rattachée (NULL sans signature).';
comment on table public.symbolic_offerings is
  'Offrandes symboliques V1. Un geste (bougie, lys, coeur) laissé sur un mémorial publié, sans compte. Aucune donnée de visiteur, sauf la signature facultative du Lot 2 (prénom ou surnom), lue par la seule famille. Écrit par record_symbolic_offering_v1() et signé par sign_symbolic_offering_v1() (service_role) ; jamais supprimé à l''expiration du droit de dépôt.';

-- ---------------------------------------------------------------------
-- B. Lecture de la famille au niveau des colonnes (clé non exposée)
-- ---------------------------------------------------------------------
revoke select on table public.symbolic_offerings from authenticated;
grant select (id, memorial_id, kind, created_at, read_at, signature, signed_at)
  on table public.symbolic_offerings to authenticated;

-- ---------------------------------------------------------------------
-- C. La seule écriture d'une signature
-- ---------------------------------------------------------------------
create or replace function public.sign_symbolic_offering_v1(
  p_slug text,
  p_idempotency_key uuid,
  p_signature text
)
returns table (outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_memorial_id uuid;
  v_existing text;
begin
  if nullif(btrim(p_slug), '') is null
     or p_idempotency_key is null
     or p_signature is null
     or char_length(p_signature) not between 1 and 40
     or p_signature <> btrim(p_signature)
     or p_signature ~ '[[:cntrl:]]'
     or p_signature ~ '[\u200B\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]' then
    raise exception 'invalid symbolic offering signature request' using errcode = '22023';
  end if;

  select m.id into v_memorial_id
    from public.memorials as m
   where m.slug = p_slug;

  if v_memorial_id is null then
    return query select 'refused'::text;
    return;
  end if;

  -- Une seule instruction : la ligne est verrouillée par l'UPDATE ; deux
  -- envois concurrents ne peuvent pas signer deux fois le même geste.
  update public.symbolic_offerings as o
     set signature = p_signature,
         signed_at = v_now
   where o.memorial_id = v_memorial_id
     and o.idempotency_key = p_idempotency_key
     and o.signature is null
     and o.created_at > v_now - interval '30 minutes';

  if found then
    return query select 'signed'::text;
    return;
  end if;

  select o.signature into v_existing
    from public.symbolic_offerings as o
   where o.memorial_id = v_memorial_id
     and o.idempotency_key = p_idempotency_key;

  if v_existing is not null and v_existing = p_signature then
    return query select 'already_signed'::text;
    return;
  end if;

  return query select 'refused'::text;
end;
$$;

comment on function public.sign_symbolic_offering_v1(text, uuid, text) is
  'Lot 2. Rattache une signature facultative (1 à 40 caractères) à un geste DÉJÀ enregistré, désigné par le slug public et sa clé d''idempotence, une seule fois et dans les 30 minutes. Retourne signed | already_signed | refused ; lève 22023 sur une demande mal formée. Service-role seulement ; ne crée jamais de geste.';

revoke all on function public.sign_symbolic_offering_v1(text, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.sign_symbolic_offering_v1(text, uuid, text) to service_role;
$heritage_source$;
  v_lines    integer;
begin
  -- 1. Le texte collé est exactement le fichier de GitHub.
  if encode(sha256(convert_to(c_source, 'UTF8')), 'hex') <> c_sha256 then
    raise exception 'STOP [%] : texte de la migration altéré au copier-coller (empreinte différente). Rien n''a été modifié.', c_version;
  end if;
  select count(*) into v_lines from regexp_matches(c_source, '^(begin|commit);[ \t]*$', 'gn');
  if v_lines <> c_txn then
    raise exception 'STOP [%] : structure inattendue (lignes begin/commit). Rien n''a été modifié.', c_version;
  end if;

  -- 2. Historique : présent, à jour, dans l'ordre, sans double application.
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'STOP [%] : table supabase_migrations.schema_migrations absente. Rien n''a été modifié.', c_version;
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = c_version) then
    raise exception 'STOP [%] : migration DÉJÀ INSTALLÉE (version présente dans l''historique). Rien n''a été modifié.', c_version;
  end if;
  if (select max(version) from supabase_migrations.schema_migrations) is distinct from c_previous
     or (select count(*) from supabase_migrations.schema_migrations) <> c_count then
    raise exception 'STOP [%] : ordre non respecté (attendu : dernière version %, % versions ; constaté : %, %). Rien n''a été modifié.',
      c_version, c_previous, c_count,
      (select max(version) from supabase_migrations.schema_migrations), (select count(*) from supabase_migrations.schema_migrations);
  end if;

  -- 3. Prérequis présents, objets de cette migration absents.
  if not (to_regprocedure('public.record_symbolic_offering_v1(text,text,uuid)') is not null) then
    raise exception 'STOP [20261116120000] : prérequis absent (fonction public.record_symbolic_offering_v1(text,text,uuid)). Rien n''a été modifié.';
  end if;
  if not (to_regprocedure('public.owner_free_publication_status_v1(uuid)') is not null) then
    raise exception 'STOP [20261116120000] : prérequis absent (fonction QG 017 public.owner_free_publication_status_v1(uuid)). Rien n''a été modifié.';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'symbolic_offerings' and column_name = 'signature') then
    raise exception 'STOP [20261116120000] : colonne public.symbolic_offerings.signature existe déjà alors que la version n''est pas enregistrée. Rien n''a été modifié ; prévenir le QG.';
  end if;
  if to_regprocedure('public.sign_symbolic_offering_v1(text,uuid,text)') is not null then
    raise exception 'STOP [20261116120000] : fonction public.sign_symbolic_offering_v1(text,uuid,text) existe déjà alors que la version n''est pas enregistrée. Rien n''a été modifié ; prévenir le QG.';
  end if;

  -- 4. Application : le fichier lui-même, sans ses lignes begin; / commit;
  --    (la transaction est celle de ce DO : tout ou rien).
  execute regexp_replace(c_source, '^(begin|commit);[ \t]*$', '', 'gn');

  -- 5. Inscription dans l'historique, dans la même transaction.
  insert into supabase_migrations.schema_migrations (version, name, statements)
  values (c_version, c_name, array[c_source]);
end
$heritage_install$;

select '20261116120000' as version,
       'lot2_offering_signature' as migration,
       (select count(*) from supabase_migrations.schema_migrations) as versions_enregistrees,
       case when exists (select 1 from supabase_migrations.schema_migrations h
                          where h.version = '20261116120000'
                            and encode(sha256(convert_to(h.statements[1], 'UTF8')), 'hex') = 'caf4fbac85dad8eb2fbbdb0a2a88a5909635d1283e9f6d45240b24b1cc54f6c2')
             and (select count(*) from supabase_migrations.schema_migrations) = 45
            then 'OK — étape 1/5 installée et enregistrée'
            else 'ECHEC — prévenir le QG' end as verdict;
