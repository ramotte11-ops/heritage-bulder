# Contributions des proches — E6-F : finalisation fonctionnelle

**Sens des repères :**
- **Local** : prouvé ici par des tests automatisés ou dans un navigateur réel sur les pilotes de développement, avec un transport **simulé**.
- **Réel** : uniquement après E6, sur Supabase.

Aucune simulation n'est présentée comme un essai de production.

## 1. Fonctionnalités prêtes (côté visiteur)

| Fonction | Preuve locale |
|---|---|
| Ouverture de la lettre depuis « Laisser un message » de **chaque** scène (état vide, Desktop, Mobile) | Navigateur : 3 langues × Desktop et Mobile ; test `ContributionsV1Section.deposit.test.tsx` |
| Condoléance publiée aussitôt, **visible dans la rubrique sans recharger** (état vide → cartes) | Navigateur (pilote `?depot=1`) et test |
| Récit et photographie en attente, avec le message adapté ; aucune relecture inutile | Test et navigateur (pilote dépôt) |
| « Partager un autre souvenir » : seules les catégories restantes sont proposées | Tests du moteur et de la fenêtre |
| Erreurs récupérables (champ refusé, jeton expiré, réseau) : saisie conservée, focus sur le champ en cause | Tests et navigateur |
| Limites anti-abus (R2, R3) : message de patience R5 ; champ piège | Tests, harnais et navigateur |
| Fermeture (×, Échap) : le focus revient au bouton, **même si la scène a changé** | Navigateur, 12 sur 12 |
| Clavier ouvert sur Mobile : le champ actif reste visible | Navigateur 320, 390, 430 |
| FR, EN, ES : titres, confirmations et erreurs | Navigateur et tests |
| Tous les statuts du serveur E2 sont connus du transport (aucun « inconnu » qui deviendrait une erreur générique) | Revue de code |

## 2. Défauts fonctionnels identifiés et corrigés

| # | Défaut | Correction |
|---|---|---|
| 1 | Les boutons « Laisser un message » des quatre scènes étaient **inertes** : aucun raccordement à la lettre ni au transport réel | La section publique ouvre la lettre (écouteur unique sur `[data-action="leave-message"]`, attribut ajouté à la scène Desktop sans effet visuel). La lettre n'est chargée qu'à l'ouverture (`next/dynamic`) |
| 2 | Après une condoléance publiée, « désormais visible dans l'hommage » était **faux** jusqu'au rechargement | La rubrique relit sa première page après un dépôt publié (`refresh`) ; un dépôt en attente ne relit rien |
| 3 | Verrou fermé : dès E6, la rubrique publique se serait affichée **vide, avec un bouton sans effet** (aucun dépôt possible), et la page interrogeait la base à chaque visite | La page ne lit ni ne dessine la rubrique, et ne transmet aucun dépôt, tant que le verrou est fermé (testé dans les deux états). Le Builder garde sa démonstration |
| 4 | Focus perdu à la fermeture quand la scène change (premier message : état vide → cartes) | Le focus va au « Laisser un message » de la nouvelle scène, sans jamais reprendre la main si le visiteur l'a déplacé |

Aucune modification n'a touché le moteur E4, les migrations, les contrats E5, les règles commerciales ou de modération, les Masters, A13, les Offrandes, la Vidéo ni l'empilement.

## 3. État réel de la modération familiale (point critique)

| Besoin de la famille | Contrat serveur | Écran existant |
|---|---|---|
| Voir le nombre de contributions en attente | `getPendingContributionCounts` ✔ | **Aucun** |
| Consulter les récits et photos en attente | `getFamilyContributions` ✔ | **Aucun** |
| Approuver, refuser | `moderateFamilyContribution` ✔ | **Aucun** |
| Masquer, réafficher | `moderateFamilyContribution` ✔ | **Aucun** |
| Supprimer définitivement | `deleteFamilyContribution` ✔ | **Aucun** |
| Fermer ou rouvrir une catégorie **sans perdre les données** | `updateContributionCategories` ✔ | ✔ **Utilisable** : étape A15 du Builder, effet immédiat après publication (`applyCategoriesNow`) |
| Être prévenue des contributions en attente | Préférence et réclamation en base ✔ | **Aucun envoi** (Brevo non construit) ; la carte de l'espace famille affiche « Bientôt disponible » |

**Conclusion.** L'espace famille (`/owner`) annonce les contributions comme « Bientôt disponible », sans lien : c'est le Lot 1, et son test le vérifie. **Sans le Lot 3** :
- un récit ou une photographie déposé resterait **en attente indéfiniment**, sans que la famille le sache ni puisse le traiter ;
- au-delà de 200 contributions en attente (R3), l'hommage refuserait tout nouveau dépôt ;
- une condoléance abusive resterait publiée, sauf intervention du support.

**L'ouverture réelle des récits et des photographies ne peut pas être envisagée avant le Lot 3.**

**Option intermédiaire, à décider par la PO et le QG :** n'ouvrir que les **condoléances**, publiées sans modération. Elle suppose :
- une procédure de retrait par le support (`remove_contribution_v1`) ;
- un contact Q6 désigné ;
- une étape A15 limitée aux condoléances, ce qui est une décision produit, non implémentée.

## 4. Derniers blocages avant une ouverture publique

1. **Lot 3 du chantier n° 01** : écrans de modération et compteur. Bloquant pour les récits et les photos.
2. **Q6** : validation juridique des textes et **désignation du contact de retrait** (proposition : `docs/contributions-q6-confidentialite-proposition.md`).
3. **E6, sur GO QG** :
   - fusion de la PR #105, puis de cette branche ;
   - migrations E1 à E4 sur `nudqzbdfnjzlnyffllgs` ;
   - `CONTRIBUTIONS_FORM_TOKEN_SECRET` dans Netlify ;
   - déploiement.
4. **Recette E7 réelle** (`docs/contributions-e7-recette.md` § « Séquence »).
5. **Nettoyage des médias abandonnés** : GO QG avant l'ouverture des photos.
6. **Ouverture du verrou** : passage de `CONTRIBUTIONS_DEPOSIT_PUBLIC_READY` à `true` par une PR distincte, après les points 1 à 5.
