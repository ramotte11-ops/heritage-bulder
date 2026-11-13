# Compte famille : e-mail + mot de passe (QG 003)

> **Configuration Supabase B à appliquer uniquement après GO QG.** Rien n'a été modifié sur B.
> Aucune valeur secrète dans ce document.

## Parcours livrés (branche `qg003-auth-reprise`)

| Écran | Action serveur (`accountAction`, champ `intent`) | Supabase Auth |
|---|---|---|
| « Créer mon compte » | `signup` | `signUp(email, password)` |
| Code de confirmation (1re fois) | `confirm` / `resend_confirm` | `verifyOtp({ type: "email" })` / `resend({ type: "signup" })` |
| « J'ai déjà un compte » | `signin` | `signInWithPassword` |
| « Mot de passe oublié » | `forgot` / `resend_reset` | `resetPasswordForEmail` |
| Code de récupération | `verify_reset` | `verifyOtp({ type: "recovery" })` |
| Nouveau mot de passe | `new_password` | `updateUser({ password })` |

Les codes se saisissent **dans l'onglet** qui les a demandés : aucune dépendance au navigateur qui
ouvre l'e-mail (échec PKCE prouvé le 13/11/2026). Le transfert du brouillon (`/brouillon/reprise`)
exige toujours `email_confirmed_at` — inchangé. Aucun code n'est utilisé pour la connexion
quotidienne.

**Comptes administrateurs** (créés sans mot de passe) : `/login` → « J'ai déjà un compte » →
« Mot de passe oublié ? » → code e-mail → nouveau mot de passe. C'est la procédure de récupération,
testée automatiquement ; aucun contournement.

## Opérations Supabase B à valider (Dashboard → Authentication)

| # | Où | Réglage | Valeur |
|---|---|---|---|
| S1 | Sign In / Providers → Email | Enable Email provider / Allow new users to sign up | **activés** |
| S2 | idem | **Confirm email** | **activé** (le transfert exige une adresse confirmée) |
| S3 | idem | Minimum password length | **8** |
| S4 | idem | Password requirements | **aucune** (« No required characters ») |
| S5 | Attack Protection | **Prevent use of leaked passwords** | **activé si disponible** — fonction des offres payantes Supabase (Pro et +). Non vérifiable avec l'accès actuel (lecture base uniquement) : à constater par la PO dans le Dashboard. |
| S6 | idem | Email OTP Length / Expiration | **6** / **600 s** recommandé |
| S7 | Emails → Templates | **Confirm signup** et **Reset password** | afficher `{{ .Token }}` (modèles ci-dessous) |
| S8 | Rate Limits | défauts | conservés (affichés « Trop de tentatives… ») |

Si S5 n'est pas disponible : le code applique déjà un **plancher local** (8 caractères,
72 octets max., ~90 mots de passe les plus courants, refus de l'adresse elle-même). Option
supplémentaire **non intégrée**, à décider par le QG : interroger l'API publique *Pwned Passwords*
(k-anonymat : seuls 5 caractères d'empreinte SHA-1 sortent ; gratuit, sans clé ; dépendance
réseau externe à chaque inscription ; en cas d'indisponibilité, on accepte et on journalise).

### Modèle « Confirm signup » — Sujet : `Votre code HERITAGE : {{ .Token }}`

```html
<h2>Bienvenue sur HERITAGE</h2>
<p>Pour confirmer votre adresse, saisissez ce code dans la page HERITAGE restée ouverte :</p>
<p style="font-size:28px;font-weight:600;letter-spacing:6px">{{ .Token }}</p>
<p>Ce code est à usage unique et expire rapidement. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.</p>
```

### Modèle « Reset password » — Sujet : `Votre code HERITAGE : {{ .Token }}`

```html
<h2>Mot de passe oublié</h2>
<p>Saisissez ce code dans la page HERITAGE restée ouverte, puis choisissez un nouveau mot de passe :</p>
<p style="font-size:28px;font-weight:600;letter-spacing:6px">{{ .Token }}</p>
<p>Ce code est à usage unique et expire rapidement. Si vous n'avez rien demandé, ignorez ce message : votre mot de passe reste inchangé.</p>
```

(Aucun lien dans ces modèles : le code suffit et évite l'ouverture dans un autre navigateur.)

## Recette PO après application (Chrome mobile normal et privé, PC)

1. `/creer` → hommage → « Enregistrer » → « Créer mon compte » → code reçu → hommage enregistré.
2. Fermer Chrome ; rouvrir `/login` → e-mail + mot de passe → espace famille, sans e-mail.
3. « Mot de passe oublié » → code → nouveau mot de passe → connexion.
4. Mot de passe `12345678` ou de 7 caractères → refusé avec explication.
5. Compte administrateur : définir le mot de passe via « Mot de passe oublié », puis `/admin`.

## Retour arrière

Code : ne pas fusionner la branche. Supabase : remettre les modèles et réglages précédents
(aucune donnée modifiée par ces réglages).
