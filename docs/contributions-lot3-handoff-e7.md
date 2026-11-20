# Handoff Lot 3 → chef de projet n° 02 (reprise E7)

**Écrans de modération familiale :** prêts sur `opus/lot3-family-contributions`.

**Base :** `claude/m4-contributions-a13-extension@934cd64`.

Détail du lot : `docs/espace-famille-lot3.md`.

## Ce qui change pour E7

- **Ligne 4** de `docs/contributions-e7-recette.md` (« Validation familiale, puis publication ») : l'écran existe.
  - `/owner` : carte « Gérer les contributions » avec le nombre à examiner.
  - `/owner/hommages/<id>/contributions` : les quatre vues, la modération et les catégories.
- **Ligne 5** : refus, masquage et réaffichage, depuis la même page.
- **Ligne 6** : la suppression se fait depuis « Publiées » ou « Masquées », après confirmation.
- **Section 3 de E6-F**, colonne « Écran existant » : les cinq lignes « Aucun » sont désormais couvertes.
  - L'envoi Brevo reste absent, et aucune notification n'est présentée comme active.

## Contrats

- Aucun contrat E5 modifié.
- Aucune migration, aucun secret, aucun changement du moteur, des règles de modération ou des règles commerciales.
- Le verrou de dépôt public reste fermé.

## Recette E7 réelle (après E6), sur `/owner`

1. Un compte famille qui a reçu un récit et une photo voit « 2 contributions à examiner ».
2. Approuver le récit : il apparaît dans l'hommage public.
3. Refuser la photo : elle n'apparaît pas.
4. Masquer une condoléance publiée : elle disparaît de l'hommage public. La réafficher : elle revient à sa place.
5. Supprimer une contribution, après confirmation : elle disparaît, et les octets de la photo sont supprimés dans Storage.
6. Désactiver les photographies dans la section des catégories :
   - plus aucun dépôt possible ;
   - les photos sont masquées dans l'hommage public ;
   - réactiver les photographies : tout revient.
7. Un second compte famille ne peut ni ouvrir la page du premier (404), ni agir sur ses contributions.
8. Laisser l'onglet ouvert plus de 5 minutes : une photo qui ne charge plus est relue automatiquement.

**Scénario déjà exécuté sur Supabase local** : 27 contrôles sur 27, avec le kit `scripts/local-e2e/lot3-contributions/`. Il peut être rejoué presque tel quel contre un projet de **recette** (jamais la production), en adaptant le garde-fou d'URL.

## Ordre d'intégration recommandé (inchangé)

`main` → PR #105 → branche Contributions → Lot 3.

Fusion simulée avec la PR #105 : aucun conflit propre au Lot 3. Seuls subsistent les trois conflits déjà connus de la branche Contributions (`docs/contributions-e6i-integration.md`).
