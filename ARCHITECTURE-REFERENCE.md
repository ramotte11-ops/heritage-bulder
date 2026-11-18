# HERITAGE HOMMAGE — Référentiel d’architecture officiel

**Identifiant de décision : QG-BASE-001**

**Autorité : Product Owner et QG central HERITAGE HOMMAGE**

**Statut : référence normative**

**Date d’entrée en référence : 18 novembre 2026**

**Source : audit général V2 du 18 novembre 2026 et décision définitive de la Product Owner**

## 1. Règle fondamentale

La base Supabase unique de production de HERITAGE HOMMAGE est :

```text
nudqzbdfnjzlnyffllgs
```

Son libellé administratif au moment de la décision est `heritage-test-lot2`. Le libellé cible est `HERITAGE HOMMAGE — PRODUCTION`.

> **Tout nouveau développement HERITAGE doit respecter la base de production officielle. Aucun changement de projet Supabase n’est autorisé sans GO explicite de la Product Owner et du QG central.**

Le projet suivant est historique et n’est pas la production actuelle du Builder :

```text
pbgzyyqdbdrhgnkzmxyn
```

Son libellé administratif actuel est `heritage hommage`.

Il doit rester intact. Sa suppression, sa pause, son renommage, sa migration, sa synchronisation ou son utilisation comme nouvelle production sont interdits sans mission spécifique, inventaire vérifié, sauvegarde restaurable et GO explicite.

Il ne doit exister aucune migration, fusion, copie ou restauration implicite entre les projets `pbgzyyqdbdrhgnkzmxyn` et `nudqzbdfnjzlnyffllgs`.

## 2. Architecture officielle

### 2.1 Builder, publication et espace famille

| Élément | Référence officielle |
|---|---|
| Dépôt | `ramotte11-ops/heritage-bulder` |
| Branche de référence | `main` |
| SHA de production vérifié le 18/11/2026 | `62648f4df37475633a0a7998a74aa274ab0e968e` |
| Site Netlify | `hommages` |
| URL | `https://hommages.netlify.app` |
| Supabase de production | `nudqzbdfnjzlnyffllgs` |

Le dépôt Builder porte :

- la création invitée et le brouillon local ;
- l’authentification et la reprise du brouillon ;
- le Builder durable ;
- la publication ;
- les hommages publics ;
- le tableau de bord familial ;
- les migrations et contrats Supabase de l’application.

Le site Netlify `hommages` est raccordé à la base de production officielle `nudqzbdfnjzlnyffllgs`.

### 2.2 Vitrine

| Élément | Référence officielle |
|---|---|
| Dépôt | `ramotte11-ops/heritage-hommage-site-vitrine` |
| Branche de référence | `main` |
| SHA de production vérifié le 18/11/2026 | `b16117fc3417a547c496d7dbcf7be2d0d0c11b93` |
| Site Netlify | `herelys-vitrine` |
| URL | `https://herelys-vitrine.netlify.app` |
| Destination Builder | `https://hommages.netlify.app` |

La vitrine présente l’offre HERITAGE et dirige les parcours de création et de connexion vers le site Builder. Elle ne possède pas sa propre base Supabase de production.

### 2.3 Relations fonctionnelles

```text
Vitrine herelys-vitrine
        |
        | CTA création / connexion
        v
Builder hommages
        |
        | authentification, brouillons, publication,
        | espace famille, hommages publics
        v
Supabase production nudqzbdfnjzlnyffllgs
```

Le tableau de bord familial et les futures Contributions utilisent les contrats du dépôt Builder. Ils ne doivent pas créer un raccordement parallèle vers un autre projet Supabase.

## 3. État des chantiers protégés

### 3.1 Tableau de bord familial

- **Lot 1** : PR #104 fusionnée dans `main` et déployée.
- **Lot 2** : PR #105 ouverte ; migration non appliquée en production.
- **Lot 3** : non implémenté.

La PR #105 et sa branche ne doivent pas être modifiées dans le cadre de QG-BASE-001. Toute application future de sa migration doit faire l’objet d’un préflight, d’une identification explicite de la cible `nudqzbdfnjzlnyffllgs` et d’un GO séparé.

### 3.2 Contributions des proches

| Élément | Référence protégée |
|---|---|
| Branche | `claude/m4-contributions-a13-extension` |
| SHA | `250d7b42a9fe3e08f2a2b438742aa6e677a25827` |
| État | M0–M6 préservés ; M7–M10 à intégrer |
| Supabase | aucun raccordement actif dans le prototype |

Cette branche ne doit être ni supprimée, ni rebasée, ni fusionnée au titre de QG-BASE-001. La future intégration M7–M10 devra cibler explicitement `nudqzbdfnjzlnyffllgs` et disposer de ses propres contrats, migrations, tests RLS, préflight et GO.

## 4. Règles obligatoires pour toute mission technique

### 4.1 Avant de commencer

Chaque intervenant doit :

1. lire ce référentiel ;
2. nommer le dépôt et la branche concernés ;
3. déclarer si la mission est locale, de test ou de production ;
4. déclarer le project ref Supabase visé ;
5. vérifier qu’aucune variable ne redirige implicitement la production ;
6. rappeler le niveau d’autorisation disponible : lecture seule, code, migration ou déploiement.

Le bloc suivant doit figurer dans toute mission impliquant Supabase :

```text
Référentiel QG-BASE-001 lu : oui
Production officielle : nudqzbdfnjzlnyffllgs
Cible de la mission : <project ref ou environnement local isolé>
Écriture Supabase autorisée : non / oui, GO n° <référence>
Modification des raccordements de production : interdite sauf GO PO + QG
```

### 4.2 Développements et tests

- Les développements doivent utiliser des interfaces ou variables explicites ; aucun project ref concurrent ne doit être ajouté comme valeur de production.
- Les tests isolés restent autorisés uniquement dans des environnements clairement identifiés comme locaux, jetables ou de développement.
- Un environnement de test ne doit jamais modifier implicitement les variables Netlify, les clés ou l’URL de production.
- Les données de production ne doivent pas être copiées dans un environnement de test sans autorisation et procédure de protection adaptées.
- Les secrets ne doivent jamais être inscrits dans Git, une PR, un rapport ou une capture.

### 4.3 Migrations

Toute future migration doit :

1. être versionnée dans le dépôt Builder ;
2. préciser sa cible prévue : `nudqzbdfnjzlnyffllgs` ;
3. comporter un préflight qui arrête l’opération si le projet cible n’est pas celui autorisé ;
4. être testée dans un environnement isolé ;
5. documenter les vérifications postflight et le retour arrière ;
6. recevoir un GO de migration distinct ;
7. ne jamais être appliquée simultanément au projet historique.

La présence d’une migration dans une branche ou une PR ne vaut pas autorisation d’application.

### 4.4 Netlify et clés

- Le site `hommages` doit rester raccordé à `nudqzbdfnjzlnyffllgs`.
- Aucun changement de `NEXT_PUBLIC_SUPABASE_URL`, de clé publique, de clé serveur ou de site Netlify n’est autorisé sans GO séparé.
- Un renommage administratif Supabase ne justifie aucune modification des variables Netlify.
- Une rotation de clés est une opération distincte ; elle n’est jamais incluse implicitement dans un renommage.

### 4.5 Projet historique

Pour `pbgzyyqdbdrhgnkzmxyn`, sont interdits sans mission dédiée :

- suppression ou pause ;
- migration vers ou depuis la production ;
- restauration sur la production ;
- synchronisation de schéma ou de données ;
- modification des clés, utilisateurs, médias ou politiques ;
- réactivation comme référence du Builder.

## 5. Autorité et gestion de ce référentiel

Ce fichier est la source normative unique de l’architecture de production HERITAGE HOMMAGE.

- La Product Owner tranche l’architecture et les mises en production.
- Le QG central maintient ce référentiel.
- Les chefs de projet délégués appliquent cette référence à leur périmètre.
- Opus et Codex doivent le lire avant toute mission technique HERITAGE.

Une évolution de cette architecture exige :

1. une décision explicite de la Product Owner et du QG central ;
2. une mise à jour de ce même fichier, sans créer de copie concurrente ;
3. une trace datée de la décision ;
4. les GO techniques distincts nécessaires.

Les rapports d’audit, passations et comptes rendus peuvent citer ce fichier, mais ne doivent pas redéfinir une architecture parallèle.

## 6. Journal des décisions

| Date | Décision | Autorité |
|---|---|---|
| 18/11/2026 | `nudqzbdfnjzlnyffllgs` confirmé comme unique Supabase de production ; `pbgzyyqdbdrhgnkzmxyn` déclaré historique, intact et non retirable sans mission spécifique | Product Owner + QG central |
