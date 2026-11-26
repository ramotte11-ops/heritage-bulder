#!/usr/bin/env python3
"""HERITAGE HOMMAGE — M8-DB-02 : génère les blocs d'installation « SQL Editor ».

Pour chacune des cinq migrations Lot 2 + M8, produit un fichier à coller tel quel
dans le SQL Editor Supabase (aucune CLI) :

  * UNE seule instruction DO (donc tout ou rien, quel que soit le mode d'envoi
    de l'éditeur) qui :
      1. décode le texte de la migration, embarqué en base64 (ASCII pur :
         insensible aux fins de ligne CRLF, aux espaces, à l'indentation, à la
         normalisation Unicode et au retrait des commentaires « -- » que
         peuvent appliquer le presse-papiers ou l'éditeur — cause de l'arrêt
         M8-DB-02 1/5), puis vérifie son empreinte SHA-256 : le texte exécuté
         est le fichier GitHub à l'octet près, sinon STOP et rien n'est
         modifié ;
      2. vérifie la table d'historique, l'ordre (version précédente, nombre
         de lignes) et l'absence de double application ;
      3. vérifie qu'aucun objet de la migration n'existe déjà ;
      4. exécute le texte du fichier, à l'octet près, privé de ses seules
         lignes `begin;` / `commit;` (la transaction est celle du DO) ;
      5. inscrit la version dans supabase_migrations.schema_migrations
         (version, name, statements = texte exact du fichier) ;
  * puis un SELECT en lecture seule qui affiche le verdict.

Produit aussi les blocs de retour arrière (même principe, ordre inverse) et les
deux contrôles d'état en lecture seule (avant / après).

VID-10 : deux lots, chacun dans son dossier et avec son point de départ :
  * m8  : supabase/installation/m8-sql-editor/  (Lot 2 + M8, cinq étapes) ;
  * vid : supabase/installation/vid-sql-editor/ (VID-07, VID-08, VID-09).
Chaque lot ne considère que les migrations jusqu'à sa dernière étape : un
lot plus récent ne périme jamais les fichiers d'un lot plus ancien.

Usage : python3 scripts/db/build-sql-editor-installation.py [--check] [--lot m8|vid]
  --check : n'écrit rien, échoue si les fichiers générés ne sont pas à jour.
  --lot   : un seul lot (par défaut : tous).
"""
import base64
import hashlib
import pathlib
import sys
import textwrap

ROOT = pathlib.Path(__file__).resolve().parents[2]
MIG = ROOT / "supabase" / "migrations"
RB = ROOT / "supabase" / "rollbacks"
OUT = ROOT / "supabase" / "installation" / "m8-sql-editor"   # remplacé par select_lot()

PROD = "nudqzbdfnjzlnyffllgs"
OLD = "pbgzyyqdbdrhgnkzmxyn"
HISTORY = "supabase_migrations.schema_migrations"
TXN_LINE = r"^(begin|commit);[ \t]*$"

# (version, nom, sentinelles "absent" avant installation, prérequis présents)
M8_STEPS = [
    ("20261116120000", "lot2_offering_signature",
     [("colonne", "public.symbolic_offerings.signature",
       "exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'symbolic_offerings' and column_name = 'signature')"),
      ("fonction", "public.sign_symbolic_offering_v1(text,uuid,text)",
       "to_regprocedure('public.sign_symbolic_offering_v1(text,uuid,text)') is not null")],
     [("fonction", "public.record_symbolic_offering_v1(text,text,uuid)",
       "to_regprocedure('public.record_symbolic_offering_v1(text,text,uuid)') is not null"),
      ("fonction QG 017", "public.owner_free_publication_status_v1(uuid)",
       "to_regprocedure('public.owner_free_publication_status_v1(uuid)') is not null")]),
    ("20261119090000", "m8_e1_contributions",
     [("colonne", "public.messages.status",
       "exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'messages' and column_name = 'status')"),
      ("table", "public.contribution_settings",
       "to_regclass('public.contribution_settings') is not null"),
      ("fonction", "public.submit_contribution_v1(text,text,text,text,uuid)",
       "to_regprocedure('public.submit_contribution_v1(text,text,text,text,uuid)') is not null")],
     [("fonction Lot 2", "public.sign_symbolic_offering_v1(text,uuid,text)",
       "to_regprocedure('public.sign_symbolic_offering_v1(text,uuid,text)') is not null"),
      ("fonction QG 017", "public.owner_free_storage_bytes_v1(uuid)",
       "to_regprocedure('public.owner_free_storage_bytes_v1(uuid)') is not null")]),
    ("20261120090000", "m8_e2_owner_contribution_settings",
     [("fonction", "public.read_owner_contribution_settings_v1(uuid,uuid)",
       "to_regprocedure('public.read_owner_contribution_settings_v1(uuid,uuid)') is not null")],
     [("fonction E1", "public.submit_contribution_v1(text,text,text,text,uuid)",
       "to_regprocedure('public.submit_contribution_v1(text,text,text,text,uuid)') is not null")]),
    ("20261121090000", "m8_e3_public_contributions_overview",
     [("fonction", "public.read_public_contributions_overview_v1(text)",
       "to_regprocedure('public.read_public_contributions_overview_v1(text)') is not null")],
     [("fonction E2", "public.read_owner_contribution_settings_v1(uuid,uuid)",
       "to_regprocedure('public.read_owner_contribution_settings_v1(uuid,uuid)') is not null")]),
    ("20261122090000", "m8_e4_public_contributions_reads",
     [("fonction", "public.read_public_contributions_v2(text,integer,timestamptz,uuid,text[])",
       "to_regprocedure('public.read_public_contributions_v2(text,integer,timestamp with time zone,uuid,text[])') is not null"),
      ("fonction", "public.read_public_contributions_by_ids_v1(text,uuid[])",
       "to_regprocedure('public.read_public_contributions_by_ids_v1(text,uuid[])') is not null")],
     [("fonction E3", "public.read_public_contributions_overview_v1(text)",
       "to_regprocedure('public.read_public_contributions_overview_v1(text)') is not null")]),
]

# VID-10 — rubrique vidéo. Point de départ attendu : le lot M8 installé
# (49 versions, dernière 20261122090000). Si la production diffère, le
# fichier 00 le montre et chaque étape s'arrête d'elle-même (STOP ordre).
VID_STEPS = [
    ("20261125090000", "vid07_memorial_videos",
     [("table", "public.memorial_videos",
       "to_regclass('public.memorial_videos') is not null"),
      ("table", "public.memorial_video_events",
       "to_regclass('public.memorial_video_events') is not null"),
      ("fonction", "public.reserve_memorial_video_upload_v1(uuid,uuid,text,integer)",
       "to_regprocedure('public.reserve_memorial_video_upload_v1(uuid,uuid,text,integer)') is not null")],
     [("fonction M8-E4", "public.read_public_contributions_by_ids_v1(text,uuid[])",
       "to_regprocedure('public.read_public_contributions_by_ids_v1(text,uuid[])') is not null"),
      ("fonction", "public.memorial_publicly_visible_v1(uuid,timestamptz)",
       "to_regprocedure('public.memorial_publicly_visible_v1(uuid,timestamp with time zone)') is not null"),
      ("fonction", "public.current_owner_id()",
       "to_regprocedure('public.current_owner_id()') is not null"),
      ("colonne", "public.memorials.access_level",
       "exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'memorials' and column_name = 'access_level')")]),
    ("20261125100000", "vid08_video_publication_reconcile",
     [("colonne", "public.memorial_videos.ready_at",
       "exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'memorial_videos' and column_name = 'ready_at')"),
      ("fonction", "public.claim_memorial_videos_for_reconcile_v1(uuid,timestamptz,integer,integer)",
       "to_regprocedure('public.claim_memorial_videos_for_reconcile_v1(uuid,timestamp with time zone,integer,integer)') is not null")],
     [("table VID-07", "public.memorial_videos",
       "to_regclass('public.memorial_videos') is not null")]),
    ("20261126090000", "vid09_published_replacement",
     [("fonction", "public.release_superseded_memorial_videos_v1(uuid,integer)",
       "to_regprocedure('public.release_superseded_memorial_videos_v1(uuid,integer)') is not null")],
     [("colonne VID-08", "public.memorial_videos.ready_at",
       "exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'memorial_videos' and column_name = 'ready_at')")]),
]

LOTS = {
    "m8": {"steps": M8_STEPS, "previous": "20261116100000", "base_count": 44, "folder": "m8-sql-editor"},
    "vid": {"steps": VID_STEPS, "previous": "20261122090000", "base_count": 49, "folder": "vid-sql-editor"},
}
LOT = "m8"
STEPS = M8_STEPS
PREVIOUS = "20261116100000"          # dernière version enregistrée en production (QG, M8-DB-02)
BASE_COUNT = 44                       # versions enregistrées avant l'étape 1
WORDS = {3: "TROIS", 5: "CINQ"}


def select_lot(name: str) -> None:
    global LOT, STEPS, PREVIOUS, BASE_COUNT, OUT
    lot = LOTS[name]
    LOT, STEPS, PREVIOUS, BASE_COUNT = name, lot["steps"], lot["previous"], lot["base_count"]
    OUT = ROOT / "supabase" / "installation" / lot["folder"]


def step_total() -> int:
    return len(STEPS)


def lot_migration_files() -> list[str]:
    """Les migrations du dépôt jusqu'à la dernière étape du lot (jamais au-delà)."""
    last = STEPS[-1][0]
    return sorted(p.name for p in MIG.glob("*.sql") if p.name[:14] <= last)


def sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def lit(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def source_block(tag: str, text: str) -> str:
    assert f"${tag}$" not in text, tag
    return f"${tag}${text}${tag}$"


def b64_literal(text: str) -> str:
    """Littéral SQL ASCII : base64 du texte UTF-8, par lignes de 76 caractères.

    decode(..., 'base64') ignore les fins de ligne, \\r, espaces et tabulations :
    le littéral survit à tout transport qui ne touche qu'aux blancs, et toute
    autre altération fait échouer le décodage ou l'empreinte (STOP).
    """
    b64 = base64.b64encode(text.encode("utf-8")).decode("ascii")
    return "'\n" + "\n".join(textwrap.wrap(b64, 76)) + "\n'"


def decode_block(version: str, what: str) -> str:
    return (
        "  -- 1. Décodage du texte (base64, ASCII pur), puis contrôle de son empreinte.\n"
        "  begin\n"
        "    c_source := convert_from(decode(c_payload, 'base64'), 'UTF8');\n"
        "  exception when others then\n"
        f"    raise exception 'STOP [{version}] : texte {what} illisible (copier-coller incomplet ou altéré). Rien n''a été modifié.';\n"
        "  end;\n")


def header(title: str, lines: list[str]) -> str:
    body = "\n".join(f"-- {l}" if l else "--" for l in lines)
    return (
        "-- =====================================================================\n"
        f"-- HERITAGE HOMMAGE — {title}\n"
        "-- =====================================================================\n"
        f"{body}\n"
        "-- =====================================================================\n"
    )


COMMON = [
    f"Cible UNIQUE : {PROD} (HERITAGE HOMMAGE - PRODUCTION).",
    f"INTERDIT : {OLD} (projet historique « heritage hommage »).",
    "AVANT de coller : l'adresse du navigateur doit contenir",
    f"  supabase.com/dashboard/project/{PROD}/ . La référence prévaut sur le nom.",
    "Coller TOUT le fichier dans une requête vide du SQL Editor, sans rien",
    "sélectionner, puis « Run ». Une fenêtre peut avertir d'opérations",
    "destructives (drop, revoke) : c'est attendu pour ce fichier.",
    "Fichier généré par scripts/db/build-sql-editor-installation.py :",
    "NE PAS MODIFIER À LA MAIN.",
]


def install_file(n: int) -> str:
    version, name, absent, present = STEPS[n - 1]
    fname = f"{version}_{name}.sql"
    text = (MIG / fname).read_text(encoding="utf-8")
    txn_lines = sum(1 for l in text.split("\n") if l.rstrip(" \t") in ("begin;", "commit;"))
    previous = PREVIOUS if n == 1 else STEPS[n - 2][0]
    before = BASE_COUNT + n - 1
    checks = []
    for kind, label, cond in present:
        checks.append(
            f"  if not ({cond}) then\n"
            f"    raise exception 'STOP [{version}] : prérequis absent ({kind} {label}). Rien n''a été modifié.';\n"
            f"  end if;")
    for kind, label, cond in absent:
        checks.append(
            f"  if {cond} then\n"
            f"    raise exception 'STOP [{version}] : {kind} {label} existe déjà alors que la version n''est pas enregistrée. Rien n''a été modifié ; prévenir le QG.';\n"
            f"  end if;")
    h = header(
        f"INSTALLATION {n}/{step_total()} — {version}_{name}",
        [f"Source : supabase/migrations/{fname}",
         f"SHA-256 du fichier : {sha(text)}",
         "",
         *COMMON,
         "",
         "Résultat attendu : une ligne « OK » (verdict). Toute erreur commençant",
         "par « STOP » ou toute autre erreur : RIEN n'a été modifié ; ne pas",
         "relancer, copier le message et prévenir le QG."])
    return f"""{h}
do $heritage_install$
declare
  c_version  constant text := {lit(version)};
  c_name     constant text := {lit(name)};
  c_previous constant text := {lit(previous)};
  c_count    constant integer := {before};
  c_sha256   constant text := {lit(sha(text))};
  c_txn      constant integer := {txn_lines};
  -- Texte exact de supabase/migrations/{fname}, encodé en base64.
  c_payload  constant text := {b64_literal(text)};
  c_source   text;
  v_lines    integer;
begin
{decode_block(version, 'de la migration')}  -- Le texte décodé est exactement le fichier de GitHub.
  if encode(sha256(convert_to(c_source, 'UTF8')), 'hex') <> c_sha256 then
    raise exception 'STOP [%] : texte de la migration altéré au copier-coller (empreinte différente). Rien n''a été modifié.', c_version;
  end if;
  select count(*) into v_lines from regexp_matches(c_source, '{TXN_LINE}', 'gn');
  if v_lines <> c_txn then
    raise exception 'STOP [%] : structure inattendue (lignes begin/commit). Rien n''a été modifié.', c_version;
  end if;

  -- 2. Historique : présent, à jour, dans l'ordre, sans double application.
  if to_regclass('{HISTORY}') is null then
    raise exception 'STOP [%] : table {HISTORY} absente. Rien n''a été modifié.', c_version;
  end if;
  if exists (select 1 from {HISTORY} where version = c_version) then
    raise exception 'STOP [%] : migration DÉJÀ INSTALLÉE (version présente dans l''historique). Rien n''a été modifié.', c_version;
  end if;
  if (select max(version) from {HISTORY}) is distinct from c_previous
     or (select count(*) from {HISTORY}) <> c_count then
    raise exception 'STOP [%] : ordre non respecté (attendu : dernière version %, % versions ; constaté : %, %). Rien n''a été modifié.',
      c_version, c_previous, c_count,
      (select max(version) from {HISTORY}), (select count(*) from {HISTORY});
  end if;

  -- 3. Prérequis présents, objets de cette migration absents.
{chr(10).join(checks)}

  -- 4. Application : le fichier lui-même, sans ses lignes begin; / commit;
  --    (la transaction est celle de ce DO : tout ou rien).
  execute regexp_replace(c_source, '{TXN_LINE}', '', 'gn');

  -- 5. Inscription dans l'historique, dans la même transaction.
  insert into {HISTORY} (version, name, statements)
  values (c_version, c_name, array[c_source]);
end
$heritage_install$;

select {lit(version)} as version,
       {lit(name)} as migration,
       (select count(*) from {HISTORY}) as versions_enregistrees,
       case when exists (select 1 from {HISTORY} h
                          where h.version = {lit(version)}
                            and encode(sha256(convert_to(h.statements[1], 'UTF8')), 'hex') = {lit(sha(text))})
             and (select count(*) from {HISTORY}) = {before + 1}
            then 'OK — étape {n}/{step_total()} installée et enregistrée'
            else 'ECHEC — prévenir le QG' end as verdict;
"""


def rollback_file(n: int) -> str:
    version, name, absent, present = STEPS[n - 1]
    fname = f"{version}_{name}.down.sql"
    text = (RB / fname).read_text(encoding="utf-8")
    txn_lines = sum(1 for l in text.split("\n") if l.rstrip(" \t") in ("begin;", "commit;"))
    after = BASE_COUNT + n
    extra_decl, extra_check, extra_note = "", "", []
    if LOT == "vid" and n == 1:
        extra_decl = "  c_assets_mux_supprimes constant boolean := false;  -- PO : passer à true SEULEMENT après suppression des assets Mux\n"
        extra_check = (
            "  if to_regclass('public.memorial_videos') is not null\n"
            "     and exists (select 1 from public.memorial_videos where status <> 'deleted')\n"
            "     and not c_assets_mux_supprimes then\n"
            f"    raise exception 'STOP [{version}] : des vidéos hébergées existent ; ce retour arrière SUPPRIME leurs lignes et rendrait leurs assets Mux orphelins (facturés). Supprimer d''abord les assets, puis décision PO (voir c_assets_mux_supprimes). Rien n''a été modifié.';\n"
            "  end if;\n")
        extra_note = ["", "ATTENTION : supprime les tables des vidéos hébergées.",
                      "Refuse tant que c_assets_mux_supprimes vaut false et qu'une",
                      "vidéo non supprimée existe."]
    if LOT == "vid" and n == 3:
        extra_note = ["", "Les anciennes versions encore gardées pour la page publique",
                      "passent en « suppression demandée » (aucune ligne effacée)."]
    if LOT == "m8" and n == 1:
        extra_decl = "  c_signatures_exportees constant boolean := false;  -- QG : passer à true SEULEMENT après export des signatures décidé\n"
        extra_check = (
            "  if exists (select 1 from public.symbolic_offerings where signature is not null)\n"
            "     and not c_signatures_exportees then\n"
            f"    raise exception 'STOP [{version}] : des signatures existent ; ce retour arrière les EFFACE DÉFINITIVEMENT. Export et décision QG requis (voir c_signatures_exportees). Rien n''a été modifié.';\n"
            "  end if;\n")
        extra_note = ["", "ATTENTION : efface définitivement les signatures reçues.",
                      "Refuse tant que c_signatures_exportees vaut false et qu'une",
                      "signature existe."]
    if LOT == "m8" and n == 2:
        extra_note = ["", "Le script du dépôt REFUSE lui-même s'il existe des contributions",
                      "réelles (erreur « M8-E1 rollback refused ») : rien n'est modifié."]
    h = header(
        f"RETOUR ARRIÈRE {n}/{step_total()} — {version}_{name}",
        [f"Source : supabase/rollbacks/{fname}",
         f"SHA-256 du fichier : {sha(text)}",
         f"Uniquement sur décision du QG. Ordre inverse : {', '.join(str(i) for i in range(step_total(), 0, -1))}.",
         *extra_note,
         "",
         *COMMON])
    return f"""{h}
do $heritage_rollback$
declare
  c_version  constant text := {lit(version)};
  c_count    constant integer := {after};
  c_sha256   constant text := {lit(sha(text))};
  c_txn      constant integer := {txn_lines};
{extra_decl}  -- Texte exact de supabase/rollbacks/{fname}, encodé en base64.
  c_payload  constant text := {b64_literal(text)};
  c_source   text;
  v_lines    integer;
begin
{decode_block(version, 'du retour arrière')}  if encode(sha256(convert_to(c_source, 'UTF8')), 'hex') <> c_sha256 then
    raise exception 'STOP [%] : texte du retour arrière altéré au copier-coller. Rien n''a été modifié.', c_version;
  end if;
  select count(*) into v_lines from regexp_matches(c_source, '{TXN_LINE}', 'gn');
  if v_lines <> c_txn then
    raise exception 'STOP [%] : structure inattendue (lignes begin/commit). Rien n''a été modifié.', c_version;
  end if;
  if not exists (select 1 from {HISTORY} where version = c_version) then
    raise exception 'STOP [%] : cette migration n''est pas enregistrée comme installée. Rien n''a été modifié.', c_version;
  end if;
  if (select max(version) from {HISTORY}) <> c_version or (select count(*) from {HISTORY}) <> c_count then
    raise exception 'STOP [%] : une migration plus récente est encore installée ; retirer d''abord les plus récentes. Rien n''a été modifié.', c_version;
  end if;
{extra_check}
  execute regexp_replace(c_source, '{TXN_LINE}', '', 'gn');
  delete from {HISTORY} where version = c_version;
end
$heritage_rollback$;

select {lit(version)} as version,
       (select count(*) from {HISTORY}) as versions_enregistrees,
       case when not exists (select 1 from {HISTORY} where version = {lit(version)})
             and (select count(*) from {HISTORY}) = {after - 1}
            then 'OK — retour arrière {n}/{step_total()} effectué'
            else 'ECHEC — prévenir le QG' end as verdict;
"""


def state_file(after: bool) -> str:
    files = lot_migration_files()
    pending = {s[0] for s in STEPS}
    rows = []
    for f in files:
        v = f[:14]
        expected = "installee" if (after or v not in pending) else "a_installer"
        extra = ""
        if after and v in pending:
            extra = sha((MIG / f).read_text(encoding="utf-8"))
        rows.append(f"    ({lit(v)}, {lit(f[15:-4])}, {lit(expected)}, {lit(extra) if extra else 'null'})")
    total = len(files) if after else len(files) - len(pending)
    sentinels = []
    for version, name, absent, present in STEPS:
        for kind, label, cond in absent:
            want = "present" if after else "absent"
            sentinels.append(
                f"  select 'C. objet ' || {lit(kind + ' ' + label)}, {lit(want)},\n"
                f"         case when {cond} then 'present' else 'absent' end,\n"
                f"         case when ({cond}) = {'true' if after else 'false'} then 'OK' else 'ECHEC' end")
    title = "ÉTAT APRÈS INSTALLATION (LECTURE SEULE)" if after else "ÉTAT AVANT INSTALLATION (LECTURE SEULE)"
    h = header(title, [
        "Ne modifie RIEN : une seule requête SELECT. Ne lit aucune donnée de",
        "famille : seulement des numéros de version, des comptages et le catalogue.",
        f"Attendu : uniquement des lignes OK ({f'après les {step_total()} étapes' if after else 'avant l étape 1'}).",
        "Une seule ligne ECHEC : STOP, copier le tableau et prévenir le QG.",
        "",
        *COMMON[:4]])
    hash_rows = ""
    if after:
        hash_rows = f"""
  union all
  select 'B. texte enregistré ' || a.version, 'empreinte du fichier GitHub',
         coalesce(encode(sha256(convert_to(h.statements[1], 'UTF8')), 'hex'), 'absente'),
         case when encode(sha256(convert_to(h.statements[1], 'UTF8')), 'hex') = a.empreinte then 'OK' else 'ECHEC' end
    from attendu a join {HISTORY} h using (version)
   where a.empreinte is not null"""
    return f"""{h}
with attendu(version, nom, statut, empreinte) as (values
{("," + chr(10)).join(rows)}
),
enregistre as (select version::text as version, name::text as name, statements from {HISTORY})
select controle, attendu, constate, verdict from (
  select 'A. droits du rôle courant sur l''historique' as controle, 'insert et delete' as attendu,
         current_user || ' : insert=' || has_table_privilege('{HISTORY}', 'INSERT')
           || ' delete=' || has_table_privilege('{HISTORY}', 'DELETE') as constate,
         case when has_table_privilege('{HISTORY}', 'INSERT')
               and has_table_privilege('{HISTORY}', 'DELETE') then 'OK' else 'ECHEC' end as verdict
  union all
  select 'D. info : versions dont le nom enregistré diffère du dépôt', 'information',
         (select count(*)::text from enregistre e join attendu a using (version)
           where e.name is not null and e.name <> a.nom)
           || ' (sans nom : ' || (select count(*) from enregistre where name is null) || ')', 'INFO'
  union all
  select 'D. info : versions enregistrées sans texte (statements vide)', 'information',
         (select count(*)::text from enregistre where statements is null or cardinality(statements) = 0), 'INFO'
{info_rows()}
  union all
  select 'E. info : avis_snapshot_keys (réglage de l''offre gratuite)', 'information',
         (select coalesce(array_to_string(avis_snapshot_keys, ','), '(vide)') from public.memorial_access_settings limit 1), 'INFO'
  union all
  select 'A. version ' || a.version || ' ' || a.nom as controle, a.statut as attendu,
         case when e.version is null then 'absente' else 'installee' end as constate,
         case when (a.statut = 'installee') = (e.version is not null) then 'OK' else 'ECHEC' end as verdict
    from attendu a left join enregistre e using (version)
  union all
  select 'A. version inconnue du dépôt ' || e.version, 'aucune', 'installee', 'ECHEC'
    from enregistre e where e.version not in (select version from attendu){hash_rows}
  union all
  select 'A. nombre de versions', '{total}', (select count(*)::text from enregistre),
         case when (select count(*) from enregistre) = {total} then 'OK' else 'ECHEC' end
  union all
  select 'A. colonnes de l''historique', 'version text, name text, statements text[]',
         (select string_agg(column_name || ' ' || data_type, ', ' order by column_name)
            from information_schema.columns
           where table_schema = 'supabase_migrations' and table_name = 'schema_migrations'
             and column_name in ('version', 'name', 'statements')),
         case when (select count(*) from information_schema.columns
                     where table_schema = 'supabase_migrations' and table_name = 'schema_migrations'
                       and ((column_name = 'version' and data_type = 'text')
                         or (column_name = 'name' and data_type = 'text')
                         or (column_name = 'statements' and data_type = 'ARRAY'))) = 3
              then 'OK' else 'ECHEC' end
  union all
{(chr(10) + '  union all' + chr(10)).join(sentinels)}
) t
order by controle;
"""


def info_rows() -> str:
    """Comptages seulement, aucune donnée de famille."""
    if LOT == "m8":
        items = [("offrandes symboliques (nombre)", "select count(*)::text from public.symbolic_offerings"),
                 ("messages (nombre)", "select count(*)::text from public.messages"),
                 ("médias (nombre)", "select count(*)::text from public.media")]
    else:
        items = [("hommages (nombre)", "select count(*)::text from public.memorials"),
                 ("hommages publiés en offre complète (nombre)",
                  "select count(*)::text from public.memorials where status = 'published' and access_level = 'complet'"),
                 ("copies publiées (nombre)", "select count(*)::text from public.memorial_published_snapshots"),
                 ("vidéos hébergées (nombre, 0 avant l'étape 1)",
                  "select case when to_regclass('public.memorial_videos') is null then 'table absente' "
                  "else (select count(*)::text from public.memorial_videos) end")]
    return "\n".join(
        f"""  union all
  select 'E. info : {label}', 'information',
         ({query}), 'INFO'""" for label, query in items)


def diagnostic_file() -> str:
    """Lecture seule : ce que le SQL Editor transmet réellement à PostgreSQL.

    Embarque le fichier Lot 2 DEUX fois : en clair (comme l'ancien bloc 01, qui
    a été altéré) et en base64 (référence). Compare ligne à ligne et nomme la
    cause. Aucune écriture, aucune donnée de famille.
    """
    version, name = STEPS[0][0], STEPS[0][1]
    fname = f"{version}_{name}.sql"
    text = (MIG / fname).read_text(encoding="utf-8")
    h = sha(text)
    n_lines = len(text.split("\n"))
    n_comments = text.count("--")
    head = header("DIAGNOSTIC DU COPIER-COLLER (LECTURE SEULE)", [
        "Ne modifie RIEN : une seule requête SELECT, aucune donnée de famille.",
        f"Compare le texte de supabase/migrations/{fname} tel que le SQL Editor",
        "le transmet (en clair) avec sa référence exacte (en base64).",
        "Coller ce fichier EXACTEMENT comme le fichier 01 (même navigateur, même",
        "méthode), puis « Run ». Envoyer au QG une capture du tableau complet.",
        "",
        "Lecture : la colonne « verdict » nomme la cause. La dernière ligne",
        "(transport base64) doit être OK : elle prouve que la procédure corrigée",
        "fonctionne dans cet éditeur.",
        "",
        *COMMON[:4]])
    return f"""{head}
with
recu as (select {source_block('heritage_source', text)}::text as t),
reference as (select convert_from(decode({b64_literal(text)}, 'base64'), 'UTF8') as t),
lr as (select x.n, x.l from recu, regexp_split_to_table(recu.t, E'\\n') with ordinality as x(l, n)),
la as (select x.n, x.l from reference, regexp_split_to_table(reference.t, E'\\n') with ordinality as x(l, n)),
diff as (
  select coalesce(a.n, r.n) as n, a.l as la, r.l as lr
    from la a full join lr r using (n)
   where a.l is distinct from r.l),
pos as (
  select d.n, d.la, d.lr,
         (select min(i) from generate_series(1, greatest(coalesce(length(d.la), 0), coalesce(length(d.lr), 0)) + 1) as i
           where substr(coalesce(d.la, ''), i, 1) is distinct from substr(coalesce(d.lr, ''), i, 1)) as p
    from diff d),
m as (
  select r.t as recu, f.t as ref,
         encode(sha256(convert_to(r.t, 'UTF8')), 'hex') as h_recu,
         encode(sha256(convert_to(replace(r.t, E'\\r', ''), 'UTF8')), 'hex') as h_sans_cr,
         encode(sha256(convert_to(normalize(replace(r.t, E'\\r', ''), NFC), 'UTF8')), 'hex') as h_nfc,
         encode(sha256(convert_to(f.t, 'UTF8')), 'hex') as h_ref
    from recu r, reference f)
select ordre, controle, attendu, recu, verdict from (
  select 1 as ordre, 'texte reçu : octets' as controle, '{len(text.encode('utf-8'))}' as attendu,
         octet_length(convert_to(recu, 'UTF8'))::text as recu,
         case when octet_length(convert_to(recu, 'UTF8')) = {len(text.encode('utf-8'))} then 'OK' else 'ECART' end as verdict from m
  union all
  select 2, 'texte reçu : lignes', '{n_lines}', (select count(*)::text from lr),
         case when (select count(*) from lr) = {n_lines} then 'OK' else 'ECART' end from m
  union all
  select 3, 'texte reçu : retours chariot (\\r)', '0', (length(recu) - length(replace(recu, E'\\r', '')))::text,
         case when position(E'\\r' in recu) = 0 then 'OK' else 'ECART : fins de ligne Windows (CRLF)' end from m
  union all
  select 4, 'texte reçu : commentaires (double tiret)', '{n_comments}',
         ((length(recu) - length(replace(recu, chr(45) || chr(45), ''))) / 2)::text,
         case when (length(recu) - length(replace(recu, chr(45) || chr(45), ''))) / 2 = {n_comments} then 'OK'
              else 'ECART : commentaires retirés ou modifiés par l''éditeur' end from m
  union all
  select 5, 'texte reçu : forme Unicode NFC', 'oui', case when recu is nfc normalized then 'oui' else 'non' end,
         case when recu is nfc normalized then 'OK' else 'ECART : accents décomposés (Unicode NFD)' end from m
  union all
  select 6, 'empreinte du texte reçu', '{h[:16]}…', left(h_recu, 16) || '…',
         case when h_recu = '{h}' then 'OK : texte intact' else 'ECART' end from m
  union all
  select 7, 'empreinte après retrait des \\r', '{h[:16]}…', left(h_sans_cr, 16) || '…',
         case when h_recu = '{h}' then 'sans objet'
              when h_sans_cr = '{h}' then 'CAUSE : fins de ligne CRLF, seule altération'
              else 'non' end from m
  union all
  select 8, 'empreinte après retrait des \\r et NFC', '{h[:16]}…', left(h_nfc, 16) || '…',
         case when h_recu = '{h}' or h_sans_cr = '{h}' then 'sans objet'
              when h_nfc = '{h}' then 'CAUSE : normalisation Unicode (et/ou CRLF)'
              else 'non : autre altération (voir lignes 20 et suivantes)' end from m
  union all
  select 9, 'lignes différentes', '0', (select count(*)::text from diff),
         case when (select count(*) from diff) = 0 then 'OK' else 'ECART' end from m
  union all
  select * from (
    select 20 + row_number() over (order by p.n) as ordre,
           'ligne ' || p.n || ', caractère ' || p.p as controle,
           'longueur ' || coalesce(length(p.la), 0) || ', hex ' || coalesce(encode(convert_to(substr(p.la, p.p, 8), 'UTF8'), 'hex'), '-') as attendu,
           'longueur ' || coalesce(length(p.lr), 0) || ', hex ' || coalesce(encode(convert_to(substr(p.lr, p.p, 8), 'UTF8'), 'hex'), '-') as recu,
           'ECART' as verdict
      from pos p order by p.n limit 5) premiers
  union all
  select 99, 'transport base64 (procédure corrigée)', '{h[:16]}…', left(h_ref, 16) || '…',
         case when h_ref = '{h}' then 'OK : la procédure corrigée passera' else 'ECHEC : prévenir le QG' end from m
) t
order by ordre;
"""


def transport_file() -> str:
    """Lecture seule : les cinq textes en base64 arrivent intacts (taille comprise)."""
    rows = []
    for version, name, _a, _p in STEPS:
        text = (MIG / f"{version}_{name}.sql").read_text(encoding="utf-8")
        rows.append(f"  ({lit(version + '_' + name)}, {lit(sha(text))},\n   {b64_literal(text)})")
    n = step_total()
    biggest = " (y compris le plus gros, E1)" if LOT == "m8" else ""
    head = header(f"TEST DE TRANSPORT DES {WORDS[n]} MIGRATIONS (LECTURE SEULE)", [
        "Ne modifie RIEN : une seule requête SELECT, aucune donnée de famille.",
        f"Vérifie que les {WORDS[n].lower()} textes, encodés comme dans les fichiers 01 à {n:02d},",
        f"arrivent intacts dans PostgreSQL{biggest}.",
        f"Attendu : {n} lignes OK. Une ligne ECHEC ou une erreur : STOP, prévenir le QG.",
        "",
        *COMMON[:4]])
    return f"""{head}
select migration,
       left(empreinte, 16) || '…' as empreinte_attendue,
       verdict
  from (
    select migration, empreinte,
           case when encode(sha256(decode(texte, 'base64')), 'hex') = empreinte
                then 'OK' else 'ECHEC' end as verdict
      from (values
{("," + chr(10)).join(rows)}
      ) as v(migration, empreinte, texte)
  ) t
 order by migration;
"""


def lot_files() -> dict[str, str]:
    files = {"00_etat_avant_installation.sql": state_file(False),
             "00b_test_transport.sql": transport_file(),
             "99_etat_apres_installation.sql": state_file(True)}
    if LOT == "m8":
        files["00a_diagnostic_copier_coller.sql"] = diagnostic_file()
    for n in range(1, step_total() + 1):
        v, name = STEPS[n - 1][0], STEPS[n - 1][1]
        files[f"{n:02d}_installation_{v}_{name}.sql"] = install_file(n)
        files[f"R{n}_retour_arriere_{v}_{name}.sql"] = rollback_file(n)
    return files


def main() -> int:
    check = "--check" in sys.argv
    lots = list(LOTS)
    if "--lot" in sys.argv:
        lots = [sys.argv[sys.argv.index("--lot") + 1]]
    stale = []
    written = 0
    for lot in lots:
        select_lot(lot)
        for fname, content in lot_files().items():
            p = OUT / fname
            if check:
                if not p.exists() or p.read_text(encoding="utf-8") != content:
                    stale.append(f"{OUT.name}/{fname}")
            else:
                OUT.mkdir(parents=True, exist_ok=True)
                p.write_text(content, encoding="utf-8")
                written += 1
    if check and stale:
        print("Fichiers générés absents ou périmés :", *stale, sep="\n  ")
        return 1
    if not check:
        print(f"{written} fichiers écrits ({', '.join(lots)})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
