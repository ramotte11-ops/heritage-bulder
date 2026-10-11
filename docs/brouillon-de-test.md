# Brouillon de test : parcourir le Builder depuis le début

Objectif : permettre à la PO de tester les premiers écrans (langue, Bienvenue,
identité, A00…) sur le site réel, **sans réinitialiser ni modifier** son
mémorial actuel, qui reprend directement à sa dernière étape.

Ce n'est pas une fonctionnalité commerciale : c'est une procédure de test
ponctuelle, qui s'appuie uniquement sur le parcours d'activation existant.

## Principe

- Une clé d'activation crée **un nouveau mémorial**, indépendant des autres.
- Un même compte peut détenir plusieurs mémoriaux : « Mes mémoriaux »
  (`/owner`) les liste tous, chacun avec son lien « Ouvrir l'atelier ».
- Le mémorial existant de la PO n'est ni lu, ni modifié, ni réinitialisé : la
  procédure ne touche à aucune ligne de `memorials` ni de `memorial_drafts`
  existante.

## Étapes

### 1. Préparer une clé de test (aucune connexion)

```bash
node --experimental-strip-types scripts/db/test-activation-key.mjs po
```

Sous Node 24, le drapeau `--experimental-strip-types` est inutile.

Le script affiche :

- la clé brute `HH1-…`, à transmettre à la PO (elle n'est affichée qu'une fois
  et n'est stockée nulle part) ;
- une instruction SQL `insert into entitlements …` qui ne contient que
  l'empreinte sha256 de la clé, avec un `external_order_id` repérable
  (`qg-test-po-AAAAMMJJHHMMSS-xxxx`).

Le script n'exécute rien : pas de SQL, pas d'appel réseau, pas de fichier écrit.

### 2. Créer le droit dans Supabase : autorisation QG obligatoire

L'instruction SQL de l'étape 1 est exécutée **une seule fois**, dans l'éditeur
SQL du projet Supabase hébergé, **uniquement après une autorisation QG
explicite et nommée** (AGENTS.md : « aucun SQL exécuté sans une mission QG qui
le demande explicitement »).

Elle ajoute une seule ligne `entitlements` au statut `available`. Elle ne
modifie rien d'autre.

### 3. Activer la clé avec le compte habituel de la PO

1. Se connecter comme d'habitude (lien magique, même adresse e-mail).
2. Ouvrir `/activate`, coller la clé `HH1-…`, valider.
3. Le Builder s'ouvre sur le **nouveau** mémorial, au tout début :
   langue (T01) → Bienvenue → nom et dates → A00 « Souhaitez-vous également
   publier une annonce de décès ? » (Oui / Non / Plus tard) → Hero…

### 4. Passer d'un mémorial à l'autre

`/owner` (« Mes mémoriaux ») liste les deux mémoriaux :

- le mémorial existant, sous son nom, qui reprend là où il en était ;
- le mémorial de test (« Mémorial en cours de création » tant que le nom n'est
  pas saisi).

## Après le test

- Rien n'est à supprimer : le mémorial de test reste un brouillon privé, jamais
  publié, visible de sa seule propriétaire.
- Si le QG souhaite qu'il disparaisse de « Mes mémoriaux », c'est une opération
  séparée, à décider et à autoriser à part. Aucune suppression ne fait partie
  de cette procédure.

## Ce qu'il ne faut pas faire

- Ne pas réinitialiser ni modifier le brouillon existant de la PO (pas de SQL
  sur `memorial_drafts` ni sur `memorials`).
- Ne pas réutiliser une clé déjà activée : chaque test complet depuis le début
  demande une nouvelle clé (étapes 1 à 3).

## Alternative sans aucune écriture

`/builder/demo` enchaîne Bienvenue, nom et dates, A00 et les écrans suivants
sur des données de démonstration, sans rien enregistrer. Il ne remplace pas le
test réel : pas d'écran de langue, pas de connexion, pas de sauvegarde, pas de
photo réelle.
