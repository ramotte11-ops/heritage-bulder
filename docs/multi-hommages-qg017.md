# QG 017 — Jusqu'à 3 hommages gratuits en préparation par compte

> **Rien ici n'est appliqué.** Migration, déploiement : GO QG distincts. Aucune valeur secrète.

## Décisions produit (QG, 15/11/2026)

- 3 hommages **gratuits** en préparation par compte au plus ; les hommages complets (payants) ne comptent pas.
- 1 publication gratuite par compte sur 12 mois glissants, sauf dérogation administrative (inchangé).
- Fenêtre de publication gratuite de 10 jours et préparation de 45 jours **communes** : aucun nouveau
  brouillon ne prolonge une échéance existante ; seul un brouillon sans autre brouillon actif reçoit ses
  propres 45 jours (règle existante), sans droit gratuit nouveau.
- Aucun plafond en **nombre** de photos (préparation premium : 50 photos et plus).

## Lot A — base de données (Opus) — `supabase/migrations/20261116090000_qg017_multi_hommages.sql`

| Élément | Effet |
|---|---|
| `free_active_drafts_per_owner` 1 → 3 | `create_free_memorial_v1` et `begin_guest_draft_transfer_v1` (inchangés) refusent le 4ᵉ brouillon gratuit actif : `active_draft_exists`, rien créé ni écrasé |
| `free_storage_bytes_per_owner` = 300 Mo | budget **par compte**, octets des médias prêts des hommages en offre gratuite (publiés ou non) ; hommages complets ni comptés ni plafonnés ; dépassement → nouvel envoi refusé, `HD507` « free storage budget reached » ; rien n'est supprimé |
| `preview_free_draft_save_v1(owner, transfer_key)` | lecture seule, `service_role` : `resume` / `create` / `limit_reached` / `refused`, avec `free_publish_until` (NULL = pas de publication gratuite) et `free_draft_until` réels, mêmes règles que l'ancrage |

Inchangés et revérifiés par le banc : verrou du quota au moment de publier (`guard_free_first_publication_v1`,
HD403), héritage des échéances (`anchor_free_memorial_v1`), sérialisation par compte (double onglet),
idempotence par `(compte, transfer_key)`, droits C3.

**Budget de 300 Mo — justification** : le Builder prépare une photo de galerie à ~350 Ko (profil
`gallery`, 1600 px) et la photo principale à ~700 Ko (`config/photo-profiles.ts`) ; même à 1 Mo par photo
(images difficiles à compresser), 300 Mo couvrent **3 hommages de 100 photos**. Il ne vise que les envois
qui contournent le Builder (jusqu'à 15 Mo par fichier côté serveur). Valeur en **données** : ajustable par
une migration relue, ou désactivable (`NULL`).

**Contrat applicatif** (dans ce lot) : `previewGuestDraftSaveAction(rawDraft)` (app/brouillon/reprise/actions.ts)
→ `PreviewGuestSaveResult` (lib/guest-draft/guest-draft-transfer.ts).

## Lot B — interface (Codex) — **après** application du lot A

1. **`/brouillon/sauvegarder`, personne connectée** : ne plus rediriger en silence. Afficher l'adresse du
   compte, puis appeler `previewGuestDraftSaveAction` avec le brouillon local et afficher :
   - `create` : « Cet hommage sera conservé jusqu'au {freeDraftUntil}. » + selon `freePublishUntil` :
     « Vous pouvez publier gratuitement **un** de vos hommages jusqu'au {date}. » ou « La publication gratuite
     de votre compte est déjà utilisée ou terminée ; cet hommage pourra être publié avec l'offre complète. »
     + « Hommages en préparation : {activeFreeDrafts + 1} / {maxFreeDrafts} » ;
   - `resume` : « Cet hommage est déjà enregistré » + ses dates ;
   - `limit_reached` : message ci-dessous, lien vers l'espace famille (`/owner`), **aucun** bouton Continuer.
   Boutons : **Continuer** (lance le transfert existant `/brouillon/reprise`) · **Changer de compte**
   (déconnexion locale `signOut({ scope: "local" })`, puis formulaire ; le brouillon local est conservé).
2. **`/brouillon/reprise`** (atteinte aussi après « Créer mon compte » / « J'ai déjà un compte ») : afficher
   d'abord la même carte (compte + aperçu) et ne lancer le transfert qu'au clic sur **Continuer**. Seule
   exception : `resume` d'un transfert interrompu, qui peut reprendre directement (mêmes échéances, rien
   de nouveau).
3. **Messages FR/EN/ES** :
   - limite : « Votre compte a déjà {max} hommages en préparation. L'hommage en cours est conservé
     **uniquement dans ce navigateur** : ne fermez pas cette page et n'effacez pas les données du site.
     Publiez ou terminez un hommage depuis votre espace famille. »
   - tout échec de transfert : « … conservé uniquement dans ce navigateur » + **Réessayer** ;
   - budget de stockage atteint (`HD507`, à mapper dans la chaîne média : aujourd'hui seuls 42501/23514/40001
     le sont, `lib/adapters/supabase/media-repository.ts`) : « L'espace photos de l'offre gratuite de votre
     compte est plein. Passez à l'offre complète ou retirez des photos. »
4. **Espace famille (`/owner`)**, FR/EN/ES : compteur « Hommages en préparation : n / 3 » (hommages gratuits
   non publiés, préparation en cours) ; échéances par hommage (déjà présentes, à traduire) ; encadré unique :
   « Publication gratuite de votre compte : disponible jusqu'au {date} pour **un** de vos hommages » / « déjà
   utilisée » / « terminée ».
5. **Avant une publication gratuite**, si le compte a d'autres brouillons gratuits : « En publiant cet
   hommage gratuitement, vous utilisez la publication gratuite de votre compte pour 12 mois. »
6. Tests applicatifs : page de sauvegarde (compte, Continuer, Changer de compte, 3 issues de l'aperçu),
   messages trilingues, brouillon local jamais effacé sur refus ou échec, espace famille avec 3 hommages,
   mapping HD507.

Interdits : design, Stacking, animations ; aucune annonce de « 3 hommages » tant que le lot A n'est pas appliqué.

## Mise en production (chaque étape sur GO)

1. **Lot A** : PR (CI verte, banc QG 017) → fusion → application de la migration sur B (connecteur en
   écriture, `apply_migration`) → contrôles : réglages `3 | 314572800`, fonctions présentes, droits
   (`preview` : service_role seul). Le site actuel reste compatible : il sauvegarde simplement jusqu'à
   3 hommages ; **la PO peut alors sauvegarder son deuxième hommage** (même compte, même navigateur,
   « Sauvegarder » : il héritera des échéances du premier).
2. **Lot B** : PR (CI verte) → fusion → construction Netlify sans publication → recette PO sur l'aperçu de
   déploiement → publication.
3. Recette : 3 hommages, 4ᵉ refusé, dates affichées = dates obtenues, publication gratuite unique,
   double onglet, reconnexion, « Changer de compte ».

**Retour arrière** : lot B → republier le déploiement précédent. Lot A → **nouvelle** migration
`free_active_drafts_per_owner = 1` (les comptes ayant 2–3 brouillons les conservent ; aucun nouveau au-delà
de 1) et, si nécessaire, `free_storage_bytes_per_owner = NULL`. Aucune donnée n'est supprimée.
