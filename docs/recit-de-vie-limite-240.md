# Récit de vie — limite de 240 caractères par chapitre

Ce document décrit le comportement retenu pour les trois chapitres du Récit de
vie (A10 « Son histoire, sa personnalité », A11 « Ses petits bonheurs »,
A12 « Son empreinte dans nos vies »), saisis dans l'écran « Quelques mots sur
la personne » du Builder.

## Principe

Les textes appartiennent aux familles. La limite guide la **saisie** ; elle ne
s'applique jamais aux **données** déjà enregistrées.

## Ce qui est compté

Le compte est exactement celui que le Récit affiche : texte normalisé (NFC,
blancs et retours à la ligne réunis en une espace, bords retirés), en points de
code Unicode. Un emoji compte pour un caractère ; des espaces en trop ne
comptent pas.

Code : `lib/builder/guided-flow/life-story-limit.ts`.

## À la saisie

- Chaque chapitre affiche un compteur « n / 240 caractères ».
- Une frappe ou un collage qui ferait dépasser 240 caractères est **refusé en
  entier** : le texte reste tel qu'il était, rien n'est tronqué. Une
  indication douce s'affiche : « Cet ajout dépasserait les 240 caractères de
  ce chapitre ; il n'a pas été pris en compte. »
- À exactement 240 caractères : « Vous avez atteint les 240 caractères de ce
  chapitre. »
- Les indications existent en français, anglais et espagnol.

## Brouillons déjà enregistrés au-delà de 240 caractères

- Le texte s'affiche **en entier** dans le Builder ; il n'est ni tronqué, ni
  effacé, ni remplacé, ni réenregistré à l'ouverture de l'écran.
- Une indication douce s'affiche : « Ce texte dépasse 240 caractères. Il est
  conservé tel quel ; vous pouvez le raccourcir quand vous le souhaitez. »
- La famille peut le **raccourcir ou le corriger librement**. Seul
  l'allongement est refusé.
- Le Récit de vie V2 l'affiche en entier : la section s'allonge, aucun texte
  n'est coupé.

## Enregistrement

Aucune limite n'est imposée côté serveur : un brouillon existant n'est jamais
refusé ni modifié à l'enregistrement. Toute restriction future de
l'enregistrement est une décision distincte, à prendre par la PO après examen
des contenus existants.

## Champs vides

Les textes de secours HERITAGE existants restent affichés pour un chapitre
vide ; ils ne sont jamais écrits dans les données.
