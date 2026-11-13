# Connexion par code à 6 chiffres — configuration Supabase B (QG 003)

> **À appliquer uniquement après GO QG.** Rien ici n'a été modifié sur Supabase B.
> Aucune valeur secrète dans ce document.

## Pourquoi

Le lien de connexion utilise PKCE : son vérificateur est un cookie du navigateur qui a fait la
demande. Ouvert depuis Gmail, le lien arrive dans un autre contexte (onglet Gmail, Chrome normal
au lieu de privé) et échoue — preuve : journaux Netlify du 13/11/2026, « PKCE code verifier not
found in storage » (2 occurrences). Le code à 6 chiffres est saisi **dans l'onglet** qui l'a
demandé (`verifyEmailCode` → `supabase.auth.verifyOtp({ type: "email" })`) : aucune dépendance au
navigateur qui ouvre l'e-mail, et le brouillon local (IndexedDB) reste accessible au transfert.

Le code applicatif est **compatible avec les deux modèles** : tant que le modèle n'affiche pas le
code, le lien continue de fonctionner dans le même navigateur, comme aujourd'hui.

## Opération 1 — modèles d'e-mail (Supabase B → Authentication → Emails)

`signInWithOtp` envoie le modèle **Magic Link** à une adresse connue et **Confirm signup** à une
nouvelle adresse. Les deux doivent afficher `{{ .Token }}`.

**Magic Link** — Sujet : `Votre code HERITAGE : {{ .Token }}`

```html
<h2>Votre code de connexion HERITAGE</h2>
<p>Saisissez ce code dans la page HERITAGE restée ouverte :</p>
<p style="font-size:28px;font-weight:600;letter-spacing:6px">{{ .Token }}</p>
<p>Ce code est valable pour une seule connexion et expire rapidement.
Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.</p>
<p style="font-size:13px;color:#666">Vous pouvez aussi
<a href="{{ .ConfirmationURL }}">ouvrir ce lien</a>, uniquement dans le navigateur où vous avez fait la demande.</p>
```

**Confirm signup** — Sujet : `Votre code HERITAGE : {{ .Token }}` — même corps (remplacer le
titre par « Bienvenue sur HERITAGE »).

## Opération 2 — réglages Auth à vérifier (Authentication → Sign In / Providers → Email)

| Réglage | Valeur attendue | Rôle |
|---|---|---|
| Email OTP Length | **6** | Le formulaire et le serveur exigent 6 chiffres |
| Email OTP Expiration | **600 s** recommandé (défaut 3600 s) | Durée de validité du code |
| Rate limits → emails / OTP | défauts conservés | Limite des renvois (affichée « Patientez… ») |
| Site URL / Redirect URLs | inchangés (GO-2) | Le lien de secours reste valide |

## Contrôle après application (PO, ~3 min)

1. Chrome mobile **privé** → `/creer` → « Enregistrer mon hommage » → adresse → « Recevoir mon code ».
2. Gmail : l'e-mail montre un code à 6 chiffres. **Ne pas ouvrir le lien.**
3. Revenir à l'onglet, saisir le code → « Valider le code » → la page de reprise enregistre l'hommage.
4. Code faux → message « incorrect, expiré ou déjà utilisé » ; « Recevoir un nouveau code » après 60 s.

## Retour arrière

Remettre le texte précédent des deux modèles. Aucun impact sur les comptes ni les sessions.
