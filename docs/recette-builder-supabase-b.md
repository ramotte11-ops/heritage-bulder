# Mise en service du Builder sur Supabase B — procédure et recette

Supabase B (`nudqzbdfnjzlnyffllgs`) est la base de production d'HERITAGE
HOMMAGE. Supabase A est une archive : jamais lue, jamais écrite, jamais
fusionnée. Hébergement : Netlify classique, sans Preview Server.

Ce document est la procédure, dans l'ordre, avec les points de GO de la
Product Owner. Rien de ce qui suit n'est exécuté sans le GO indiqué.

## 0. Ce qui est déjà vérifié (branche de la PR #98, `6bb230c`)

| Vérification | Méthode | Résultat |
|---|---|---|
| Schéma de B = migrations du dépôt | Lecture seule de B (22 tables, 184 colonnes, 38 fonctions et leurs signatures) comparée à une base jetable rejouant les migrations | Identique |
| Sécurité C3 | Banc SQL local, 1 434 contrôles | 0 échec |
| Clés et services de B | Lecture seule : Auth, REST, bucket `memorial-media` (privé, 15 Mo, JPEG/PNG/WebP) | Conformes |
| Builder invité `/creer` | Exécution réelle en navigateur, desktop et iPhone 13 : langue → identité → A00 → phrase → photo → cadrage → ambiance → cérémonie → mots → galerie (3 photos) → aperçu → rechargement → écran d'enregistrement | Aucune erreur, aucune requête réseau sortante, brouillon conservé au rechargement |
| Page publique `/hommage/[slug]` reliée à B | Application lancée localement avec les clés de B, lecture seule, desktop et mobile, sur les 2 hommages déjà publiés | HTTP 200, 6 photos signées chargées depuis B, `noindex`, 0 requête d'écriture ; slug inconnu → 404 ; `/owner` et `/builder/<id>` sans session → `/login` |
| Sauvegarde / restauration | `scripts/db/backup-supabase.sh` : dump puis restauration dans une base jetable, comptage ligne à ligne | Vérifié sur une base locale (pas encore sur B : GO-5) |

Ce qui n'a pas pu être vérifié d'ici : les variables Netlify, les redirections
Auth et l'expéditeur d'e-mails de B (API et dashboard inaccessibles depuis la
session), et la saisie authentifiée (nécessite une écriture sur B).

## 1. Hébergement : relier le site Netlify à B — GO-1

Le site Netlify existant pointe vers A dans tous les contextes. A étant
abandonnée, le site est rebranché sur B. Dans Site configuration →
Environment variables, **même valeur pour tous les contextes** :

| Variable | Valeur | Remarque |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://nudqzbdfnjzlnyffllgs.supabase.co` | Figée dans le JavaScript au build |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé anon (publishable) de B | Idem |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service_role de B, marquée « secret » | Exécution seulement ; sans elle, toute page `/hommage/*` répond 500 |
| `NEXT_PUBLIC_SITE_URL` | `https://<site>.netlify.app` | Valeur de secours ; le lien magique utilise l'hôte de la requête |

- Ne définir **aucune variable Etsy** : la page d'activation propose alors
  la clé seule (périmètre reporté).
- Vérifier qu'aucune variable de niveau équipe (partagée) ne porte encore A.
- Désactiver les Deploy Previews et les branch deploys.

Contrôle des clés, à lancer localement, sans afficher de valeur (une clé d'un
autre projet est refusée par B avec un code 401) :

```bash
read -rs -p "URL: " U; echo; read -rs -p "ANON: " A; echo; read -rs -p "SERVICE: " S; echo
echo "projet: $(echo "$U" | sed -E 's#https?://([a-z0-9]+)\..*#\1#')   (attendu nudqzbdfnjzlnyffllgs)"
echo "anon -> $(curl -s -o /dev/null -w '%{http_code}' "$U/auth/v1/settings" -H "apikey: $A")   (attendu 200)"
echo "service -> $(curl -s -o /dev/null -w '%{http_code}' "$U/rest/v1/" -H "apikey: $S" -H "Authorization: Bearer $S")   (attendu 200)"
echo "anon refusée en service -> $(curl -s -o /dev/null -w '%{http_code}' "$U/rest/v1/" -H "apikey: $A")   (attendu 401)"
unset U A S
```

## 2. Auth de B — GO-2

Dans Authentication → URL Configuration → Redirect URLs, ajouter
`https://<site>.netlify.app/**`. Sans cette entrée, le lien magique renvoie
vers la Site URL de B et la reprise échoue. La Site URL peut aussi être mise
à `https://<site>.netlify.app`.

**E-mails.** Sans SMTP personnalisé, l'expéditeur intégré de Supabase est
limité (quelques e-mails par heure) et, pour un projet récent, n'envoie
qu'aux adresses des membres de l'organisation. Pour la recette : utiliser
l'adresse d'un membre, ou configurer un SMTP (GO-SMTP, ressource
potentiellement payante). **Pour les premières familles, un SMTP est
indispensable.**

## 3. Mise en ligne — GO-3

1. Fusionner la PR #98 dans `main` (squash ou merge, **sans** `[skip netlify]`
   dans le message de fusion, sinon Netlify ne construit pas).
2. Vérifier le déploiement Netlify : build vert, Node 24.
3. Preuves de connexion à B, sans écriture : `/hommage/<slug>` des 2 hommages
   déjà publiés s'affiche ; `/creer` s'ouvre ; `/hommage/inconnu` → 404.

Tant que le site est relié à A, **ne pas fusionner** : le nouveau Builder
écrirait sur A dès la première sauvegarde.

## 4. Recette réelle (écrit sur B) — GO-4

Pré-requis : une adresse e-mail **dédiée**, jamais utilisée sur B (un brouillon
gratuit actif ou un quota consommé bloqueraient la sauvegarde ou la
publication).

| # | Étape | Résultat attendu | Écrit sur B |
|---|---|---|---|
| 1 | `/creer` (navigation privée neuve) | Builder invité | rien |
| 2 | Langue, Bienvenue, nom et dates, A00, phrase, **photo principale**, cadrage, ambiance, cérémonie, mots, galerie | Aperçu fidèle ; brouillon conservé après rechargement | rien |
| 3 | « Enregistrer mon hommage » → adresse de test | « Un lien vient de vous être envoyé. Consultez votre boîte mail. » | utilisateur Auth |
| 4 | Lien magique, **même navigateur** → `/brouillon/reprise` | « Votre hommage est enregistré. », puis ouverture du Builder authentifié | `owners`, `entitlements`, `memorials`, `memorial_drafts`, `guest_draft_transfers`, `media` + objets, audit |
| 5 | Fermer, `/login`, lien magique, `/owner` | Hommage listé, « Ouvrir l'atelier » reprend où il en était | rien |
| 6 | Modifier un texte, recharger | Modification conservée | `memorial_drafts`, audit |
| 7 | Aperçu privé | Identique à ce qui sera publié | rien |
| 8 | « Publier », confirmer ; second clic | Succès ; le second clic ne crée rien | `memorials` (published, slug), `memorial_published_snapshots` |
| 9 | `/owner` | « Voir mon hommage » | rien |
| 10 | `/hommage/<slug>` dans un navigateur non connecté, desktop et mobile | Hommage publié, photos, `noindex` | rien |
| 11 | `/hommage/inconnu` ; `/builder/<id>` sans session ; `/builder/<id>` d'un autre compte | 404 ; `/login` ; 404 | rien |

Ne pas déposer d'Offrande pendant la recette (écrit `symbolic_offerings`),
sauf GO spécifique. La publication gratuite consomme la fenêtre gratuite de
l'adresse (12 mois) et aucun écran ne dépublie.

Après la recette, en lecture seule : `qg008_lot3_v4_postflight.sql` et
`qg016_m1_postflight.sql` → zéro `ECHEC`. `c3_security_postflight.sql`
échouera sur ses seuls comptages (il fige les 82 lignes de B au 11/11) ; ses
contrôles de sécurité doivent rester OK.

## 5. Sauvegardes — GO-5

`scripts/db/backup-supabase.sh` (voir `supabase/README.md`, « Sauvegardes »).
Première exécution sur B avec `SUPABASE_DB_URL` (lecture de B, écriture
locale), puis `verify` du fichier obtenu. À planifier avant l'arrivée des
familles, puis régulièrement. Les photos (bucket) ne sont pas dans le dump :
voir le README.

## 6. Décisions ouvertes (hors GO technique)

- La page d'accueil `/` reste la page technique de fondation ; l'adresse du
  Builder pour une famille est `/creer`. Une redirection de `/` vers `/creer`
  est une petite modification, sur décision PO.
- Aucun écran ne modifie ou ne dépublie un hommage publié (connu depuis
  l'audit).
