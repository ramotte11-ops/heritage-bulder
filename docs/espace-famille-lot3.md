# Espace famille — Lot 3 : modération des Contributions des proches

> Branche `opus/lot3-family-contributions`, partie de `claude/m4-contributions-a13-extension@934cd64`
> (contrats E5). **Rien n'est fusionné, déployé ni migré.** La PR #105 (Lot 2) n'est pas intégrée.

## Écrans

| Où | Contenu |
|---|---|
| `/owner`, carte « Gérer les contributions » | Remplace « Bientôt disponible ». Titre, phrase rassurante, nombre réel de récits et de photographies **à examiner** de l'hommage sélectionné (les condoléances ne sont jamais comptées, E5 § 3.1), lien vers la page. Nombre illisible : message calme, le lien reste. |
| `/owner/hommages/[memorialId]/contributions` | « Les contributions reçues » : quatre vues (À examiner — par défaut —, Publiées, Masquées, Refusées), badge du nombre à examiner, 20 contributions par page, « plus anciennes », états vides, indisponibilité avec « Réessayer ». En bas, discrète : « Ce que vos proches peuvent partager » (les trois catégories d'A15). |

Chaque contribution : nom de l'auteur, catégorie, statut, date de réception, texte ou photographie et légende, actions permises.

| Statut | Actions |
|---|---|
| À examiner | Approuver, Refuser (confirmation : « Refuser cette contribution ? Cette décision est définitive. ») |
| Publiée (condoléance comprise) | Masquer, Supprimer définitivement (confirmation) |
| Masquée | Réafficher (place d'origine, P1), Supprimer définitivement (confirmation) |
| Refusée | Statut seul, aucune réapprobation |
| `memory_message` (QG 008) | Lecture seule |

FR / EN / ES, Mobile (320 à 430 px) et Desktop, mêmes jetons visuels que l'Espace famille. Aucun récapitulatif Brevo n'est proposé (aucun envoi n'existe).

## Contrats et sécurité

- **Seules** les Server Actions E5 sont utilisées (`getPendingContributionCounts`, `getFamilyContributions`, `moderateFamilyContribution`, `deleteFamilyContribution`, `getContributionSettings`, `updateContributionCategories`). Aucun moteur dupliqué, aucun module serveur importé côté client (types dérivés des actions, E5 § 1).
- Le propriétaire vient **toujours** de la session (côté serveur, dans les actions, puis la base). L'écran ne transmet que l'id de l'hommage — déjà validé par la route — et l'id de la contribution.
- La route répond 404 pour un hommage qui n'est pas celui de la famille (indistinct d'un id inconnu) et n'appelle alors aucune action ; un visiteur est renvoyé vers `/login`.
- Aucune mise à jour optimiste : un élément ne change qu'après la réponse du serveur. `unchanged` = succès ; `invalid_transition` = l'état réel remplace l'affichage (ou retire la ligne) ; `denied` = message neutre puis relecture (suppression : la ligne est retirée) ; `unavailable` = rien ne change. Le compteur est relu après chaque modération.
- Textes et noms des visiteurs affichés comme du **texte** (jamais du HTML), jamais modifiables.
- Photographies : URL signées de 5 min, jamais conservées ; une image qui ne charge plus déclenche **une** relecture (au plus une par minute) pour des liens neufs. Changer de vue relit aussi la page côté serveur.
- Catégories : la même action que l'étape A15 du Builder ; toujours les trois booléens et la révision lue ; `stale_revision` → relecture, état réel affiché, explication, **aucun renvoi automatique** ; `corrupted` → message calme d'A15, choix à refaire.

## Preuves

### Tests automatisés (simulés : actions E5 remplacées par des doublures)

- `app/owner/page.test.tsx` : carte réelle (nombre, aucun, un, illisible, langue conservée) ; le test Lot 1 « Bientôt disponible » est remplacé.
- `app/owner/hommages/[memorialId]/contributions/page.test.tsx` (12) : visiteur, autre famille (404, aucune action appelée), vues, langue, texte jamais HTML, indisponibilité.
- `components/owner/contributions/ContributionsManager.test.tsx` (20) et `ContributionCategories.test.tsx` (6) : actions par statut, réconciliation de chaque réponse, confirmation, pagination par curseur sans doublon, renouvellement photo, `stale_revision`.

### Essai réel sur un Supabase LOCAL isolé (non simulé)

Pile Supabase locale (Postgres + Auth + PostgREST + Storage, images officielles), **les 48 migrations du dépôt** appliquées telles quelles, application en `next dev`, connexion réelle par mot de passe, dépôts par le moteur visiteur réel (jetons, RPC, envoi Storage signé, Sharp). Kit : `scripts/local-e2e/lot3-contributions/`.

Résultat final (20/11/2026, après la confirmation du refus) : **29 contrôles, 29 réussis**, chacun vérifié dans la base.

- Données : 66 contributions en attente, dont 37 au même horodatage, et 33 publiées, dont 2 messages historiques.
- Messages historiques : en lecture seule après pagination complète de « Publiées ».
- Détail du passage : `docs/contributions-lot3-handoff-e7.md`.

Le tableau ci-dessous récapitule ce qui a été vérifié :

| Domaine | Vérifié |
|---|---|
| Pagination | 20 puis le reste ; 22 contributions au même horodatage, toutes vues une seule fois |
| Approuver / Refuser | statut et visibilité en base ; badge en direct ; message |
| Masquer / Réafficher | condoléance retirée de la lecture publique (`read_public_contributions_v1`) puis rétablie avec son `published_at` d'origine |
| Lecture seule | `memory_message` et refusées sans action |
| Photographie | image privée chargée par URL signée ; URL cassée → relecture, nouvelle URL, image chargée |
| Suppression | confirmation, annulation sans effet, puis ligne supprimée **et objet Storage supprimé** |
| Concurrence | deux onglets : refus après approbation ailleurs → « modifiée entre-temps », base inchangée ; double approbation → succès (`unchanged`) |
| Catégories | photos désactivées : effet immédiat en base, données conservées ; second onglet → `stale_revision` expliqué, état relu, rien renvoyé ; réactivation |
| Sécurité | page d'une autre famille → 404 ; **action serveur rejouée** (requête réelle interceptée) avec l'id d'une contribution d'une autre famille → `denied`, base inchangée ; même requête sans session → `denied` ; visiteur → `/login` |
| Tableau de bord | nombre affiché = nombre en base |

Expérience (navigateur réel) : 320, 375, 390, 430 et 1440 px, FR / EN / ES : aucun débordement horizontal ; toutes les commandes nouvelles ≥ 44 px (seul le lien existant « Mon espace famille », partagé avec le Carnet, mesure 32 px) ; clavier : vues puis actions dans l'ordre, anneau de focus visible ; focus rendu après annulation d'une suppression.

Captures : `docs/validation/espace-famille-lot3/` (données de test locales).

### Limites

- Supabase **local**, pas le projet B : les migrations E1 à E4 ne sont appliquées sur aucun projet réel ; en production, chaque action répond aujourd'hui `unavailable` (comportement attendu, E5), et la carte l'indique calmement.
- Volumes modestes (≈ 30 contributions) ; pas de test au-delà de 100 éléments chargés.
- Lecteurs d'écran non testés manuellement ; contrôle limité aux rôles, libellés, régions `status`/`alert` et à l'ordre de tabulation.
- Les dépôts publics restent verrouillés (`CONTRIBUTIONS_DEPOSIT_PUBLIC_READY = false`) : non modifié.

## Dépendances avec la PR #105

La PR #105 n'est pas fusionnée et n'est pas intégrée ici.

Fusion simulée de la PR #105 (`88f288a`) dans cette branche (copie de travail temporaire, rien poussé) :

- **Aucun conflit dans les fichiers du Lot 3.** `components/owner/FamilyFeatures.tsx`, `app/owner/page.test.tsx`, les dictionnaires et les clés i18n fusionnent automatiquement, en gardant les deux lots : signatures du Carnet (Lot 2) et carte des contributions (Lot 3).
- Les seuls conflits sont les trois déjà connus entre la branche Contributions et la PR #105 : `app/hommage/[slug]/page.tsx`, son test, `scripts/db/test-local.sh`. Ils sont résolus et justifiés dans `docs/contributions-e6i-integration.md`.

L'ordre E6 reste `main` → PR #105 → Contributions → Lot 3.

## Confirmation du refus (décision PO)

« Refuser » est définitif (aucune réapprobation). Validé par la PO : un clic sur « Refuser » ouvre, dans la carte, la même zone de confirmation que la suppression : « Refuser cette contribution ? Cette décision est définitive. », « Confirmer le refus » et « Annuler ».

- Seule la confirmation appelle l'action serveur existante (`moderateFamilyContribution(id, "reject")`). Le contrat E5 n'est pas modifié.
- « Annuler » ou la touche Échap ferment la zone sans rien envoyer, et le focus revient sur « Refuser ».
- À l'ouverture, le focus va sur « Annuler », le choix sans risque.
- Textes en FR, EN et ES ; boutons de 44 px, Mobile et Desktop.

Preuves :
- **Tests automatisés** : confirmation, annulation, Échap, focus, traductions.
- **Supabase local** : refus confirmé ; annulation qui laisse la contribution en attente en base.
- **Captures** : `*-refus-confirmation.jpg`.
