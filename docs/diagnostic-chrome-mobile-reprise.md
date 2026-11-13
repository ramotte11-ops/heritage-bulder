# Diagnostic — « Impossible de charger cette page » sur Chrome mobile (QG 003)

Constat PO : sur Chrome mobile **normal**, la reprise du Builder affiche la page d'erreur de
Chrome « Impossible de charger cette page » ; en navigation **privée**, tout fonctionne, galerie
comprise.

## Ce qui est démontré

1. **Ce n'est pas un écran de l'application.** Ce message est une page de Chrome : elle
   s'affiche quand la page n'a pas pu être chargée ou que son processus d'affichage a été arrêté.
   L'écran de reprise de QG 003 A ne peut donc **pas, à lui seul**, la faire disparaître.
2. **Aucune erreur serveur** sur `hommages.netlify.app` (journaux Netlify 12–13/11 : aucun 5xx).
   Des requêtes **499** (connexion fermée par le navigateur) apparaissent sur `/creer`, sur
   `/builder/demo` et sur des images de rubriques : cohérent avec un onglet interrompu ou rechargé
   pendant le chargement, sans le prouver.
3. **Pas de service worker** dans l'application (aucun enregistrement trouvé) : un cache applicatif
   corrompu propre au profil normal est exclu.
4. **Différence normal / privé** : seul le profil normal conserve le brouillon local (IndexedDB),
   avec ses photographies ; le privé repart d'un brouillon vide.
5. **Coût mémoire du brouillon repris (lecture du code)** :
   - les vignettes de la galerie utilisent les **photos préparées en taille réelle**
     (jusqu'à 1600 px, `config/photo-profiles.ts`) via `URL.createObjectURL`, sans miniature dédiée
     (`GalleryWorkshop.tsx`) ;
   - `loadGuestGalleryPhotos` relit **toutes** les photos de la galerie en une fois (`Promise.all`) ;
   - l'aperçu (`loadGuestPreview`) crée une URL pour chaque photo ;
   - la Hero charge plusieurs PNG d'habillage volumineux (jusqu'à ~1,5 Mo compressés chacun,
     journaux Netlify).
   Une photo de 1600 × 1200 décodée occupe environ 7,7 Mo de mémoire : 20 photos ≈ 150 Mo, avant
   les images d'habillage.

## Hypothèses (non prouvées)

| # | Hypothèse | Plausibilité | Ce qui la confirmerait |
|---|---|---|---|
| H1 | **Arrêt du processus de la page par manque de mémoire** à la reprise d'un brouillon riche en photos | **forte** | Débogage distant Chrome (Android branché au PC, `chrome://inspect`) : onglet « Memory » au chargement ; ou `chrome://crashes` sur le téléphone |
| H2 | Stockage du profil normal saturé ou dégradé (quota, éviction partielle) | moyenne | Chrome → Paramètres → Paramètres des sites → `hommages.netlify.app` → taille des données ; reprise réussie après avoir vidé ces données (**destructif : GO requis**, données de test uniquement) |
| H3 | Réseau mobile interrompu pendant le chargement d'images lourdes | faible | Reproduction en Wi-Fi stable |

## Ce que QG 003 A corrige déjà

- Une photo illisible n'empêche plus d'ouvrir le brouillon (avant : erreur générique).
- Aucun écran vide : photo, cadrage ou ambiance manquants, chargement bloqué ou stockage
  indisponible affichent l'écran de reprise, avec une action non destructive.

## Correctifs proposés (non réalisés — à autoriser)

1. Miniatures dédiées pour la galerie (réduction ~320 px à l'affichage, libérée après usage).
2. Chargement progressif des photos de la galerie et de l'aperçu (décodage asynchrone et différé).
3. Mesure sur un téléphone d'entrée de gamme avant/après, avec un brouillon de 20 photos.

Ces points touchent l'affichage de la galerie : ils demandent un GO distinct (aucun changement
visuel attendu, uniquement la manière de charger les images).
