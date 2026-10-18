# Sécurité V1 — Lot 2 : persistance des modifications familiales

## Objectif et périmètre

Ce lot raccorde la politique pure du Lot 1 aux quatre écritures serveur
existantes suivantes : sauvegarde du brouillon, visibilité d'une rubrique,
langue et variante claire/sombre. Il ne modifie ni l'UX ni les règles
artistiques.

Les actions média Hero/Galerie, la publication, la fermeture de cérémonie,
les contributions et les bougies restent hors périmètre. La fermeture de
cérémonie n'ayant pas de fait durable, toute modification de son contenu
après publication reste refusée par précaution.

## Mécanisme

Chaque action réauthentifie la requête, relit par RLS le mémorial et son
brouillon, calcule côté serveur le diff réel avec la valeur stockée, puis
demande une décision à `authorizeMemorialEdit`. Un champ inconnu ou une seule
mutation interdite refuse l'intégralité de la sauvegarde.

La migration `20261018140637_memorial_edit_persistence_v1.sql` ajoute :

- une révision monotone sur `memorial_drafts` ;
- deux RPC transactionnels privés pour les écritures de brouillon et de
  configuration ;
- `memorial_edit_audit_events`, journal structurel append-only des seules
  modifications postérieures à la première publication.

Les RPC verrouillent le mémorial, revérifient propriétaire, statut et date de
première publication, puis appliquent un compare-and-swap. Le brouillon
compare sa révision ; la configuration compare la valeur courante. Une
concurrence renvoie SQLSTATE `40001`, sans nouvelle tentative ni faux succès.
La mutation et son événement d'audit sont dans la même transaction.

## Données d'audit et permissions

Le journal contient uniquement l'identifiant du mémorial, l'identifiant du
propriétaire acteur, l'opération, les chemins métier autorisés, le statut, la
révision éventuelle et la date. Aucun texte familial, réponse, légende, URL ou
contenu JSON n'y est copié.

`PUBLIC`, `anon`, `authenticated` et `service_role` n'ont aucun accès direct à
la table d'audit. Les RPC `SECURITY DEFINER` fixent un `search_path` vide ;
leur exécution est révoquée à `PUBLIC`, `anon` et `authenticated`, puis accordée
uniquement à `service_role`.

Limite transitoire explicite : les droits directs historiques sur le brouillon
et certains champs de configuration ne sont pas encore révoqués, car les
actions média hors périmètre en dépendent. Ce lot sécurise donc les quatre
Server Actions raccordées, mais ne prétend pas fermer tout le périmètre
post-publication.

## Déploiement et vérification

La migration est préparée dans Git uniquement. Elle ne doit pas être appliquée
à un projet réel avant revue QG et avant prise en charge des chemins média
restants. Aucun rollback destructif n'est fourni : toute évolution ultérieure
doit être une nouvelle migration append-only.

Le harnais `npm run db:test` rejoue toutes les migrations dans un PostgreSQL
jetable et vérifie notamment : CAS brouillon, conflit autosave/visibilité,
course autosave/publication, CAS de configuration, propriété, atomicité de
l'audit et privilèges. Il exige `bash` et les binaires serveur PostgreSQL 13+ ;
une absence de ces prérequis doit être signalée comme QA non exécutée, jamais
remplacée par un test sur Supabase réel.
