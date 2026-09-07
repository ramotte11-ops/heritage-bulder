# Mission 019B — `/activate`, captures pour validation PO + QG

Quatre captures de la surface `/activate` telle qu'elle est réellement
rendue par ce commit, dans les deux états qui ont changé.

| Fichier | Viewport | État |
|---|---|---|
| `01-activate-desktop-nominal.png` | 1280x800 | nominal |
| `02-activate-mobile-nominal.png` | 390x844 | nominal |
| `03-activate-desktop-recovery.png` | 1280x800 | recovery (`?claim=recovery`) |
| `04-activate-mobile-recovery.png` | 390x844 | recovery (`?claim=recovery`) |

## Ce qu'elles montrent

**État nominal.** Une seule action : « Confirmer mon achat Etsy ». Rien à
saisir. Sous un filet de séparation, un `<details>` replié — « Vous avez
une clé d'activation ? » — qui est le seul reste visible de HH1. La clé
n'est pas proposée comme un choix équivalent, et n'est jamais première.

**État recovery.** Après un aller-retour Etsy resté sans correspondance,
le même écran revient avec une phrase calme et le `<details>` déjà
déplié, de sorte qu'une famille ayant acheté sans compte Etsy trouve le
champ sans avoir à le chercher.

## Ce qui n'a pas changé

Aucun redesign. La grammaire visuelle de la Mission 019C est réutilisée
telle quelle : même eyebrow, même titre, même encadré `notice` à filet
gauche, mêmes tokens de bouton et de champ. Le seul ajout de style est
le filet + le `summary` discret du bloc de récupération.

## Conditions de capture

Rendu réel de l'application (`next dev`), session authentifiée simulée
localement le temps des captures uniquement — ce contournement n'existe
dans aucun fichier de ce commit. L'indicateur de développement de
Next.js a été masqué : il n'appartient pas au design et est absent de
tout déploiement réel.

**La validation visuelle finale appartient au PO et au QG.**
