# Bascule de `hommages.netlify.app` vers Supabase B — procédure sécurisée

Site conservé : `hommages.netlify.app` (aucun second site). Cible : Supabase B
`nudqzbdfnjzlnyffllgs`. Supabase A : archive, jamais touchée.

Procédure autonome : chaque étape dit **qui**, **quoi**, **contrôle**, **retour
arrière**. Toute personne (Opus, Codex, PO) peut la reprendre à l'étape
indiquée par le § 6 « Reprise ». Rien ici n'est exécuté sans le GO QG/PO.

## 1. Prérequis exacts

| # | Prérequis | Comment le vérifier | État |
|---|---|---|---|
| P1 | PR #98 verte et fusionnable sur `main` | Onglet Checks de la PR : 4 jobs verts | OK (`b654aa9`) |
| P2 | Les 3 clés de B sous la main : URL, anon (publishable), service_role | Dashboard B → Project Settings → API Keys | PO |
| P3 | Les valeurs **actuelles** des 4 variables Netlify, sauvegardées hors dépôt (gestionnaire de mots de passe) avec leur contexte | Netlify → Site configuration → Environment variables | PO, **avant toute modification** |
| P4 | Adresse e-mail de recette : membre de l'organisation Supabase B, jamais utilisée sur B | Dashboard B → Organization → Team | PO |
| P5 | Aucune variable d'équipe (partagée) ne porte A | Netlify → Team settings → Environment variables | PO |
| P6 | Le message de fusion de #98 ne contiendra pas `[skip netlify]` | Le **titre de la PR commence par `[skip netlify]`** : le retirer avant une fusion « squash », ou éditer le message du commit de fusion | QG |

Ce que B impose au code (vérifié) : les 4 variables `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`NEXT_PUBLIC_SITE_URL`. Aucune variable Etsy (périmètre reporté). Les deux
`NEXT_PUBLIC_*` sont figées dans le JavaScript **au moment du build** ; la clé
service_role est lue à l'exécution, mais Netlify ne l'applique qu'au
déploiement suivant. **Changer une variable ne change donc rien en ligne tant
qu'aucun déploiement n'est publié.**

## 2. Ce qui peut interrompre le site ou l'authentification

| Risque | Cause | Parade |
|---|---|---|
| Site mixte (JS sur A, serveur sur B) | Publier un build fait avec des variables partiellement changées | Changer les 4 variables **en une fois**, puis seulement déclencher un build |
| Site cassé ou pages `/hommage/*` en 500 | Clé service_role absente ou d'un autre projet | Contrôle des clés (§ 3, étape 2) **avant** le build |
| Lien magique qui n'aboutit pas | `https://hommages.netlify.app/**` absent des Redirect URLs de B | Étape 3, additive, sans effet sur A |
| Les familles actuelles ne voient plus leur hommage A | Conséquence assumée : A est abandonnée | Communication PO ; A reste intacte et consultable depuis l'ancien code si besoin |
| Déploiement publié sans contrôle | Fusion de #98 = build automatique = publication automatique | **Verrouiller la publication** (Netlify → Deploys → « Lock to stop auto publishing ») avant la fusion : le build se fait, n'est pas publié, se contrôle sur son adresse permanente |
| Le build ne part pas | Message de fusion contenant `[skip netlify]` | P6 |
| Aperçus de PR branchés sur B | Deploy Previews actifs | Les désactiver (étape 1) |

## 3. Ordre d'exécution, avec contrôle après chaque étape

**Étape 0 — Photographie de l'existant (PO, aucun changement)**
Noter : le déploiement actuellement publié (Deploys → le deploy marqué
*Published*, son identifiant et son adresse permanente
`https://<deploy-id>--hommages.netlify.app`), et les 4 variables (P3).
Contrôle : l'adresse permanente du déploiement publié affiche le site.

**Étape 1 — Netlify : variables et garde-fous (GO-1)**
Site configuration → Environment variables : remplacer les 4 variables, **même
valeur dans tous les contextes**, service_role marquée *secret*. Supprimer ou
laisser vides les variables Etsy. Build & deploy → désactiver Deploy
Previews et branch deploys. Deploys → **Lock to stop auto publishing**.
Contrôle : le site en ligne est inchangé (aucun build déclenché). Les 4
variables affichent le contexte *All*.
Retour arrière : remettre les valeurs de P3. Rien n'a été publié.

**Étape 2 — Contrôle des clés (PO, local, sans afficher de valeur)**
```bash
read -rs -p "URL: " U; echo; read -rs -p "ANON: " A; echo; read -rs -p "SERVICE: " S; echo
echo "projet: $(echo "$U" | sed -E 's#https?://([a-z0-9]+)\..*#\1#')   (attendu nudqzbdfnjzlnyffllgs)"
echo "anon -> $(curl -s -o /dev/null -w '%{http_code}' "$U/auth/v1/settings" -H "apikey: $A")   (attendu 200)"
echo "service -> $(curl -s -o /dev/null -w '%{http_code}' "$U/rest/v1/" -H "apikey: $S" -H "Authorization: Bearer $S")   (attendu 200)"
echo "anon refusée en service -> $(curl -s -o /dev/null -w '%{http_code}' "$U/rest/v1/" -H "apikey: $A")   (attendu 401)"
unset U A S
```
Contrôle : les 4 lignes conformes. Sinon, corriger l'étape 1 avant de continuer.

**Étape 3 — Supabase B, Auth (GO-2)**
Authentication → URL Configuration : Site URL = `https://hommages.netlify.app` ;
Redirect URLs : ajouter `https://hommages.netlify.app/**`. Additif : A n'est
pas concernée, aucune session existante n'est touchée.
Contrôle : les deux valeurs apparaissent enregistrées.
Retour arrière : retirer l'entrée ajoutée.

**Étape 4 — Fusion de #98 dans `main` (GO-3a)**
Vérifier P6, fusionner. Le build Netlify démarre ; grâce au verrou, il **n'est
pas publié**.
Contrôle : Deploys → un nouveau deploy *Ready*, non publié, avec son adresse
permanente `https://<deploy-id>--hommages.netlify.app`.
Retour arrière : `git revert -m 1 <sha de fusion>` sur `main` (pas de
force-push) ; le site publié n'a pas changé.

**Étape 5 — Contrôle du build sur son adresse permanente (lecture seule)**
Sur `https://<deploy-id>--hommages.netlify.app` :
- `/creer` → l'écran « Choose your language » ;
- `/hommage/<slug>` des 2 hommages déjà publiés sur B → page affichée avec photos
  (impossible si le build lisait A) ; `/hommage/inconnu` → 404 ;
- `/owner` → redirection vers `/login` ;
- preuve du projet dans le JavaScript :
  ```bash
  SITE=https://<deploy-id>--hommages.netlify.app
  curl -sL "$SITE/login" | grep -o '/_next/static/chunks/[^"]*\.js' | sort -u | while read -r c; do curl -s "$SITE$c"; done | grep -o '[a-z]\{20\}\.supabase\.co' | sort -u
  ```
  attendu : une seule ligne, `nudqzbdfnjzlnyffllgs.supabase.co` (si vide, le
  morceau est chargé plus tard : contrôler via l'onglet Réseau du navigateur).
Ne pas tester le lien magique ici : l'adresse permanente n'est pas dans les
Redirect URLs (volontaire).
Contrôle : tout conforme. Sinon : ne pas publier, revenir à l'étape 1 ou 2.

**Étape 6 — Publication (GO-3b)**
Deploys → sur ce deploy, *Publish deploy*. Puis *Unlock* seulement quand
l'étape 7 est conforme.
Contrôle : refaire l'étape 5 sur `https://hommages.netlify.app`.
Retour arrière (instantané, sans build) : Deploys → ancien deploy noté à
l'étape 0 → *Publish deploy*. Il contient encore les variables A figées au
build : le site revient à l'état d'avant.

**Étape 7 — Recette avec écritures sur B (GO-4)**
`docs/recette-builder-supabase-b.md`, § 4 (11 étapes), avec l'adresse P4.
Contrôle : les 11 résultats attendus. Retour arrière : aucun nécessaire pour
le site ; les lignes de recette restent sur B (voir ce document).

**Étape 8 — Sauvegarde initiale de B (GO-5)**
`scripts/db/backup-supabase.sh backup` puis `verify` (`supabase/README.md`,
« Sauvegardes »).

## 4. Retour arrière — résumé

| Situation | Action | Délai |
|---|---|---|
| Variables changées, rien publié | Remettre les valeurs de P3 | immédiat |
| Build fait, non publié, non conforme | Ne pas publier ; corriger ; relancer un build (*Trigger deploy*) | — |
| Publié, défaut constaté | *Publish deploy* de l'ancien deploy (étape 0) | < 1 min, sans build |
| `main` fusionnée à tort | `git revert -m 1 <sha>` puis build | quelques minutes |
| Redirect URL ajoutée | La retirer | immédiat |

Jamais : `git push --force`, suppression de deploy, modification d'une
migration, action sur A.

## 5. Points où une interruption est dangereuse

| Moment | Danger | Consigne |
|---|---|---|
| Pendant l'étape 1, variables changées une à une | Un build lancé entre deux changements produit un site mixte | Verrouiller la publication **avant** de toucher aux variables ; changer les 4 d'un bloc |
| Entre fusion (étape 4) et publication (étape 6), verrou retiré par erreur | Publication automatique non contrôlée | Ne retirer le verrou qu'après l'étape 7 |
| Entre *Publish deploy* (étape 6) et le contrôle | Site en ligne non vérifié | Enchaîner immédiatement l'étape 5 sur le site |
| Pendant la recette (étape 7), entre « Enregistrer » et la reprise | Un utilisateur Auth créé sans hommage ; sans gravité | Reprendre le lien magique, ou recommencer avec l'adresse (le brouillon local est conservé dans le même navigateur) |
| Pendant une sauvegarde (étape 8) | Fichier incomplet | Relancer ; `verify` le détecte |

Aucune étape ne dépend d'une session d'agent : toutes se font dans les
dashboards Netlify et Supabase, GitHub, et un terminal local.

## 6. Reprise par un autre agent ou par la PO

Déterminer l'état, puis reprendre à l'étape suivante :

```bash
# Code : #98 fusionnée ?
git fetch origin main && git log --oneline -1 origin/main    # un message de fusion de #98 => étape 4 faite
# Site publié : quel projet Supabase ?
SITE=https://hommages.netlify.app   # même commande qu'à l'étape 5
curl -sL "$SITE/login" | grep -o '/_next/static/chunks/[^"]*\.js' | sort -u | while read -r c; do curl -s "$SITE$c"; done | grep -o '[a-z]\{20\}\.supabase\.co' | sort -u
# nudqzbdfnjzlnyffllgs => étape 6 faite ; autre référence ou vide => site encore sur A (ou chunk différé : vérifier dans Netlify quel deploy est publié)
# Page publique de B servie par le site ?
curl -s -o /dev/null -w '%{http_code}\n' "$SITE/hommage/<slug d'un hommage publié sur B>"   # 200 => étape 6 faite
```
Dans Netlify : Deploys → *Published* (quel deploy ?) et l'état du verrou ;
Environment variables → contexte et date de modification des 4 variables.
Dans Supabase B : Redirect URLs (étape 3 faite ou non).

Règles pour celui qui reprend : ne jamais deviner une valeur de clé (demander
à la PO), ne jamais publier un deploy sans l'étape 5, ne jamais retirer le
verrou avant l'étape 7, ne rien faire sur A.
