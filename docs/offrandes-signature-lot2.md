# Offrandes symboliques — Lot 2 : signature facultative

> Branche `claude/offrandes-signature-lot2`, partie de `main@eff4ed6`, synchronisée avec `main@62648f4` (Next.js 16.4.6, PR #106) par une fusion, sans réécriture d'historique. **Rien n'est fusionné, déployé ni appliqué à Supabase B.**
> La migration est prête et vérifiée sur le banc local ; son application à la base B demande un GO distinct du QG.

## Ce que le lot livre

| Moment | Comportement |
|---|---|
| Sélection | Inchangée : les trois cartes, sans compte. |
| Enregistrement | Inchangé : `record_symbolic_offering_v1`, anonyme, au clic (droits, plafonds, anti-doublon). |
| Confirmation | Scène recomposée (V2 validée PO) : phrase émotionnelle sous le grand titre, objet à sa taille, puis « Souhaitez-vous signer votre geste ? », le champ « Prénom ou surnom (facultatif) » et « Poursuivre la visite » — empilés en Mobile, côte à côte en Desktop. |
| Signature | Facultative. Si le champ n'est pas vide, « Poursuivre la visite » (ou Entrée) l'envoie **une fois**, rattachée au geste déjà enregistré. Champ vide : aucun envoi, parcours identique à aujourd'hui. Échec : « Votre signature n'a pas pu être ajoutée. », le geste reste, un second « Poursuivre » continue. |
| Aperçu du Builder | Simulation : le champ s'essaie, rien n'est envoyé ; le retour aux cartes le vide. |
| Espace famille | Carnet des attentions : « Une fleur a été déposée par Marie. » ; sans signature, texte actuel. FR / EN / ES. |

La signature n'apparaît jamais sur la page publique ni dans ses données ; elle n'est jamais journalisée.

## Données et sécurité

Migration `supabase/migrations/20261116120000_lot2_offering_signature.sql`, additive :

- `symbolic_offerings.signature` (texte facultatif) et `signed_at` ; contraintes : 1 à 40 caractères, sans espace aux extrémités, sans caractère de contrôle ni invisible (forçage de direction, espace de largeur nulle) ; `signed_at` présent si et seulement si `signature`, jamais avant le geste.
- La famille lit ses gestes **au niveau des colonnes** (même RLS `symbolic_offerings_select_own`), signature comprise, mais **plus la clé d'idempotence**, qui devient la preuve de signature. Aucun droit d'écriture pour un rôle client.
- `sign_symbolic_offering_v1(slug, clé, signature)` — `service_role` seulement, `SECURITY DEFINER`, `search_path` vide. Une instruction UPDATE atomique : geste existant de ce mémorial, **non encore signé**, de **moins de 30 minutes**. Issues : `signed`, `already_signed` (même texte renvoyé), `refused`. Jamais de nouvelle ligne.
- `record_symbolic_offering_v1` est inchangée : les dépôts anonymes continuent pendant et après la transition.

Côté application : le serveur normalise (NFC, invisibles retirés, espaces resserrés, 40 caractères au plus) avant la base, qui revérifie tout. L'action publique `signSymbolicOfferingAction` ne renvoie qu'un booléen.

## Dossier de migration

| Fichier | Rôle |
|---|---|
| `supabase/migrations/20261116120000_lot2_offering_signature.sql` | Migration (idempotente : se réapplique sans erreur). |
| `supabase/verifications/lot2_signature_preflight.sql` | Avant : prérequis (C1, RLS, C3), pas encore appliquée, droits actuels. Lecture seule. |
| `supabase/verifications/lot2_signature_postflight.sql` | Après : colonnes, contraintes, confidentialité, droits de la fonction. Lecture seule, aucune signature lue. |
| `supabase/rollbacks/20261116120000_lot2_offering_signature.down.sql` | Retour arrière. **Efface définitivement les signatures** (les gestes sont conservés). |

Ordre proposé pour la base B (sur GO QG) : préflight (0 ECHEC) → migration → postflight (0 ECHEC) → déploiement du code. Si le code part avant la migration, la signature échoue proprement (« n'a pas pu être ajoutée ») et le geste reste enregistré.

## Décisions RGPD

1. **Conservation** : une signature vit aussi longtemps que le geste, c'est-à-dire que l'hommage (suppression en cascade avec le mémorial). Une durée maximale propre aux signatures reste à décider.
2. **Suppression** : décidée (17/11/2026) — pas de bouton famille en V1 ; effacement exceptionnel par le support, procédure ci-dessous.
3. **Demande d'un visiteur** : aucune donnée ne relie un visiteur à sa signature ; la demande passe par le support, sur indication de l'hommage, de la date et du texte. Recevabilité et information de la famille : à confirmer.
4. **Information** : la scène n'affiche pas de mention de confidentialité (décision PO) ; projet de complément à la politique de confidentialité : `docs/offrandes-signature-confidentialite-projet.md`.
5. **Retour arrière** : il détruit les signatures ; un export préalable relève du QG.

## Effacement d'une signature — décision et procédure support

**Décision QG / PO (17/11/2026)** : pas de bouton « Retirer la signature » dans l'espace famille V1. La signature reste facultative, privée, visible de la seule famille. Un effacement exceptionnel est traité par le **support HERITAGE**, sans jamais supprimer le geste.

### Constat technique (banc SQL local, 17/11/2026)

- Effacer une signature = `signature = NULL, signed_at = NULL` sur la ligne du geste ; le geste (type, date) et les compteurs restent. La contrainte `signature` / `signed_at` impose d'effacer les deux ensemble.
- **Fenêtre de 30 minutes** : `sign_symbolic_offering_v1` accepte une signature sur un geste non signé de moins de 30 minutes. Un effacement fait **dans** cette fenêtre peut donc être annulé par le navigateur du visiteur (vérifié : signé → effacé → re-signé). Un effacement fait **après** la fenêtre est définitif (vérifié : nouvelle tentative `refused`, geste conservé).
- Conséquence : la procédure ci-dessous n'efface qu'un geste de **plus de 30 minutes**. Aucune modification technique n'est nécessaire pour la V1.

### Procédure (personnes habilitées seulement)

1. **Habilitation** : seules les personnes désignées par le QG, disposant d'un accès nominatif au projet Supabase B, exécutent l'effacement. Aucune clé `service_role` n'est transmise ni utilisée hors de l'application. Principe des quatre yeux : une personne exécute, une seconde vérifie le résultat.
2. **Réception** : la demande arrive par le canal support officiel. Recevable de la famille titulaire (depuis l'adresse de son compte) ou d'un visiteur se déclarant auteur de la signature. Éléments demandés : l'hommage (lien public), la date approximative, le geste, le texte de la signature. Le ticket ne recopie pas la signature au-delà de ce qui est nécessaire, et est clos sans la conserver.
3. **Identification** (lecture seule), dans l'éditeur SQL de Supabase B :

   ```sql
   select o.id, o.kind, o.created_at, o.signed_at
     from public.symbolic_offerings o
     join public.memorials m on m.id = o.memorial_id
    where m.slug = '<slug public>'
      and o.signature = '<texte exact>'
      and o.created_at >= '<date>'::date and o.created_at < '<date>'::date + 1;
   ```

   Exactement **une** ligne attendue ; sinon, ne rien faire et revenir vers le demandeur.
4. **Effacement** (une seule ligne, désignée par son identifiant) :

   ```sql
   begin;
   update public.symbolic_offerings
      set signature = null, signed_at = null
    where id = '<id relevé>'
      and signature is not null
      and created_at < now() - interval '30 minutes';
   -- attendu : UPDATE 1 ; sinon ROLLBACK et analyse
   commit;
   ```

   Si le geste a moins de 30 minutes, attendre la fin de la fenêtre avant d'exécuter.
5. **Vérification** par la seconde personne : la ligne existe toujours, même type et même date, `signature` et `signed_at` à `NULL`.
6. **Trace** : date de la demande, date d'exécution, identifiant du geste, personnes intervenues — **jamais** le texte de la signature.
7. **Réponse** au demandeur ; la famille est informée si la demande vient d'un visiteur (à confirmer par le QG).
8. **Sauvegardes** : la signature effacée peut subsister dans les sauvegardes de l'hébergeur jusqu'à leur expiration (durée à confirmer auprès de l'hébergeur) ; à mentionner dans la réponse si nécessaire.

### Option technique (non implémentée, pour une version ultérieure)

Si le QG souhaite un effacement définitif quel que soit le délai, ou un outil support sans SQL manuel : migration additive avec une colonne `signature_removed_at`, une fonction `remove_symbolic_offering_signature_v1(id)` réservée à un rôle support (jamais au navigateur), et une `sign_symbolic_offering_v2` qui refuse tout geste dont la signature a été retirée. Nécessite un GO produit et un GO migration distincts.

## Risque connu, hors périmètre

Les plafonds de dépôt (30 par heure, 200 par jour, provisoires) sont calculés **par hommage** : une seule personne peut les épuiser et bloquer les autres visiteurs pour la journée. La signature n'aggrave pas ce risque (elle n'ajoute aucun geste). À traiter par une décision distincte.

## Captures

`docs/validation/offrandes-signature-lot2/` — rendu réel du composant (banc de développement existant `/pilote/offrandes` et aperçu du Builder `/pilote/preview`, jamais déployés) :

- `{mobile,desktop}-{light,dark}-{bougie,lys,coeur}.jpg` : les quatre déclinaisons et les trois gestes ;
- `saisie-*` : champ focalisé, « Marie » en cours de saisie ;
- `mobile-en-*`, `mobile-es-*`, `desktop-en-*` : traductions ;
- `mobile-320-*`, `desktop-1024-*` : petites largeurs ;
- `apercu-*` : la rubrique dans l'aperçu, cartes empilées actives, bas de carte au bas de l'écran ; `*-clavier` : fenêtre réduite comme à l'ouverture d'un clavier Android.

Limite constatée : à 320 px de large, la phrase passe sur trois lignes et le bouton sur deux (planchers de lecture) ; la pointe de la flamme effleure la dernière ligne sans la masquer.
