# Passation — Builder HERITAGE sur Supabase B

Note de reprise pour l'exécutant suivant (Opus, Codex ou PO). Elle complète
`docs/bascule-netlify-supabase-b.md` (procédure détaillée) et
`docs/recette-builder-supabase-b.md` (recette en 11 étapes). Rappels
définitifs : B (`nudqzbdfnjzlnyffllgs`) est la future production ; A reste
intacte ; un seul site Netlify (`hommages.netlify.app`) ; aucune fusion A/B ;
aucun Preview Server.

## 1. État Git exact (11 novembre 2026)

| Élément | Valeur |
|---|---|
| Branche de travail | `claude/heritage-builder-supabase-audit-7jcu0j`, poussée sur `origin` |
| HEAD au moment de cette note | `db238d3` (le commit qui ajoute cette note est le suivant ; `git log -1` fait foi) |
| `main` | `ffbaafb1d780ef15c172dba844ccadec4c462b0c`, non modifiée |
| PR | [#98](https://github.com/ramotte11-ops/heritage-bulder/pull/98), **brouillon, ouverte, non fusionnée**, `mergeable_state: clean`, 33 commits au-dessus de `main` (30 de la pile `qg016-m2-consultation-publique` @ `e0d29ec`, inchangés, + 3 commits de consolidation) |
| CI confirmée verte (4 jobs : banc SQL, lint/tests/types, build Node 24, garde-fou assets) | `6bb230c`, `b654aa9` et `db238d3` ; la CI du commit de cette note est à relire dans l'onglet Checks |
| PR à remplacer par #98 | #96 (Lot 1, ancêtre direct) et #88 (commits déjà rebasés dans la pile) : fermeture à décider par le QG |

Piège connu : le **titre de #98 commence par `[skip netlify]`**. Un squash
reprendrait ce titre et Netlify ne construirait pas. Retirer le préfixe du
message de fusion.

## 2. Validé réellement / reste à tester

**Validé (exécuté, pas seulement lu)**

- Code : lint, 5 093 tests, typegen, tsc, build, banc SQL 1 434 contrôles (dont 48 contrôles C3, contre-épreuve : 11 rouges sans la migration C3).
- Schéma de B identique aux migrations : 22 tables, 184 colonnes, 38 fonctions et signatures (lecture seule de B).
- Clés de B valides (Auth, REST), bucket `memorial-media` privé (15 Mo, JPEG/PNG/WebP), Auth e-mail active avec confirmation d'adresse.
- Builder invité `/creer` en navigateur réel, desktop et iPhone 13 : 12 écrans, photo, cadrage, ambiance, galerie, aperçu, rechargement (brouillon conservé), écran d'enregistrement. Aucune requête réseau.
- Page publique `/hommage/[slug]` servie par l'application reliée à B (lecture seule, en local) : les 2 hommages déjà publiés sur B s'affichent avec leurs 6 photos signées, `noindex` ; slug inconnu → 404 ; `/owner` et `/builder/<id>` sans session → `/login`.
- `scripts/db/backup-supabase.sh` : dump + restauration vérifiés sur une base locale (22 tables, comptages identiques).

**Reste à tester (impossible sans écriture sur B ou sans accès aux dashboards)**

- Lien magique de bout en bout (envoi, réception, `/auth/callback`, reprise `/brouillon/reprise`), transfert des photos, saisie authentifiée, publication réelle depuis l'aperçu, « Voir mon hommage ».
- Variables Netlify, Redirect URLs et SMTP de B.
- Sauvegarde réelle de B (jamais exécutée sur B).

## 3. Procédure de basculement, précautions corrigées

Ordre détaillé : `docs/bascule-netlify-supabase-b.md` § 3. Trois corrections s'y
ajoutent et **prévalent** en cas de divergence.

**Précaution 1 — Fonctions serveur Netlify.** Ne pas supposer qu'un changement
de variables, ou un retour arrière par republication d'un ancien deploy, est
sans effet sur les fonctions serveur (Next.js tourne dans des fonctions
Netlify ; la clé service_role y est lue à l'exécution et Netlify peut
l'injecter au moment de la publication, pas seulement au build). Après
**chaque** publication ou republication, vérifier explicitement, sur
`https://hommages.netlify.app` :

- `GET /hommage/<slug publié sur B>` → attendu après bascule : 200 ; après
  retour arrière vers l'ancien deploy (code `main` sans route `/hommage`) :
  404. Un 500 signale une clé service_role absente ou étrangère au projet.
- `GET /owner` → redirection vers `/login` (fonction serveur vivante).
- La référence du projet dans le JavaScript (commande du § 5 de la procédure) :
  `nudqzbdfnjzlnyffllgs` après bascule.
- Après un retour arrière, refaire ces trois contrôles et constater le
  comportement de l'ancien deploy avant de déclarer le retour réussi.

**Précaution 2 — Sauvegarder B avant toute écriture de recette.** L'étape
« sauvegarde initiale » passe **avant** la recette (GO-5 avant GO-4) :

1. `SUPABASE_DB_URL=… scripts/db/backup-supabase.sh backup backups/` puis
   `verify` sur le fichier : couvre le schéma `public` (données, fonctions,
   politiques).
2. **Auth** : non couvert par le script. Confirmer la couverture par
   Dashboard B → Database → Backups (plan payant : sauvegardes quotidiennes
   de toute la base, `auth` compris) ou, sur plan gratuit, par un `pg_dump`
   complémentaire du schéma `auth` (`--schema=auth`, même chaîne de
   connexion) à faire et à conserver chiffré.
3. **Storage** : non couvert. Confirmer en listant le bucket
   `memorial-media` (Dashboard → Storage) et en exportant ses objets (22 au
   11/11) avec la clé service_role, ou en notant explicitement que les 2
   hommages de test et leurs photos sont sacrifiables.
4. Ne lancer la recette qu'une fois ces trois couvertures confirmées par
   écrit par la PO.

**Précaution 3 — SMTP et Magic Links avant ouverture aux familles.** Sans SMTP
personnalisé, l'expéditeur intégré de Supabase est limité en débit et
n'envoie, pour un projet récent, qu'aux membres de l'organisation. Avant la
recette : utiliser une adresse de membre. **Avant la première famille** :
configurer un SMTP (Dashboard B → Authentication → Emails → SMTP ;
ressource potentiellement payante, GO PO), puis prouver le circuit avec une
adresse **extérieure** à l'organisation : réception du lien, ouverture dans
le même navigateur, arrivée sur `/brouillon/reprise` connecté. Tant que ce
test n'est pas vert, le Builder n'est pas ouvert aux familles.

## 4. Premier GO recommandé : une seule opération, sûre et vérifiable

**GO-0 — Photographie et verrou, sans aucun changement de valeur.**
Dans Netlify : (a) noter l'identifiant et l'adresse permanente du deploy
actuellement publié ; (b) copier les 4 variables actuelles (noms, contextes,
valeurs) dans le gestionnaire de mots de passe ; (c) activer **Lock to stop
auto publishing**.

- Pourquoi celle-là : elle ne modifie ni valeur, ni code, ni base ; elle rend
  toutes les étapes suivantes réversibles et empêche toute publication
  accidentelle (y compris si quelqu'un fusionne #98 trop tôt).
- Vérification : le site répond comme avant ; dans Deploys, le cadenas est
  affiché ; l'adresse permanente notée affiche le site.
- Retour arrière : *Unlock*. Rien d'autre à défaire.

Le GO suivant (GO-1, variables → B d'un bloc) ne se donne qu'après GO-0.

## 5. Points de STOP et reprise après interruption

**STOP obligatoires** (ne pas enchaîner sans nouveau GO) : avant de changer
les variables (GO-1) ; avant d'ajouter la Redirect URL (GO-2) ; avant la
fusion de #98 (GO-3a) ; avant *Publish deploy* (GO-3b) ; avant la première
écriture de recette (GO-4, après la sauvegarde GO-5) ; avant toute dépense
(SMTP, plan Supabase).

**Si l'exécutant est interrompu**, le suivant détermine l'état sans secret
(`docs/bascule-netlify-supabase-b.md` § 6) :

```bash
git fetch origin main && git log --oneline -1 origin/main        # #98 fusionnée ?
SITE=https://hommages.netlify.app
curl -s -o /dev/null -w '%{http_code}\n' "$SITE/hommage/<slug publié sur B>"   # 200 => bascule publiée
curl -sL "$SITE/login" | grep -o '/_next/static/chunks/[^"]*\.js' | sort -u | while read -r c; do curl -s "$SITE$c"; done | grep -o '[a-z]\{20\}\.supabase\.co' | sort -u
```

puis lit dans Netlify le deploy *Published* et l'état du verrou, et dans
Supabase B les Redirect URLs. Il reprend à la première étape non faite, sans
jamais : deviner une clé, publier sans le contrôle de l'étape 5, retirer le
verrou avant la recette, toucher à A, forcer un push, modifier une migration.

Si l'interruption survient pendant la recette : au pire un compte Auth sans
hommage, ou un hommage à moitié transféré. Le brouillon local reste dans le
navigateur ; reprendre par le lien magique ou recommencer avec l'adresse de
recette. Aucune action sur le site.
