# Recette réelle — Builder ↔ Supabase B

Protocole de la recette complète **Création → saisie → sauvegarde → reprise →
aperçu → publication → page publique**, sur la branche de consolidation, contre
Supabase B (`nudqzbdfnjzlnyffllgs`).

> **Cette recette écrit sur B. Elle ne commence qu'après un GO explicite du QG
> et de la PO.** Supabase A n'est jamais utilisée. Aucun déploiement Netlify :
> l'application tourne en local (`next dev` ou `next build && next start`).

## 0. Pré-requis (lecture seule, avant le GO)

| Contrôle | Comment | Attendu |
|---|---|---|
| Code | `git rev-parse HEAD` sur la branche de la PR de consolidation | SHA annoncé par le QG |
| Validation | `npm ci && npm run lint && npm test && npx next typegen && npx tsc --noEmit && npm run build` et `npm run db:test` | sept `exit 0` |
| Variables `.env.local` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL` (noms seulement, voir `.env.example`) | URL = projet B ; jamais A |
| Auth B → URL Configuration | La valeur de `NEXT_PUBLIC_SITE_URL` (ex. `http://localhost:3000`) figure dans les Redirect URLs | sinon le lien magique échoue |
| Auth B | Fournisseur e-mail actif, confirmation d'adresse exigée | vérifié le 11/11 en lecture : oui / oui |
| Adresse de test | Une adresse **dédiée**, jamais utilisée sur B (sinon « brouillon gratuit déjà actif » ou quota consommé) | voir « Effets » ci-dessous |

## 1. Parcours

| # | Étape | Action | Résultat attendu | Écrit sur B |
|---|---|---|---|---|
| 1 | Création | Ouvrir `/creer` (navigation privée neuve) | Builder invité, aucune requête Supabase | rien |
| 2 | Saisie | Langue, Bienvenue, nom et dates, phrase, **photo principale**, A00 et les rubriques voulues, galerie | Aperçu local fidèle ; le brouillon survit à un rechargement (IndexedDB) | rien |
| 3 | Sauvegarde | « Enregistrer mon hommage » → `/brouillon/sauvegarder`, saisir l'adresse de test | « Un lien vient de vous être envoyé. Consultez votre boîte mail. » | utilisateur Auth (non confirmé) |
| 4 | Reprise | Ouvrir le lien magique **dans le même navigateur** → `/brouillon/reprise` | « Votre hommage est enregistré. », contenu et photos copiés, puis ouverture du Builder authentifié | `owners`, `entitlements` (avis), `memorials` (draft), `memorial_drafts`, `guest_draft_transfers`, `media` + objets `memorial-media`, `memorial_edit_audit_events` |
| 5 | Reprise (2) | Fermer l'onglet, se reconnecter via `/login`, `/owner` | L'hommage est listé ; « Ouvrir l'atelier » rouvre le parcours là où il en était | rien (lecture) |
| 6 | Saisie authentifiée | Modifier un texte, recharger | Modification conservée (sauvegarde automatique) | `memorial_drafts`, audit |
| 7 | Aperçu | Ouvrir l'aperçu privé | Rendu identique à ce qui sera publié ; rubriques réservées à l'offre complète signalées | rien |
| 8 | Publication | « Publier », confirmer | Message de succès ; un second clic ne crée rien (`already_published`) | `memorials` (published, slug), `memorial_published_snapshots` ; `symbolic_offering_eligibility` si la migration QG 016 Offrandes est appliquée sur B (non vérifiable en lecture) |
| 9 | Espace famille | `/owner` | Lien « Voir mon hommage » présent | rien |
| 10 | Page publique | Ouvrir `/hommage/<slug>` **dans un navigateur non connecté** | Hommage publié (instantané, jamais le brouillon), photos signées ; `noindex` | rien (lecture) |
| 11 | Négatifs | `/hommage/inconnu` ; `/builder/<id>` sans session ; `/builder/<id>` avec un autre compte | 404 ; redirection `/login` ; 404 | rien |

Ne **pas** déposer d'Offrande pendant cette recette (écrit `symbolic_offerings`),
sauf GO spécifique.

## 2. Contrôles lecture seule après la recette

- `supabase/verifications/qg008_lot3_v4_postflight.sql` et
  `qg016_m1_postflight.sql` : zéro `ECHEC`.
- `supabase/verifications/c3_security_postflight.sql` : **attendu en échec sur
  ses seuls comptages** (il fige les 82 lignes de B au 11/11 ; la recette en
  ajoute). Les autres contrôles doivent rester OK : à relire ligne à ligne,
  pas à « corriger ».

## 3. Effets à connaître avant le GO

- **Quota gratuit** : la publication gratuite (« avis ») consomme la fenêtre
  gratuite de l'adresse de test (règle V8 : 12 mois glissants).
- **Irréversible depuis l'interface** : aucun écran ne dépublie ni ne modifie
  un hommage publié ; le slug reste consultable tant que l'avis est
  publiquement visible.
- Les lignes créées restent sur B (aucun script de nettoyage n'est fourni).

## 4. Critère de réussite

Les 11 étapes au résultat attendu, captures à l'appui (desktop et mobile pour
les étapes 7 et 10), et les postflights du § 2 conformes.
