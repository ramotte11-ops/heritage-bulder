# Contributions des proches — E6-A : intégration de « La lettre des proches »

**Statut : intégration technique livrée, soumise à l'examen artistique de la PO.**
- Verrou de publication **fermé** : la fenêtre ne fonctionne que dans le pilote local `/pilote/contributions-depot` (transport simulé).
- Aucune modification de la modération, des contrats E5, des règles commerciales ni des migrations E1 à E4.

## 1. Ce qui est livré

| Élément | Fichier |
|---|---|
| Masters du Studio, **tels que reçus** (empreintes identiques aux fichiers transmis) | `public/assets/contributions/v1/lettre/lettre-des-proches-{desktop,mobile}.webp` |
| Géométrie mesurée des Masters, adaptation | `config/contributions-letter-v1.ts` (+ tests) |
| Décor et zones de lecture sûres | `components/memorial/contributions/letter/LetterCard.tsx` |
| Pictogrammes au trait (cœur, livre, image, cadenas, avion, ×, filet à la feuille) | `components/memorial/contributions/letter/letter-icons.tsx` |
| Présentation de la fenêtre (choix, formulaires, aperçu photo, confirmation, « autre souvenir », patience, erreurs, fermeture) | `ContributionDepositWindow.tsx` / `.module.css` |
| Moteur du parcours | `use-contribution-deposit.ts` (M8-E4), **inchangé** |

**Langues.** FR/EN/ES conservés.
- Ajouts : quatre textes indicatifs des champs.
- Modification : les aides des trois catégories, alignées sur la planche.

## 2. Adaptation des Masters aux hauteurs de contenu

**Principe : une seule échelle, aucune déformation.** Le Master est dessiné tel quel dans un `<canvas>`, à la résolution de l'écran. Rien n'est recréé en CSS ni régénéré.

**Mesures relevées sur les fichiers** (filet doré, rameaux, enveloppe) :

| | Filet doré | Rameau haut-gauche | Rameau bas-droit | Enveloppe |
|---|---|---|---|---|
| Desktop 1536 × 1024 | x 140–1406, y 87–913 | x ≤ 411, y ≤ 299 | x ≥ 1152, y ≥ 622 | y 250–650 |
| Mobile 1090 × 1443 | x 130–996, y 68–1289 | x ≤ 460, y ≤ 335 | x ≥ 695, y ≥ 915 | y 400–800 |

### Mobile : allongement par bandeaux en miroir

**Le bandeau.** Il est pris dans le Master, lignes 830 à 900. C'est la seule bande sans ornement : sous l'enveloppe, au-dessus du rameau inférieur.

**La séquence.** La lettre s'allonge par **paires** : bandeau retourné, puis bandeau droit.
- La suite des bandeaux est donc toujours impaire.
- Chaque jonction rejoint soit la même ligne (miroir), soit la ligne voisine du Master.
- Il n'y a **aucune couture** : le gros plan des bords et des filets le montre, et un test le vérifie.

**La hauteur.** Elle est calculée sur le contenu de chaque étape.
- Plafond : 1,6 fois la hauteur du Master.
- La fenêtre défile au-delà, ce qui est naturel au doigt et avec le clavier.
- Si le contenu dépasse encore, il défile dans sa zone, avec un fondu doux sur les bords.

**Ce qui ne bouge jamais** : l'en-tête, les deux rameaux, l'enveloppe et les coins.

### Desktop : proportions exactes, défilement interne

**Il n'existe aucun bandeau propre.** Les lignes de l'enveloppe (250 à 650) chevauchent celles du rameau inférieur (622 à 905). Une extension couperait l'un ou l'autre : **obstacle artistique réel, signalé**.

Le Master garde donc ses proportions exactes :
- largeur : 1000 px au plus ;
- hauteur : limitée à celle de la fenêtre.

Les étapes longues (récit, photographie) défilent dans la zone de lecture.

### Zones de lecture sûres

Elles se trouvent dans le filet doré et ne recouvrent jamais un rameau, ce qu'un test vérifie sur les mesures.
- Sur Mobile, le titre se place à droite du rameau supérieur.
- Sur Mobile, le bouton se place à gauche du rameau inférieur.

## 3. Contrôles réalisés (rendu réel du navigateur, Chromium)

**70 captures :**
- 2 ambiances × 5 largeurs (320, 375, 390, 430, 1440) ;
- 7 étapes : choix, condoléances, erreur, confirmation avec « autre souvenir », récit long, photographie avec aperçu, patience.

**Audit automatique de chaque capture :**

| Contrôle | Résultat |
|---|---|
| Défilement horizontal | aucun |
| Élément hors de la lettre | aucun |
| Focus | correct à chaque étape (premier choix, premier champ, **champ en cause après un refus**, message de résultat) |

**Clavier ouvert (Mobile 320, 390, 430)** : le champ en cours de saisie reste visible. La fenêtre défile et le bouton reste atteignable.

**Tests automatisés :**
- `config/contributions-letter-v1.test.ts` (7) : échelle unique, absence d'extension Desktop, plafonds, jonctions sans couture, zones hors des rameaux, présence des Masters ;
- les 61 tests de la rubrique, dont la fenêtre (8) et le moteur (6).

**Planches comparatives** (planche PO / rendu réel) : `docs/validation/contributions-lettre-des-proches/`.

## 4. Écarts relevés par rapport à la planche approuvée

| # | Écart | Cause | Proposition |
|---|---|---|---|
| 1 | Masters reçus en **WebP** RGBA, et non en PNG | Format de la pièce jointe transmise | Déposer les PNG d'origine du Studio si le WebP est une conversion avec perte : le remplacement est un simple échange de fichiers |
| 2 | Desktop : colonne de champs **plus étroite** que sur la planche (712 px du Master, soit 46 % de la largeur) | Le rameau inférieur du Master définitif descend jusqu'à x = 1152 : une colonne plus large le recouvrirait | Accepter, ou demander au Studio un rameau inférieur plus petit |
| 3 | Desktop : la lettre est **paysage** (Master 3:2), là où la planche montrait une fenêtre presque carrée | Proportions du Master définitif, respectées | — |
| 4 | Mobile : titre **décalé à droite** du rameau (et non centré) | Le rameau supérieur du Master occupe 42 % de la largeur ; centré, le titre le chevaucherait | Accepter, ou rameau plus petit |
| 5 | Mobile : sur une lettre très allongée, la **périodicité du bord déchiré** se devine en regardant de près | Répétition en miroir du même bandeau de 70 lignes | Le Studio pourrait fournir un bandeau d'extension plus haut ; l'intégration l'accepte sans changement de code |
| 6 | Mention de confidentialité **différente** de la planche | Q6 non validée : le texte provisoire existant est conservé, non publiable | Texte définitif après validation juridique et désignation du contact de retrait |
| 7 | Texte saisi en 16 px au moins | Éviter le zoom automatique d'iOS sur les champs | — |
| 8 | Aide « Photographie » : « accompagnée **si vous le souhaitez** d'une légende » | La légende est facultative (règle fonctionnelle) | — |
| 9 | Étape « Choisir » : titre « Laisser un message », puis la question | La lettre garde un titre unique sur toutes les étapes | Possible de reprendre « Choisir le type de contribution » sur décision PO |

## 5. Ce qui reste fermé

- **Verrou** `CONTRIBUTIONS_DEPOSIT_PUBLIC_READY = false` : aucune page publique n'importe la fenêtre, et les actions de dépôt répondent `unavailable` côté serveur.
- **Aucune** intervention sur Supabase, aucun secret, aucune fusion, aucun déploiement.
- Ouverture du verrou : après l'examen artistique de la PO, Q6 et E6.
