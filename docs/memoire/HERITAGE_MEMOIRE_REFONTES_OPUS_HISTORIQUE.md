# HERITAGE Hommage — Mémoire des refontes (Opus historique)

Rédigée le 16 octobre 2026 par l'Opus de la session `session_01J6M4vZySqyn86YcuDnv364`, branche `claude/optimistic-thompson-q7cnvj`, à la demande du QG (« mission préventive — sauvegarde de la mémoire des refontes »).
Document de référence technique et opérationnelle, pas une passation définitive.

Conventions de preuve utilisées dans tout le document :

- **[vérifié]** : contrôlé pendant la rédaction (Git, fichiers du dépôt, SHA-256, transcription de la session).
- **[souvenir]** : issu de ma mémoire de conversation (résumés de compactage, rapports déjà livrés), non revérifié ici.
- **[incertain]** : hypothèse ou point que je ne peux pas confirmer.

---

## 0. Correction préalable : ce que j'ai réellement fait

Le QG m'a plusieurs fois présenté comme « l'exécutant qui a réussi l'intégration du Récit de vie V2 ». **C'est inexact, et je le corrige ici.** [vérifié]

- Cette session a commencé le **13 octobre 2026** par l'audit read-only de l'Avis de décès (transcription de la session).
- Les commits portant l'empreinte de cette session sont uniquement :
  - l'**Avis de décès V2** (8 commits, 13–14 octobre) ;
  - la **fusion P0** de l'ordre canonique (15 octobre) ;
  - **Traditions & repères V2** (4 commits, 15–16 octobre).
- **Récit de vie V2** : commits `6d3069c`, `444616d`, `2442f7a`, `fd3cae6`, de la session `session_01EcDSLuqoyfWGAmZJQVETGp`. Ce n'est pas moi. Je l'ai seulement **étudié en lecture seule** (13 octobre) et j'en ai réutilisé la méthode.
- **Galerie A13** (Album, Viewer, Responsive Bridge, PR #43) : sessions `session_011drmjAYQ2BocSeoNNik4uR`, `session_018E4ZHbftFxL5RfbJBGJUsE` et d'autres. **Je n'y ai pas travaillé.** Je ne documente donc aucune méthode A13 comme mienne.
- **Traditions M1** (raccordement au mémorial réel, commit `2128a3c` poussé sur ma branche le 16 octobre à 15:30 UTC) : session `session_01CoqA7zKRESVFGkjbpgFY5N`. **Ce n'est pas moi** (voir § 5).

Les sections 1 et 2 ne couvrent donc que l'Avis V2 et Traditions V2. Le § 3 inclut la méthode du Récit V2 telle que je l'ai lue et réemployée, en le signalant.

---

## 1. Chantiers réalisés

### 1.1 Avis de décès V2 — CLOSED artistiquement, **non branché en production**

**Déroulé** [vérifié par la transcription et Git] :

| Étape | Date | Commit | Statut |
|---|---|---|---|
| Audit read-only du composant V1 et des 8 références | 13/10 | — | livré |
| Note d'architecture : moteur du Récit V2 | 13/10 | — | validée PO |
| Phase 1 — pilote Mobile Light (moteur extensible) | 13/10 | `77074e0` | validée |
| Phase 2 — ornements Mobile Light (médaillons, rameau, cœur, filets en SVG/CSS) | 13/10 | `2d438e6` | validée |
| Phase 3 — Mobile Dark | 14/10 | `8c7ca76` | validée |
| Phase 4 — Desktop Light (5 colonnes) | 14/10 | `19fe08e` | validée puis **remplacée** |
| Desktop Light composition 1 + 4 (décision PO après le test « adresse longue ») | 14/10 | `45efd15` (+ archives `70f208c`) | CLOSED |
| Phase 5 — Desktop Dark 1 + 4 | 14/10 | `7701d2e` (+ archives `95f9abb`) | CLOSED |

**Abandonné** :
- la composition Desktop en 5 colonnes, remplacée par « lieu seul sur sa rangée + 4 précisions » ;
- ma proposition initiale d'audit : faire découper les fonds en trois tranches par le Studio. Le QG a décidé que j'assure seul l'ingénierie des Masters et que le Studio Handoff n'est plus obligatoire.

**Fichiers** [vérifié] :
- `components/memorial/death-notice/v2/` : `DeathNoticeV2.tsx`, `DeathNoticeV2.module.css`, `DeathNoticeV2Ornaments.tsx`, `DeathNoticeV2.test.tsx`, `pilot-fixtures.ts` ;
- `config/death-notice-v2-tokens.ts` ;
- `scripts/pilot/avis-v2-derive.py` ;
- `app/pilote/avis-v2/page.tsx` (404 en production) ;
- assets dans `public/assets/death-notice/v2/{mobile,desktop}/{light,dark}/` ;
- planches archivées : `docs/validation/avis-de-deces-v2/desktop-light-1plus4/` et `desktop-dark-1plus4/`, avec un README chacun.

**Décisions produit retenues** [souvenir, confirmé par les messages QG relus] :
- nom en EB Garamond 600 (`avisNameSerif`, graisse ajoutée à une famille déjà chargée) ;
- une seule colonne sous 520 px, grille 2 + 2 + 1 à partir de 520 px ;
- bascule Desktop à 1024 px de largeur réelle du **conteneur**, plafond 1448 px ;
- Desktop 1 + 4 : lieu toujours sur sa propre rangée, sans détection de longueur ;
- aucun emplacement fantôme ; filets seulement entre colonnes réelles ;
- aucun guillemet automatique ; dates via `formatHeroDateRange` ;
- doctrine **« le papier s'allonge, le contenu ne rétrécit pas »**.

**Coupes retenues** (`config/death-notice-v2-tokens.ts`) [vérifié] :

| Variante | Canevas | Coupe et fondu |
|---|---|---|
| Mobile Light | 941 × 1671 | 955 / 40 |
| Mobile Dark | 941 × 1672 | 895 / 40 (1130 écarté : bord droit déchiré) |
| Desktop Light | 1672 × 941 | deux zones : gauche 468 / 28, droite 616 / 40, fondu au centre x 836 |
| Desktop Dark | 1670 × 942 | gauche 711 / 28, droite 600 / 40, centre x 835 |

**Écarts acceptés par la PO** [souvenir] :
- pictogrammes satinés, moins spéculaires que la maquette ;
- rameau simplifié ;
- nom crème uni en Dark (sans le dégradé doré de la maquette) ;
- titre espagnol resserré en Dark ;
- cuir ou papier nu sur les bords quand la page s'allonge en Desktop.

**Reste OPEN** [vérifié] : l'Avis V2 n'est **pas** dans le registre. `config/memorial-section-renderers.ts` pointe toujours `deathNotice` vers `DeathNoticeIntemporel` (V1). Le branchement Builder/Preview et la QA d'intégration restent à faire, sur GO.

### 1.2 Traditions & repères V2 — CLOSED (quatre variantes)

| Étape | Commit | Statut |
|---|---|---|
| P0 — fusion de `origin/claude/vibrant-cray-fa1zq4` (ordre canonique, `1649ba7`) | `b3bde61` | fait |
| P1 — Mobile Light | `6392e41` | validé |
| P2 — Mobile Dark | `ea285a9` (le message dit encore « WIP — NON VALIDÉ ») | validé PO |
| P3 — Desktop Light | `867318a` | validé |
| P4 — Desktop Dark | `875a25b` | validé sans réserve |

**Fichiers** [vérifié] :
- `components/memorial/traditions/v2/` : `TraditionsV2.tsx`, `TraditionsV2.module.css`, `TraditionsV2Ornaments.tsx`, `TraditionsV2.test.tsx`, `pilot-fixtures.ts` ;
- `config/traditions-v2-tokens.ts` ;
- `scripts/pilot/traditions-v2-derive.py` ;
- `app/pilote/traditions-v2/page.tsx` ;
- 5 clés i18n `traditions.v2.*` (surtitle, title, intro, closing, cornerNote) en FR/EN/ES ;
- 27 assets dans `public/assets/traditions/v2/{mobile,desktop}/{light,dark}/`.

**Masters et décors** (SHA-256 [vérifié], identiques aux manifestes PO) :

| Variante | Master illustré | Décor vierge = décor runtime |
|---|---|---|
| Mobile Light | `90fdbb4d…8e72` | `203dfe8e…57b5` (941 × 1671) |
| Mobile Dark | `c1c6d4d3…3175` | `bbea9d4b…2389` (941 × 1671) |
| Desktop Light | `a42cd2ee…45fd` | `e21f17ca…7566` (1670 × 941) |
| Desktop Dark | `c83de759…2ed8` | `83c1e431…0c98` (1670 × 942) |

**Coupes retenues** :

| Variante | Coupe | Bande des bords | Particularités |
|---|---|---|---|
| Mobile Light | 938 / 40 | 220 rangées (758–978) | — |
| Mobile Dark | 1114 / 40 | 220 rangées, fleurs floues retirées par voile de luminance | teinte du bord gauche au quantile 0,35 |
| Desktop Light | gauche 626 / 36, droite 310 / 26 (imposée) | gauche seulement, 100 rangées | pas de bande à droite (aucune ne se répète proprement) ; teinte « sous la coupe » au-delà de x 1490 |
| Desktop Dark | 620 / 30, commune aux deux zones | une par côté, 120 rangées (530–650) | — |

**Décisions produit** [souvenir, confirmé par les messages QG] :
- textes HERITAGE fixes traduits, données familiales jamais traduites ;
- planches multilingues avec des repères **rédigés** dans chaque langue (fixtures `reference-en` / `reference-es`) ;
- rameau neutre identique dans chaque médaillon, sans pictogramme culturel ou religieux ;
- La Belle Aurore validée, malgré l'écart avec l'écriture du Master ;
- respiration acceptée avec 1 ou 2 feuillets ;
- raccord Récit → Traditions bord à bord, sans fondu, accepté.

**Reste OPEN** :
- indépendance vis-à-vis d'A00 ;
- QA d'intégration avec les rubriques voisines ;
- fusion vers `main` et déploiement.

Le branchement au mémorial réel a été fait par une **autre session** (§ 5).

---

## 2. Méthodes techniques éprouvées

### 2.1 Exploiter les Masters

1. **Vérifier avant tout** : SHA-256 contre le manifeste, dimensions, mode (RGBA souvent, mais alpha = 255 partout), cohérence des tailles. Les Masters ne font **pas** tous la même taille (1670, 1671, 1672 ; 941, 942) : je garde les dimensions natives et un `canvas` par variante, jamais de normalisation.
2. **Le Master illustré n'est pas le décor avec du texte posé dessus.** Ce sont deux générations proches mais distinctes : écart moyen de 15 à 31 niveaux, décalages de 1 à 4 px, gaufrage ou paillettes différents. Je mesure donc :
   - la **composition** (positions des textes et ornements, encres) sur le Master illustré ;
   - la **matière** sur le décor vierge ;
   - et je vérifie l'alignement entre les deux, avec un recalage local (dx, dy) par zone.
3. **Mesures en px de canevas** : chaque valeur `*Canvas` des tokens est relevée sur le Master et commentée avec ses coordonnées. Pour mesurer :
   - extents d'encre par seuil de luminance, ligne par ligne (runs) ;
   - médiane des pixels les plus clairs ou foncés pour les encres ;
   - différence Master − décor pour localiser les feuillets, médaillons et cartouches.
4. **Le décor runtime est une copie octet pour octet** du décor vierge, avec son SHA dans les tokens et un test qui le revérifie. Il n'est jamais modifié, découpé en fichiers ni recompressé.

### 2.2 Le moteur extensible (repris du Récit V2, étendu par moi)

Principe, sur un seul fichier décor positionné par CSS :
- `.master` : le décor entier, à son ratio, ancré en haut. Quand la section s'allonge, il ne montre plus que `[0 : cut + fade]`.
- `.bottom` : le même fichier, `[cut − fade : H]`, ancré en bas de section.
- `.paper` : n'existe que si la section dépasse. Il s'ouvre à la coupe, a la hauteur exacte de l'excédent plus deux fondus, et porte des masques en dégradé aux deux raccords. Il empile :
  - 3 tuiles de grain en `overlay` (tailles premières entre elles, pour éviter un motif visible) ;
  - un bruit SVG grossier `feTurbulence` en `soft-light` ;
  - une image de teinte W × 2 (profil au-dessus et au-dessous de la coupe), étirée.
- `.edges` (ajout Traditions) : une bande pleine largeur tirée des rangées juste au-dessus de la fin du fondu bas. Elle est rendue périodique par fondu avec les rangées qui la **suivent** (jamais de miroir), opaque seulement sur les bords de la feuille, en `repeat-y` ancrée en bas : elle prolonge les bords déchirés.
- **Extension** = hauteur réelle de la section − hauteur du Master à cette largeur, mesurée par un `ResizeObserver`. C'est la seule mesure JS, purement décorative. Le canevas actif (Mobile ou Desktop) est lu dans `--canvas-w` / `--canvas-h` calculés.
- **Échelle** : `--px = 100cqw / canvas-w` sur un `.wrap` en `container-type: inline-size`. Les textes sont en `max(plancher px, calc(var(--px) * n))` : à la largeur du Master, la composition reproduit le Master ; sur téléphone, les planchers gardent la lisibilité et la section s'allonge.

**Choisir la coupe** (scripts `*-derive.py`, reproductibles) :
- détail net par rangée = pixels où |L − flou σ 3| > 14 ;
- fenêtre de rangées où ce total est minimal **et** où les profils de teinte de part et d'autre se suivent sur toute la largeur. Mesurer les deux critères : le moins net n'est pas forcément le bon ;
- toujours inspecter visuellement les deux bords à la coupe : feuillage net, bouquet, escalier de papiers, ornement tranché ;
- coupe imposée (`"cut"`) quand la seule bonne fenêtre est plus étroite que la recherche (Desktop Light droite, Desktop Dark).

**Desktop** : sur un décor horizontal, du décor net borde les deux côtés à toutes les hauteurs. Il faut alors **deux zones**, chacune avec sa coupe, sa teinte et sa bande. Une seconde pile `.zoneRight` est masquée en dégradé horizontal autour de `zoneSplitCanvas ± zoneBlendCanvas / 2`, dans le papier nu du centre. Si une coupe unique convient aux deux côtés (Traditions Desktop Dark), on garde la même structure avec la même coupe.

**Calibrer la surface** sur rendu Chromium, jamais à l'œil :
- `grain_gain` jusqu'à ce que l'écart-type passe-haut de la surface égale celui du papier du décor (±0,1 à 0,5) ;
- `tone_gain` pour compenser l'éclaircissement dû aux couches de grain (mesuré : +1 à +6 niveaux selon la variante) ;
- raccords : écart des moyennes de part et d'autre de chaque fondu, par bande verticale, comparé à la **variation naturelle** du décor autour de la coupe.

**Surcharges de teinte**, quand le profil médian étire un ornement :
- `tone_left` : quantile bas sur une plage de rangées, contre les fleurs floues claires ;
- `tone_below_from` : teinte du dessous seulement au-delà d'un x, contre l'aquarelle bleue étirée ;
- voile de luminance dans la bande des bords, pour retirer les fleurs floues qui se répéteraient.

### 2.3 Découpes, fonds répétables ou scène complète

- **Scène complète + surface CSS** (ma méthode) : dès que le contenu familial est de longueur libre. Le Master reste entier, rien n'est répété sauf le grain.
- **Fonds répétables découpés** (haut / milieu × N / bas) : c'était l'architecture V1 de l'Avis (`useSceneRuntime`, PNG Studio). Je l'ai proposée à l'audit avant la décision QG. Elle impose une bande centrale conçue pour la répétition, que les Masters actuels n'ont pas.
- **Scène fixe sans extension** : seulement si le contenu est réellement borné. C'est le cas de la Cérémonie V1 (§ 6). Sinon, débordement garanti.

### 2.4 Hauteurs variables et textes longs

- Tout le texte est dans le **flux normal** (flex en colonne), jamais en position absolue sur le décor. Le pied (`margin-top: auto`) reste à sa place du Master quand il y a peu de contenu.
- `overflow-wrap: break-word`, `white-space: pre-wrap` pour les textes familiaux, `text-wrap: balance` pour les titres. Aucun défilement interne, aucune troncature, aucun plafond arbitraire.
- `max-width` en px de canevas sur les titres et phrases, pour qu'ils passent sur deux lignes plutôt que de recouvrir un bouquet ou un sceau à petite largeur.
- Sous 520 px, les capitales espacées sont resserrées (`letter-spacing` réduit), jamais leur corps.
- **Desktop deux colonnes** : grille à 2 colonnes, rangée à la hauteur du plus long feuillet, feuillet impair seul centré à la largeur d'une colonne.
- Fixtures systématiques : 1, 2, 3, 4, 6 et 8 éléments, titres absents, titre long, paragraphes multiples, mot de 120 caractères sans espace, adresse très longue.

### 2.5 Compositions Mobile et Desktop

- Bascule par **requête de conteneur**, jamais par `@media` ni `window.innerWidth`. La Preview du Builder (conteneur étroit dans une fenêtre large) doit recevoir la composition Mobile.
- **Même DOM, mêmes données** : les réglages Desktop sont posés en variables `--d-*`, activées uniquement dans `@container (min-width: 1024px)`. Sous 1024 px, aucune règle Desktop ne s'applique.
- Chaque nouvelle variante ajoute un **bloc CSS en fin de fichier** (`[data-variant="dark"]`, `[data-desktop]`, `[data-variant="dark"][data-desktop]`) et ne retouche aucune règle validée. Tout le CSS ajouté, rien de retiré : c'est ce qui rend la non-régression démontrable.
- Différences structurelles de composition (filets flanqués ou non, cœur ou rameau au pied, mention du coin) : en **réglages** (`surtitleRules`, `footerOrnament`, `cornerNote`…), pas en composants dupliqués.

### 2.6 Fidélité Master ↔ rendu Chromium

- Playwright + Chromium (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`). Capture de l'élément section seul, à `deviceScaleFactor = 1670 / 1448` (Desktop) ou 2, pour obtenir le canevas exact.
- Toujours `await document.fonts.ready` plus un court délai avant capture ; une capture faite avant le chargement des polices a déjà produit une fausse régression.
- **Mesure DOM** en px de canevas (`getBoundingClientRect` × canvas / largeur ; `Range.getClientRects` pour les lignes de texte), plus fiable qu'une lecture d'encre sur image.
- Encre comparée au Master par zone : runs de lignes et extents x. Viser 1 à 4 px de canevas.
- **Polices** : mesurer avec une page de comparaison (`?fonts=1`). Ne choisir que parmi les familles déjà chargées par le projet ; une nouvelle graisse se charge dans un export distinct de `components/builder/fonts.ts`. Ne jamais changer de police sans accord QG.
- Planches de validation standard :
  1. Master / rendu / superposition 50/50 ;
  2. nombres d'éléments ;
  3. titres absents et textes longs ;
  4. ornements ×2 et raccords sur fond seul (`DECOR_ONLY`) ;
  5. largeurs et bascule ;
  6. FR/EN/ES ;
  7. non-régression.

  Relire chaque planche avant envoi : légendes chevauchantes, sous-titres coupés.

### 2.7 QA automatique (scripts du dossier temporaire, à reconstruire si perdus)

- **Débordements** : `scrollWidth > clientWidth` sur chaque élément de texte, plus chaque mot (`Range` par `\S+`) hors des limites de la section. Matrice : contenus × FR/EN/ES × 10 largeurs (Mobile 320–941, Desktop 1000–1600 dont 1023/1024).
- **Mots sur le décor** : masque du décor (écart à la teinte du papier > 45 ou détail net), projeté selon la coupe et l'extension. Mesurer **à l'encre** (capture texte visible − texte masqué) : les boîtes de police des scripts manuscrits sont très hautes et donnent de faux positifs.
- **Ornements** : intersection des boîtes ornement / mots (rameaux et cœurs mesurés à l'encre), ratios SVG à ±1 %, nombre de médaillons = nombre de blocs.
- **Raccords** : écarts par bande verticale contre la variation naturelle ; texture passe-haut ; teinte moyenne.
- **Non-régression** : voir § 2.9.

### 2.8 Raccords entre rubriques

- Composer le **bas du Master** de la rubrique précédente avec le **haut du rendu** de la suivante, à 390 px, bord à bord : c'est ce que donne l'assemblage actuel.
- Constat : `MemorialAssembly.tsx` n'a **aucune logique de raccord** entre sections. Les sections s'empilent. Récit → Traditions donne une ligne nette (acceptée par la PO). Un fondu exigerait de modifier l'assemblage commun (GO distinct).
- Ordre canonique actuel (QG, 15/10) : Hero → Avis → **Cérémonie** → Récit → Traditions → Galerie → …
- Couleurs de jonction à vérifier : Avis Light finit en bleu pétrole, Récit Light (« bleu pétrole ») enchaîne ; Avis Dark finit en papiers bruns, Récit Dark est ivoire-champagne (rupture de ton) [souvenir de l'audit Avis].

### 2.9 Erreurs de méthode rencontrées et solutions

| Erreur | Solution |
|---|---|
| Captures de non-régression non déterministes : quelques dizaines à 200 pixels différents, d'une session de serveur à l'autre, **même avec le code inchangé** | Pour prouver l'absence de régression : dump de la **géométrie et des styles calculés** de chaque élément rendu, code avant / code après (`git stash` temporaire puis `pop`), comparé élément par élément. Résultat P4 : 70/70 identiques. Les pixels servent de contrôle secondaire, avec recapture. |
| Bande des bords trop courte (60 rangées), répétition en dents de scie visible | Bande plus haute (120–220 rangées) et alpha resserré sur le seul liseré |
| Fleurs, aquarelle ou papiers étirés par la teinte | Surcharges `tone_left`, `tone_below_from`, voile de luminance ; renoncer à la bande d'un côté si aucune ne se répète proprement |
| Surface trop claire à cause des couches de grain | `tone_gain` mesuré sur rendu |
| `pgrep -f` / `pkill -f` tue son propre shell (exit 144) | `for p in $(ps -eo pid,args \| awk '/[n]ext-server/ {print $1}'); do kill $p; done` |
| `rm -r` refusé par les permissions | `rm -f` fichier par fichier ; ne jamais supprimer d'asset par répertoire (règle repo) |
| Worktree de référence : Turbopack refuse un `node_modules` symlinké, puis erreur 500 sur les polices | `git stash` temporaire dans le dépôt principal, capture, `stash pop` immédiat ; vérifier `git stash list` vide après |
| `tsc --noEmit` échoue (`LayoutProps` introuvable) | `npx next typegen` d'abord (AGENTS.md) |
| Remplacement Python appliqué à plusieurs occurrences (fixtures dupliquées) | `assert s.count(a) == 1` avant chaque remplacement |
| Commentaire de tokens non modifié sans erreur visible (Avis phase 4) | `grep` de contrôle après chaque édition importante |
| `process.env` utilisé dans `page.evaluate` (contexte navigateur) | Lire la valeur côté page (`getComputedStyle`) ou la passer en argument |
| Outil d'encre faussé (capture de 942 px, section étendue) | Mesures DOM en px de canevas |
| Planches avec légendes superposées | Grille de composition à hauteur de rangée calculée ; relecture visuelle avant envoi |
| Le hook Stop réclame commit et push | Toujours refuser sans GO QG explicite et le dire |

---

## 3. Contrats artistiques et produit appris

1. Le **Master illustré validé par la PO** est l'autorité absolue de composition. Le **décor vierge** est l'autorité de matière. Aucune réinterprétation, simplification ou recolorisation autonome ; un Dark ne s'obtient jamais en assombrissant le Light.
2. Les Masters et décors restent **intacts** (SHA-256 vérifiés par test). Les assets dérivés sont reproductibles par script et versionnés à côté.
3. Préserver textures, superpositions de papiers, fleurs, sceaux, ombres et ornements. **Aucun ornement étiré ni répété** ; seul le grain se répète.
4. **« Le papier s'allonge, le contenu ne rétrécit pas »** : aucune réduction de corps pour faire tenir, aucune troncature, aucun défilement interne, aucun plafond arbitraire (signaler toute limite technique réelle).
5. **Contenus dynamiques** : nombre libre, champs facultatifs sans emplacement fantôme, titres facultatifs, textes familiaux rendus **tels quels** (aucun guillemet ajouté, jamais traduits). Textes HERITAGE fixes traduits en FR/EN/ES.
6. Chaque variante Mobile/Desktop × Light/Dark suit **son propre Master**. Un seul moteur, des réglages par variante, pas de composant dupliqué.
7. Toute adaptation technique est **justifiée, mesurée et montrée** sur planche. Les écarts au Master sont listés explicitement, jamais tus.
8. Aucune police, couleur ou direction artistique choisie seul ; proposer, et laisser la PO trancher (cas La Belle Aurore).
9. Pictogrammes : décision PO pour Traditions, rameau neutre unique, sans symbole culturel ou religieux imposé.
10. **Gouvernance** :
    - chaque étape sur GO explicite, STOP à la fin ;
    - commit et push seulement sur « GO SAUVEGARDE » ;
    - jamais de force-push, reset destructeur, PR, merge vers `main` ou déploiement sans GO ;
    - aucun chantier CLOSED rouvert sans autorisation ;
    - ne jamais présenter comme vérifié ce qui n'a pas été exécuté ;
    - zones protégées : `public/assets/**` et `assets/**` (aucune suppression), `supabase/migrations` (append-only), `supabase/checks` (lecture seule).
11. Validation obligatoire avant tout commit : `npm ci`, `npm run lint`, `npm test`, `npx next typegen`, `npx tsc --noEmit`, `npm run build`, toutes en exit 0.
12. Les pilotes restent **isolés** (`/pilote/*`, 404 en production) jusqu'au GO de branchement.

---

## 4. État réel au moment de la rédaction

**Git** [vérifié] :
- Branche locale `claude/optimistic-thompson-q7cnvj`, HEAD local `875a25bc4c7da669fa2477fc431538885c5ac268` (P4), working tree propre, aucun stash.
- **La branche distante a avancé sans moi** :
  - `origin/claude/optimistic-thompson-q7cnvj` = `2128a3cf8273190eac81d9c261e95bfb23e3d824` (Traditions M1, session `session_01CoqA7zKRESVFGkjbpgFY5N`) ;
  - ma copie locale a **1 commit de retard**. Je n'ai pas fait de `pull` : mission documentaire, aucun changement demandé.
- `origin/main` = `3e64750` ; ma branche a 14 commits d'avance localement (15 avec M1), 0 de retard.

**Travaux sauvegardés** : tout l'Avis V2 et tout Traditions V2 sont commités et poussés (SHA au § 1).

**Non sauvegardé, dans le dossier temporaire du conteneur, perdu au recyclage** [vérifié] :
- les planches Traditions P1 à P4 (`livrables_trad_p1` à `p4`). Contrairement à l'Avis, elles ne sont **pas** archivées dans `docs/validation/` ;
- les scripts de QA (Playwright et Python : captures, mesures, raccords, encre, dumps DOM) ;
- les références extraites des ZIP (Masters illustrés non versionnés : seuls les décors vierges sont dans le dépôt).

**Ce document** : `docs/memoire/HERITAGE_MEMOIRE_REFONTES_OPUS_HISTORIQUE.md`, non commité.

**Dernières validations** [vérifié] :
- arbre P4 : 3 781 tests réussis, les six étapes en exit 0 ;
- clôture : les 23 dérivés Traditions régénérés octet pour octet ;
- la session M1 annonce 3 818 tests sur `2128a3c` [non vérifié par moi].

**Risques techniques connus** :
- Avis V2 non branché : la V1 reste en production. Le branchement touchera `SECTION_RENDERERS`, l'adaptateur et l'import de `DeathNoticePreviewStep` (A03).
- Traditions M1 branché par une autre session. **Je n'ai pas audité ce raccordement** : headingLevel, données A09, visibilité, cohabitation avec A00 [incertain].
- Le non-déterminisme des captures Chromium rend les comparaisons pixel fragiles ; utiliser le dump DOM/styles.
- Les tests jsdom ne font aucune mise en page : l'extension et les collisions ne sont prouvées que par les captures.
- Poids des Masters (≈ 2,8–3 Mo chacun) et images de grain chargés par section : performance à mesurer en intégration [incertain].

---

## 5. Travaux d'autres sessions à ne pas m'attribuer

- **Récit de vie V2** (`session_01EcDSLuqoyfWGAmZJQVETGp`, PR #51) : moteur original, bleu pétrole (LIGHT) et ivoire-champagne (DARK). Les étiquettes « light/dark » des fichiers du handoff étaient **inversées** par rapport aux variantes produit (commentaire de `config/recit-de-vie-v2-tokens.ts`).
- **Galerie A13** (plusieurs sessions, PR #43) : Album, Viewer, Responsive Bridge 1023/1024, Small Mobile.
- **Ordre canonique** (`1649ba7`, branche `claude/vibrant-cray-fa1zq4`) : fusionné par moi en P0, rédigé par une autre session.
- **Traditions M1** (`2128a3c`) : registre, adaptateur, tests d'assemblage.

---

## 6. Préparation de la Cérémonie (sans développement)

### 6.1 État existant constaté [vérifié, lecture seule]

- Renderer actuel : `components/memorial/ceremony/CeremonyIntemporel.tsx` (« Mission 040B », pack Studio `CEREMONIE_RUNTIME_STUDIO_QG_CANDIDATE_V3_CORRECTED`). Architecture **`single_scene_per_variant`** :
  - un Master fixe par variante × format ;
  - des zones de contenu en **boîtes absolues en pourcentage** (technique du Hero) ;
  - pas d'extension verticale.
- Bascule à **960 px** en **`@media` (fenêtre)**, pas en requête de conteneur. Canevas : Desktop 1448 × 1086, Mobile 941 × 1672.
- Assets V1 : `public/assets/ceremony/intemporel/runtime/{light,dark}/` (2 Masters par thème, pictogrammes calendrier / lieu / info, séparateurs, rameaux en PNG).
- Données (`types/ceremony.ts`) : six champs facultatifs (`date`, `time`, `venueName`, `address`, `access`, `note`), lus en fail-safe par `readCeremony`. **Aucune longueur maximale.** Présence décidée par A04 (oui / indécis / non) ; deux états FULL et NO_PRACTICAL_INFO.

### 6.2 Enseignements directement utiles

1. Les nouveaux Masters runtime vierges seront très probablement des **scènes fermées** comme ceux de l'Avis et de Traditions. Avec `address`, `access` et `note` libres, une scène fixe déborde : le moteur extensible (§ 2.2) s'impose probablement.
2. La bascule à 960 px par `@media` reproduit le défaut corrigé dans l'Avis : la Preview du Builder recevrait la composition Desktop dans un conteneur étroit. Les V2 utilisent 1024 px par conteneur ; aligner la Cérémonie serait cohérent, **à décider par le QG**.
3. Composition probable à trois blocs (date et heure, lieu et adresse, informations pratiques) : penser dès le départ aux champs absents, à l'état NO_PRACTICAL_INFO, aux adresses très longues (doctrine 1 + 4 de l'Avis) et aux notes multi-paragraphes.
4. Position dans l'ordre canonique : **entre l'Avis et le Récit**. Deux raccords à montrer en QA : bas de l'Avis V2 → haut de la Cérémonie, et bas de la Cérémonie → haut du Récit V2, pour chaque thème.

### 6.3 Pièges à éviter

- Mesurer la composition sur le décor vierge au lieu du Master illustré, ou supposer qu'ils sont superposables au pixel.
- Normaliser les dimensions des Masters.
- Couper à travers un bouquet ou un sceau parce que la rangée y est « moins nette » ; vérifier visuellement les deux bords.
- Une bande des bords trop courte (répétition visible).
- Laisser la teinte étirer une couleur d'ornement.
- Corriger une variante validée en passant ; tout ajout en bloc CSS de fin de fichier.
- Confondre la variante produit Light/Dark avec le nom des fichiers du handoff (précédent du Récit).
- Réutiliser les PNG d'ornements V1 sans validation PO ; la reconstruction SVG/CSS a été la règle pour l'Avis et Traditions.
- Prouver la non-régression par les seuls pixels.
- Promettre une limite de longueur : il n'en existe aucune dans le modèle, et les anciens brouillons ne la respecteraient pas.

### 6.4 Points à auditer avant intégration

1. SHA-256, dimensions et alpha des 4 Masters illustrés et des 4 décors vierges ; alignement Master ↔ décor ; présence ou non de bandes calmes pour une coupe, côté Mobile et Desktop (deux zones ?).
2. Inventaire des ornements du Master : pictogrammes, séparateurs, rameaux, cœur, mentions manuscrites. Distinguer ce que le décor porte de ce qui doit être reconstruit.
3. Correspondance champs → zones : que deviennent `time` sans `date`, `access` sans `address`, la note longue ?
4. Breakpoint actuel (960 / `@media`) et impact Builder (étapes A04–A08, Preview), adaptateur et tests existants (`CeremonyIntemporel.test.tsx`, renderer-adapters, compose, assemble).
5. Raccords visuels avec l'Avis (V1 en production, V2 non branché) et le Récit V2.
6. Typographies du Master contre les polices déjà chargées.
7. Comportement Dark : matières propres, jamais dérivées du Light.

### 6.5 Méthode que je recommanderais d'étudier (non approuvée)

1. **Préflight read-only** : Git, Masters, SHA, mesures, coupes candidates par variante, inventaire des ornements, carte des champs, risques ; STOP.
2. **Note d'architecture** : nouveau renderer `CeremonyV2` sur le moteur partagé, un seul composant, réglages par variante, bascule conteneur 1024 / plafond 1448 si le QG l'accepte, V1 conservée pour retour arrière, branchement en une ligne de registre au moment du GO.
3. **Pilotes progressifs**, chacun validé par planches et sauvegardé sur GO distinct : Mobile Light → Mobile Dark → Desktop Light → Desktop Dark ; page `/pilote/ceremonie-v2`.
4. QA standard du § 2.7, plus le dump DOM/styles de non-régression des variantes déjà validées.
5. **Branchement réel** (registre, adaptateur, A04) seulement sur GO distinct, avec QA d'intégration des raccords Avis → Cérémonie → Récit.
6. Archiver les planches validées dans `docs/validation/ceremonie-v2/` et versionner les outils de QA, sur GO, pour ne plus dépendre du dossier temporaire.
