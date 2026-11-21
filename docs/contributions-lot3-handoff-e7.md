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

## Résultat final de la recette LOCALE (fait)

Le 20/11/2026, sur la branche `opus/lot3-family-contributions`, scénario complet `scripts/local-e2e/lot3-contributions/e2e-2.js` : **29 contrôles, 29 réussis, 0 échec**.

**Environnement : Supabase local isolé**
- Composants : Postgres, Auth, PostgREST et Storage, issus des images officielles.
- Les 48 migrations du dépôt, dont M8-E1 à E4, sont appliquées telles quelles.
- Application lancée en `next dev`.
- Connexion réelle des familles.
- Dépôts faits par le moteur visiteur réel : jetons anti-robots, envoi signé vers Storage, traitement Sharp.

**Données préparées avant le passage**
- 66 contributions en attente, dont 2 photographies.
- 37 récits au même horodatage, répartis sur plusieurs limites de page.
- 33 contributions publiées, dont 2 messages historiques (`memory_message`).
- Une seconde famille, pour les contrôles de sécurité.

**Ce qui a été vérifié dans la base**
- Pagination complète sans doublon : 63 sur 63.
- Approbation ; refus avec confirmation, annulation sans effet puis refus confirmé.
- Masquage et réaffichage : sortie de la lecture publique, puis retour avec le `published_at` d'origine.
- Messages historiques en lecture seule **après pagination** : vue « Publiées » chargée en entier (33 éléments, 2 pages), 2 messages historiques, aucun bouton.
- Renouvellement d'une URL photo expirée.
- Suppression confirmée, fichier Storage compris.
- Concurrence entre deux onglets.
- Catégories, avec effet immédiat et `stale_revision`.
- Sécurité :
  - page d'une autre famille → 404 ;
  - action serveur rejouée avec l'id d'une contribution d'une autre famille → `denied` ;
  - même action sans session → `denied` ;
  - visiteur non connecté → `/login`.
- Compteur du tableau de bord égal à la base.

Les passages précédents avaient échoué par **hypothèses du script** (une seule page chargée par vue), jamais par l'application. Le kit charge désormais chaque vue en entier avant d'agir.

## Recette sur le projet B (À FAIRE, après E6 et sur GO QG)

Rien n'a été exécuté sur le projet B. Les migrations M8-E1 à E4 n'y sont pas appliquées : aujourd'hui, chaque action répond `unavailable`.

La recette réelle reste celle de la section précédente (étapes 1 à 8). Le kit peut être rejoué contre un projet de **recette** :
- en adaptant le garde-fou d'URL `127.0.0.1` ;
- jamais contre la production avec des données réelles de familles.

## Ordre d'intégration recommandé (inchangé)

`main` → PR #105 → branche Contributions → Lot 3.

Fusion simulée avec la PR #105 : aucun conflit propre au Lot 3. Seuls subsistent les trois conflits déjà connus de la branche Contributions (`docs/contributions-e6i-integration.md`).
