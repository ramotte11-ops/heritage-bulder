# QG 003 — Builder invité raccordé à l'aperçu réel

**Statut : livré pour revue QG — non fusionné.**

Parcours réel du Builder invité (brouillon IndexedDB V3, photographies
locales) jusqu'à A13, puis ouverture de l'aperçu réel de l'hommage :
`BuilderPreviewHost` → `assembleMemorial` → `MemorialAssembly`, renderers
validés, Hero Opus Light/Dark, Galerie A13 et Offrandes simulées. Aucune
session, aucune requête Supabase, aucune écriture réseau.

## Où le tester

Page de **développement** uniquement (`page.dev.tsx`, absente de tout build
de production) :

```bash
npm run dev
# http://localhost:3000/pilote/builder-invite
```

Le brouillon vit dans l'IndexedDB `heritage-guest-draft` du navigateur. Pour
repartir de zéro : outils du navigateur → Application → IndexedDB → supprimer
cette base.

## Planches

Captures réalisées dans Chromium (Playwright) sur `next dev`, en pilotant le
vrai parcours écran par écran : saisie, ajout de fichiers, cadrage, choix
d'ambiance, 9 photos de Galerie. Les photographies sont des **images de test
synthétiques** (paysages dessinés), pas des photos de famille. Le rond « N »
en bas à gauche est l'indicateur de développement de Next.js, absent en
production.

| Planche | Fichier | Contenu |
|---|---|---|
| A | `A-parcours-builder-invite-jusqu-a-l-apercu.png` | T06 photo locale, T07 cadrage, T08 Claire/Sombre, A13 avec 9 photos et une légende, écran après A13 |
| B | `B-apercu-desktop-light.png` | Aperçu Desktop Light : les 7 rubriques, Album complet 9/9, Offrande confirmée |
| C | `C-apercu-desktop-dark.png` | Aperçu Desktop Dark : idem |
| D | `D-apercu-mobile-light.png`, `D-apercu-mobile-dark.png` | Aperçu Mobile 390 × 844 : écran après A13, rubriques, Galerie, Album 9/9 |
| E | `E-offrandes-simulees.png` | Bougie, Lys, Cœur : mouvement puis confirmation simulée, Light/Dark, Desktop/Mobile |
| F | `F-cas-limites.png` | Contenu minimal (A00 = Non, A04 = Non, A10–A13 passés), aperçu indisponible, brouillon corrompu |

## Résultats de la QA navigateur

| Contrôle | Résultat |
|---|---|
| Parcours T01 → A13 sans inscription, rechargé entre les écrans | OK — chaque relance reprend l'écran courant |
| « Voir l'aperçu » dès T08, jamais sur un Reveal (T08, A03) | OK |
| Rubriques renseignées présentes | Hero, Avis, Cérémonie, Récit, Traditions, Galerie, Offrandes |
| Rubriques conditionnelles absentes quand elles ne s'appliquent pas | OK — parcours minimal : Hero, Récit (textes HERITAGE de repli), Offrandes |
| Photo Hero locale (`blob:`) et cadrage T07 conservé | OK — identique au Reveal T08 |
| Galerie : toutes les photos, sans plafond de six | 9/9 dans l'Album ; Signature 7+ montre 6 + « Voir plus de souvenirs » (Master validé) |
| Légende de Galerie | OK — après le correctif autosave ci-dessous |
| Light / Dark, Desktop 1280 et Mobile 390 | OK |
| Offrandes Bougie, Lys, Cœur, essais répétés | OK — 0 requête réseau autre que GET d'assets |
| Retour au Builder | OK — même écran, saisie en cours conservée, URL `blob:` révoquées |
| Saisie en cours puis « Voir l'aperçu » immédiat | OK — l'autosave est drainé avant la lecture |
| Blob manquant / brouillon corrompu | Visible, jamais réparé ni supprimé (planche F) |
| Requêtes non-GET pendant tout le parcours et l'aperçu | **0** |
| Hôte d'aperçu authentifié (`/pilote/preview`, Light/Dark, Échap, retour) | Inchangé |

## Proposition UX à valider par le QG (non implémentée)

Ce qui est livré après A13 n'introduit **aucun nouveau visuel ni texte** : le
même écran de pause que le Builder authentifié (`GuidedFlowPause`, titre
« Vos réponses sont enregistrées »), sans le paragraphe et le lien « Retour à
mon espace » — un invité n'a pas encore d'espace. Le chemin vers l'aperçu
est le lien « Voir l'aperçu » existant, dans la barre du Builder.

Proposition pour décision :

1. **Écran de fin de création** à la place de la pause : titre « Votre
   hommage est prêt à être découvert », une phrase rassurante (« Tout est
   conservé sur cet appareil, dans ce navigateur. ») et un **bouton
   principal** « Découvrir l'hommage » (style `PrimaryButton` existant) qui
   ouvre l'aperçu.
2. **Ouverture automatique** de l'aperçu une seule fois, juste après
   « Continuer » en A13 (même mécanisme que `openOnArrival`), le bouton
   restant disponible ensuite.
3. Dans la barre de l'aperçu, à côté de « Revenir à la création », une
   mention discrète « Aperçu — rien n'est encore publié ».

Les textes FR/EN/ES et le choix entre 1 et 2 relèvent du QG ; aucun n'est
codé dans cette mission.

## Empreintes

| Fichier | SHA-256 |
|---|---|
| `A-parcours-builder-invite-jusqu-a-l-apercu.png` | `f2815ff49ddaf626988a6a979988092e0b2ccf5a8118dcf77496b7b3b685d414` |
| `B-apercu-desktop-light.png` | `6c2f315a5eb260069ffbbf8d19bd96addb2d38a0858b1371bfdf4f4213415e25` |
| `C-apercu-desktop-dark.png` | `7896ab61b04567a56d4b54db3cde7898faace9a69c74be99d8d39ee78a3fe580` |
| `D-apercu-mobile-dark.png` | `cbe3666c3b0e8d45794e8e6865f8488dd13eaeb03d35d58972c5f2ec38a5a6d4` |
| `D-apercu-mobile-light.png` | `52b87b385be5a410d1f30f4f8962604083fe14e4d2706c0bc9cfd3df2a139e32` |
| `E-offrandes-simulees.png` | `78cdfc7225c43f9693630d908482f3b9a02e5a97d4446fe79f1316d0cf412aa8` |
| `F-cas-limites.png` | `12bc865bd96e249d0194a71368379f714b8b46cdc9563f2a3c13bbdd371b8a42` |
