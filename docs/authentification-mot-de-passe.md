# Compte famille — e-mail + mot de passe, vérification de l'adresse avant publication (QG 003 / QG 004-B)

> **Rien ici n'est appliqué.** Migration, réglages Supabase B, SMTP Brevo et déploiement : GO QG distincts.
> Aucune valeur secrète dans ce document.

## Parcours livrés (PR #99, branche `qg003-auth-reprise`)

| Moment | Écran | Mécanisme |
|---|---|---|
| Inscription | « Créer mon compte » : e-mail ×2 + mot de passe | `signUp` → **session immédiate** (Confirm email désactivé) → brouillon sauvegardé |
| Première sauvegarde | message discret dans le Builder (`?sauvegarde=1`) | échéances de la base : 10 j publication gratuite, 45 j préparation (`anchor_free_memorial_v1`, inchangé) |
| Visites suivantes | « J'ai déjà un compte » | `signInWithPassword` |
| Espace famille | rappel discret des échéances | `free_publish_until`, `free_draft_until` (lecture) |
| **Première publication** | « Confirmez votre adresse e-mail » dans le panneau « Publier » | code à 6 chiffres envoyé à l'adresse **du compte connecté** (`signInWithOtp`, `shouldCreateUser: false`), vérifié côté serveur (`verifyOtp` type `email`), preuve enregistrée par `record_owner_email_verification_v1` |
| Mauvaise adresse | « Ce n'est pas la bonne adresse ? » | mot de passe actuel + code envoyé à la **nouvelle** adresse (`updateUser({ email })`, `verifyOtp` type `email_change`) → `apply_owner_email_change_v1` |
| Mot de passe oublié | code → nouveau mot de passe | `verifyOtp` type `recovery` → **révocation des autres sessions** (`signOut({ scope: "others" })`) → preuve d'adresse → `updateUser({ password })` → nouvelle révocation |

## Garanties (et où elles sont démontrées)

| Garantie | Mécanisme | Preuve |
|---|---|---|
| Publication impossible sans preuve de l'adresse **actuelle** | déclencheur `memorial_published_snapshots_require_verified_email` (HV403) + contrôle serveur préalable | banc SQL « QG 004-B » ; `publish-from-preview.test.ts` |
| `email_confirmed_at` jamais utilisé comme preuve | retiré de `resolve-owner.ts` ; aucune fonction QG 004-B ne le lit | `resolve-owner.test.ts` ; banc (recherche dans le source des fonctions) |
| Droits commerciaux protégés | déclencheurs sur le passage à l'offre complète et le rattachement d'un droit Etsy (HV403) | banc SQL |
| Récupération = révocation des sessions non autorisées | `signOut({ scope: "others" })` dès le code de récupération, avant le nouveau mot de passe ; échec de révocation → arrêt | `actions.test.ts` (ordre vérifié) |
| Un code ne crée pas de preuve non prévue | code envoyé à l'adresse lue côté serveur ; preuve seulement si `verifyOtp` a prouvé **le même compte** et l'adresse actuelle ; sinon déconnexion et rien n'est écrit | `actions.test.ts` ; banc (`email_mismatch`, `no_owner`) |
| Pas de rattachement par adresse seule | propriétaire résolu uniquement par `auth_user_id` (inchangé) | `resolve-owner.test.ts` |
| Permissions SQL | table sans aucun droit (RLS) ; RPC `service_role` seul ; `search_path = ''` ; fonction de déclencheur non exécutable | banc SQL |
| Changement d'adresse sûr | mot de passe actuel exigé ; adresse prise refusée ; **verrou anti-abus HD423 conservé** (adresse figée dès un historique gratuit) | `actions.test.ts` ; banc |

**Correction de l'adresse après la première sauvegarde (complément QG 004-B)** —
migration `20261114130000_qg004b_owner_email_correction.sql` :
- même `owner_id`, même compte Auth : brouillons, publications, droits Etsy/premium, dates 10 j / 45 j /
  visibilité et compteurs gratuits (`memorial_access_events`, par propriétaire) restent identiques ;
  le changement n'écrit aucun événement gratuit ;
- l'ancienne adresse est inscrite à `owner_email_history` ; **réservée** si elle avait été prouvée par
  ce propriétaire : aucun autre compte ne peut la reprendre (HD424), donc pas de quota gratuit neuf ;
  une adresse jamais prouvée (faute de frappe) est libérée — aucune publication gratuite n'a pu s'y faire ;
- HD423 conservé : un changement direct reste refusé ; seul `apply_owner_email_change_v1` (même
  transaction) l'autorise ; verrou de ligne du propriétaire + verrous consultatifs par adresse (triés),
  aussi pris à toute création de propriétaire ;
- nouvelle adresse refusée si elle est celle d'un autre compte ou réservée par un autre propriétaire,
  vérifié avant de demander le changement à Supabase (`owner_email_available_v1`) puis dans la transaction.

**Limites connues (à valider par le QG)**
1. **Adresse réservée** : si une personne quitte une adresse prouvée, puis que cette boîte change de
   titulaire, le nouveau titulaire ne pourra pas l'utiliser sans intervention HERITAGE (rare, voulu
   pour protéger le quota). Le propriétaire d'origine peut, lui, y revenir.
2. **Écart Auth / HERITAGE résiduel** : Supabase change l'adresse Auth avant la transaction HERITAGE ;
   si une autre personne prend la nouvelle adresse entre les deux (fenêtre de quelques secondes,
   vérifiée juste avant), la transaction refuse et le serveur le journalise ; la publication reste
   alors bloquée jusqu'à correction (aucune donnée perdue).
3. **Jetons d'accès déjà émis** : après révocation, le serveur HERITAGE les refuse immédiatement (il
   vérifie la session auprès de Supabase via `getUser`) ; un jeton déjà émis reste accepté par
   Supabase en accès direct jusqu'à son expiration (1 h par défaut, réglable).
4. **Énumération à l'inscription** : sans confirmation native, Supabase indique qu'une adresse existe
   déjà ; message neutre côté HERITAGE, atténuation par CAPTCHA et limites.
5. Le chemin « code de confirmation » (`confirm`) reste dans le code **uniquement** tant que « Confirm
   email » est actif (compatibilité) ; il n'apparaît plus une fois le réglage désactivé.

## Migration (non appliquée)

`supabase/migrations/20261114120000_qg004b_owner_email_verification.sql` — en ajout seul :
table `owner_email_verifications`, fonctions `owner_email_verified_v1`,
`record_owner_email_verification_v1`, `owner_email_change_allowed_v1`, `apply_owner_email_change_v1`,
`require_owner_email_verified_v1` et trois déclencheurs. Aucune donnée existante modifiée.
**Effet à connaître** : après application, toute (re)publication d'un propriétaire existant demandera
une vérification d'adresse unique (les publications déjà en ligne restent en ligne).

## Réglages Supabase B (Dashboard → Authentication), après GO

| # | Réglage | Valeur |
|---|---|---|
| S1 | Email provider / Allow new users to sign up | activés (déjà) |
| S2 | **Confirm email** | **désactivé** — en même temps que le déploiement, jamais avant |
| S3 | Minimum password length / Password requirements | **8** / **aucune** |
| S4 | Prevent use of leaked passwords | offres payantes uniquement ; sinon plancher local du code |
| S5 | Email OTP Length / Expiration | **6** / **600 s** |
| S6 | **Secure email change** | **désactivé** (une adresse mal saisie n'est pas joignable ; le mot de passe actuel est exigé par HERITAGE) |
| S7 | Rate limits | e-mails : 100 / h après SMTP personnalisé ; le reste par défaut |
| S8 | CAPTCHA (Turnstile) | recommandé (clé secrète saisie uniquement dans le Dashboard) |

### Modèles d'e-mail (Emails → Templates) — **sans lien**, code seul

- **Magic Link** (sert à la vérification avant publication) — Sujet : `Votre code HERITAGE : {{ .Token }}`
- **Reset password** — Sujet : `Votre code HERITAGE : {{ .Token }}`
- **Change email address** — Sujet : `Confirmez votre nouvelle adresse : {{ .Token }}`

```html
<p>Saisissez ce code dans la page HERITAGE restée ouverte :</p>
<p style="font-size:28px;font-weight:600;letter-spacing:6px">{{ .Token }}</p>
<p>Ce code est à usage unique et expire dans 10 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.</p>
```

## SMTP Brevo (lot séparé, sans dépendance au code)

Dashboard B → Authentication → Emails → **SMTP Settings** :
hôte `smtp-relay.brevo.com`, port `587`, identifiant = « login SMTP » affiché dans Brevo → *SMTP & API*,
mot de passe = **clé SMTP Brevo dédiée** (saisie uniquement dans le Dashboard), expéditeur
`no-reply@herelys.com` (domaine authentifié : DKIM ×2, DMARC verts), nom `HERITAGE`.
Limites Brevo (offre gratuite) : quota quotidien à vérifier dans le compte Brevo.
**Tests** : récupération de mot de passe vers une adresse hors équipe → réception hors spam ; Gmail
« Afficher l'original » : SPF, DKIM, DMARC = PASS ; journaux Brevo « Délivré ».
**Retour arrière** : désactiver « Custom SMTP ».

## Bascule (ordre) et retour arrière

1. GO SMTP Brevo → configuration + tests (compatible avec le site actuel).
2. GO migration → application sur B (vérifier le banc CI vert au préalable).
3. GO bascule → S2-S8 + modèles **et** déploiement de la PR #99 dans la même fenêtre.
4. Recette PO : inscription immédiate, sauvegarde + message, reconnexion, publication avec code,
   mot de passe oublié (deux navigateurs : la session du premier doit tomber), mauvaise adresse.

Retour arrière : republier le déploiement précédent ; réactiver « Confirm email » ; les déclencheurs
peuvent être retirés par une **nouvelle** migration (la table des preuves est conservée).
