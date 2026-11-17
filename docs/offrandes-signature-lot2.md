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

## Décisions attendues du QG (RGPD)

1. **Conservation** : aujourd'hui, une signature vit aussi longtemps que le geste, c'est-à-dire que l'hommage (suppression en cascade avec le mémorial). Faut-il une durée maximale propre aux signatures ?
2. **Suppression** : ni la famille ni le visiteur ne peuvent aujourd'hui effacer une signature. Une fonction propriétaire « retirer la signature » serait une extension (nouvelle migration).
3. **Demande d'un visiteur** (accès, effacement) : aucune donnée ne relie un visiteur à sa signature ; la demande passe par la famille ou le support, sur indication du prénom, de l'hommage et de la date.
4. **Information** : la scène n'affiche pas de mention de confidentialité (décision PO) ; la politique de confidentialité du site doit décrire cette donnée facultative.
5. **Retour arrière** : il détruit les signatures ; un export préalable relève du QG.

## Retrait d'une signature par la famille — proposition (NON implémentée)

Objectif : la famille retire une signature de son Carnet des attentions ; le geste (type, date) reste et continue d'être compté.

Migration additive supplémentaire (à faire après la migration du Lot 2) :

- colonne `symbolic_offerings.signature_removed_at timestamptz` (NULL tant qu'aucune signature n'a été retirée) ;
- fonction `remove_symbolic_offering_signature_v1(p_offering_id uuid)`, `SECURITY DEFINER`, `search_path` vide, exécutable par `authenticated` seulement. Une instruction UPDATE : `signature = NULL, signed_at = NULL, signature_removed_at = now()` **uniquement** si le geste appartient à un mémorial du propriétaire connecté (`memorial_id in (select id from memorials where owner_id = current_owner_id())`) et porte une signature. Issues : `removed`, `not_found` (geste d'un autre, inexistant ou déjà sans signature — indistinguables) ;
- nouvelle version `sign_symbolic_offering_v2` qui refuse aussi un geste dont la signature a été retirée (`signature_removed_at is null`) : sans cela, le visiteur pourrait re-signer pendant la fenêtre de 30 minutes. La v1 est retirée à la même migration, le code passant à la v2 ;
- aucun droit d'UPDATE direct accordé ; la famille garde la lecture par colonnes actuelle.

Application : un lien discret « Retirer la signature » à côté d'un geste signé, dans le Carnet seulement, avec une confirmation (« La signature sera définitivement effacée. Le geste est conservé. ») ; action serveur sous la session de la famille ; réponse booléenne ; rien n'est journalisé.

Garanties à prouver au banc SQL : un autre propriétaire, un visiteur et `service_role` sans session ne retirent rien ; le geste et les compteurs sont inchangés ; une signature retirée ne revient pas ; retirer deux fois est sans effet.

Politique de confidentialité (aucune mention dans la scène, décision PO) : donnée (prénom ou surnom facultatif, saisi volontairement), finalité (transmettre une attention à la famille), destinataire unique (la famille titulaire de l'hommage), aucune publication, durée (celle de l'hommage, sauf décision du QG), droit d'effacement (par la famille dans son Carnet, ou sur demande au support).

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
