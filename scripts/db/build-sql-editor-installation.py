#!/usr/bin/env python3
"""HERITAGE HOMMAGE — M8-DB-02 : génère les blocs d'installation « SQL Editor ».

Pour chacune des cinq migrations Lot 2 + M8, produit un fichier à coller tel quel
dans le SQL Editor Supabase (aucune CLI) :

  * UNE seule instruction DO (donc tout ou rien, quel que soit le mode d'envoi
    de l'éditeur) qui :
      1. vérifie l'empreinte SHA-256 du texte de la migration embarqué
         (copier-coller altéré = STOP, rien n'est modifié) ;
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

Usage : python3 scripts/db/build-sql-editor-installation.py [--check]
  --check : n'écrit rien, échoue si les fichiers générés ne sont pas à jour.
"""
import hashlib
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
MIG = ROOT / "supabase" / "migrations"
RB = ROOT / "supabase" / "rollbacks"
OUT = ROOT / "supabase" / "installation" / "m8-sql-editor"

PROD = "nudqzbdfnjzlnyffllgs"
OLD = "pbgzyyqdbdrhgnkzmxyn"
HISTORY = "supabase_migrations.schema_migrations"
TXN_LINE = r"^(begin|commit);[ \t]*$"

# (version, nom, sentinelles "absent" avant installation, prérequis présents)
STEPS = [
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
PREVIOUS = "20261116100000"          # dernière version enregistrée en production (QG, M8-DB-02)
BASE_COUNT = 44                       # versions enregistrées avant l'étape 1


def sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def lit(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def source_block(tag: str, text: str) -> str:
    assert f"${tag}$" not in text, tag
    return f"${tag}${text}${tag}$"


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
        f"INSTALLATION {n}/5 — {version}_{name}",
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
  c_source   constant text := {source_block('heritage_source', text)};
  v_lines    integer;
begin
  -- 1. Le texte collé est exactement le fichier de GitHub.
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
            then 'OK — étape {n}/5 installée et enregistrée'
            else 'ECHEC — prévenir le QG' end as verdict;
"""


def rollback_file(n: int) -> str:
    version, name, absent, present = STEPS[n - 1]
    fname = f"{version}_{name}.down.sql"
    text = (RB / fname).read_text(encoding="utf-8")
    txn_lines = sum(1 for l in text.split("\n") if l.rstrip(" \t") in ("begin;", "commit;"))
    after = BASE_COUNT + n
    extra_decl, extra_check, extra_note = "", "", []
    if n == 1:
        extra_decl = "  c_signatures_exportees constant boolean := false;  -- QG : passer à true SEULEMENT après export des signatures décidé\n"
        extra_check = (
            "  if exists (select 1 from public.symbolic_offerings where signature is not null)\n"
            "     and not c_signatures_exportees then\n"
            f"    raise exception 'STOP [{version}] : des signatures existent ; ce retour arrière les EFFACE DÉFINITIVEMENT. Export et décision QG requis (voir c_signatures_exportees). Rien n''a été modifié.';\n"
            "  end if;\n")
        extra_note = ["", "ATTENTION : efface définitivement les signatures reçues.",
                      "Refuse tant que c_signatures_exportees vaut false et qu'une",
                      "signature existe."]
    if n == 2:
        extra_note = ["", "Le script du dépôt REFUSE lui-même s'il existe des contributions",
                      "réelles (erreur « M8-E1 rollback refused ») : rien n'est modifié."]
    h = header(
        f"RETOUR ARRIÈRE {n}/5 — {version}_{name}",
        [f"Source : supabase/rollbacks/{fname}",
         f"SHA-256 du fichier : {sha(text)}",
         "Uniquement sur décision du QG. Ordre inverse : 5, 4, 3, 2, 1.",
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
{extra_decl}  c_source   constant text := {source_block('heritage_source', text)};
  v_lines    integer;
begin
  if encode(sha256(convert_to(c_source, 'UTF8')), 'hex') <> c_sha256 then
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
            then 'OK — retour arrière {n}/5 effectué'
            else 'ECHEC — prévenir le QG' end as verdict;
"""


def state_file(after: bool) -> str:
    files = sorted(p.name for p in MIG.glob("*.sql"))
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
        f"Attendu : uniquement des lignes OK ({'après les 5 étapes' if after else 'avant l étape 1'}).",
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
  union all
  select 'E. info : offrandes symboliques (nombre)', 'information',
         (select count(*)::text from public.symbolic_offerings), 'INFO'
  union all
  select 'E. info : messages (nombre)', 'information',
         (select count(*)::text from public.messages), 'INFO'
  union all
  select 'E. info : médias (nombre)', 'information',
         (select count(*)::text from public.media), 'INFO'
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


def main() -> int:
    check = "--check" in sys.argv
    files = {"00_etat_avant_installation.sql": state_file(False),
             "99_etat_apres_installation.sql": state_file(True)}
    for n in range(1, 6):
        v, name = STEPS[n - 1][0], STEPS[n - 1][1]
        files[f"{n:02d}_installation_{v}_{name}.sql"] = install_file(n)
        files[f"R{n}_retour_arriere_{v}_{name}.sql"] = rollback_file(n)
    stale = []
    for fname, content in files.items():
        p = OUT / fname
        if check:
            if not p.exists() or p.read_text(encoding="utf-8") != content:
                stale.append(fname)
        else:
            OUT.mkdir(parents=True, exist_ok=True)
            p.write_text(content, encoding="utf-8")
    if check and stale:
        print("Fichiers générés absents ou périmés :", *stale, sep="\n  ")
        return 1
    if not check:
        print(f"{len(files)} fichiers écrits dans {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
