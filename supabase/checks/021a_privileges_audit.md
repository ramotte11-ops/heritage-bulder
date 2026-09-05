# Mission 021A — Audit indépendant des privilèges Builder / `memorial_drafts`

Audit **lecture seule**. Aucune migration écrite, aucun SQL appliqué,
aucune policy modifiée, la branche Mission 021 n'est pas touchée.

| | |
|---|---|
| `main` | `12e09da0e4fd35481753c6e1f19ff4fe94f4f584` (vérifié) |
| Cible auditée | `claude/mission-021-real-builder-wiring` @ `aaebf8dce81c955f011b96fc24a0766c3df7b23c` (vérifié, non mergée) |
| Modèle de privilèges de référence | `supabase/migrations/20260901190000_privilege_model.sql` (Mission 013C) |

Le diagnostic de Mission 021 n'a **pas** été pris pour acquis : chaque
affirmation ci-dessous est soit tracée à un fichier:ligne, soit mesurée
sur un cluster PostgreSQL 16 vierge reproduisant la forme 013C
(sémantique PostgreSQL uniquement — jamais présentée comme une preuve de
l'état du vrai projet Supabase).

---

## A. Identité DB réellement utilisée par le Builder

**Une seule requête HTTP `/builder/<memorialId>` utilise DEUX identités
PostgreSQL distinctes.** C'est le point que tout le reste de l'audit
dépend, et il n'est écrit nulle part dans le rapport précédent.

| Étape | Client construit | Rôle PG effectif | RLS |
|---|---|---|---|
| `getHeritageActor()` → lecture `owners` | `createServiceRoleSupabaseClient()` (`heritage-session.ts:61`) | `service_role` | contournée (BYPASSRLS) |
| `authorizeMemorialForRequest()` → lecture `memorials.owner_id` | `createServiceRoleSupabaseClient()` (`heritage-session.ts:103-105`) | `service_role` | contournée |
| `resumeBuilderSession()` → lectures memorial + draft | `createServerSupabaseClient()` (`page.tsx:101`) | **`authenticated`** | appliquée |
| `persist` → UPDATE du draft | le même client de session | **`authenticated`** | appliquée |

`createServerSupabaseClient()` (`lib/supabase/server-client.ts:26-45`)
utilise la **clé anon** + le JWT utilisateur porté par le cookie. Le
`role` de ce JWT est ce que PostgREST fait `SET ROLE` : `authenticated`
avec une session valide, `anon` sans. Le parcours 021 n'est atteint
qu'avec une session validée (`getHeritageActor()` puis
`authorizeMemorialForRequest()`), donc **`authenticated`**.

**Réponse à la question 1 :**

* **SELECT du draft → `authenticated`**
* **UPDATE du draft → `authenticated`** *(voir la réserve en §B.4 : ce
  code ne s'exécute en réalité jamais aujourd'hui)*
* **SELECT du memorial → les deux, pour deux raisons différentes.**
  `service_role` pour la *décision d'autorisation*
  (`memorial-ownership-repository.ts` — une seule colonne, un id, jamais
  un verdict) ; `authenticated` pour la *lecture applicative* qui
  alimente le Builder (`memorial-repository.ts:92`). Les confondre est
  précisément ce qui fait sous-estimer les grants nécessaires.

---

## B. Chemin exact SELECT / UPDATE du draft

### B.1 — Les lectures, en rôle `authenticated`

`resumeBuilderSession` (`lib/builder/resume-session.ts:109,120`) appelle
deux ports. Ils produisent **quatre requêtes sur trois tables** :

| # | Table | Requête | Origine |
|---|---|---|---|
| 1 | `memorials` | `select * where id = ?` `.maybeSingle()` | `memorial-repository.ts:92-96` |
| 2 | `memorial_drafts` | `select content, updated_at where memorial_id = ?` `.single()` | `memorial-repository.ts:105-109` |
| 3 | **`memorial_published_snapshots`** | `select content, published_at where memorial_id = ?` `.maybeSingle()` | `memorial-repository.ts:113-117` |
| 4 | `memorial_drafts` | `select content, updated_at where memorial_id = ?` `.maybeSingle()` | `draft-repository.ts:35-39` |

> **La troisième table est le trou du diagnostic précédent.**
> `SupabaseMemorialRepository.findById()` compose un memorial à partir de
> **trois** tables, pas deux (c'est documenté dans son propre docstring,
> lignes 83-86). Le rapport de Mission 021 et le commentaire de
> `page.tsx:68-77` ne parlent que de `memorials` / `memorial_drafts`.
> Appliquer littéralement ce qu'ils annoncent laisserait le parcours
> échouer exactement au même endroit — un `throw` sur la requête 3, donc
> le même `status: "error"` et le même écran d'échec qu'aujourd'hui.

### B.2 — Les privilèges induits par les policies

Les policies de `memorial_drafts` (Mission 002,
`20260829155000_memorial_content.sql:58-67`) sont écrites :

```sql
using (memorial_id in (select id from memorials where owner_id = current_owner_id()))
```

Une sous-requête de policy s'exécute **avec les droits de l'appelant**.
Le dépôt le documente lui-même (`20260829154000_memorials.sql:98-100` :
« *A plain EXISTS subquery from those policies would itself be blocked by
this table's own RLS, since the subquery runs as the visitor's role
too* »).

**Mesuré** sur cluster vierge en forme 013C :

```
GRANT SELECT ON memorial_drafts TO authenticated;  -- et rien d'autre
SELECT content FROM memorial_drafts WHERE memorial_id = ...;
ERROR:  permission denied for table memorials
```

Donc : **`SELECT` sur `memorial_drafts` seul ne suffit pas**, même pour
lire uniquement le draft. `SELECT` sur `memorials` est requis deux fois
— par `findById()` *et* par la clause `USING` des deux policies du draft.

`current_owner_id()` en revanche n'exige **rien** sur `owners` : Mission
013C l'a passée en `SECURITY DEFINER` avec `search_path` épinglé
(`20260901190000:180-201`). Mesuré : avec `SELECT` sur
`memorial_drafts` + `memorials` et **aucun** privilège sur `owners`, la
lecture du draft passe. Ce point de 013C tient exactement ce qu'il
annonce.

### B.3 — L'écriture

`saveDraftContent` (`draft-repository.ts:59-64`) émet :

```sql
UPDATE memorial_drafts SET content = ? WHERE memorial_id = ? RETURNING updated_at;
```

**Mesuré :** `UPDATE` seul est insuffisant — le `WHERE` et le `RETURNING`
consomment tous deux `SELECT` sur la table :

```
GRANT UPDATE ON memorial_drafts TO authenticated;  -- SELECT révoqué
UPDATE ... RETURNING updated_at;
ERROR:  permission denied for table memorial_drafts
```

Avec `SELECT` + `UPDATE` : `UPDATE 1`, `updated_at` retourné. Et
l'isolation reste intacte — un second Owner obtient **0 ligne, sans
erreur**, ce qui est exactement la sémantique dont `.single()` a besoin
pour transformer « rien modifié » en promesse rejetée (contrat du port,
`lib/adapters/draft-repository.ts:52-58`).

### B.4 — Blocage adjacent : `persist` ne peut pas s'exécuter, quels que soient les grants

Hors périmètre DB, mais il change la réponse à « quel rôle exécute
l'UPDATE » : **aujourd'hui, aucun — l'appel n'a jamais lieu.**

`page.tsx:153-157` est un Server Component qui passe une closure à
`BuilderShell`, lequel est `"use client"`
(`components/builder/BuilderShell.tsx:1`) :

```tsx
persist={(content) => draftRepository.saveDraftContent(access.memorialId, content)}
```

Cette fonction n'est pas une Server Action (pas de `"use server"`) et
n'est donc pas sérialisable à travers la frontière RSC. Le runtime
embarqué par la version de Next épinglée par le dépôt
(`react-server-dom-webpack-server.node.production.js`) lève :

> `Functions cannot be passed directly to Client Components unless you
> explicitly expose it by marking it with "use server".`

Par ailleurs `persist` est appelé **dans le navigateur**, par
`useAutosave` (`lib/builder/use-autosave.ts`, `"use client"`) — la
closure capture un client Supabase serveur lié aux cookies, qui n'existe
pas côté client.

Pourquoi les tests ne le voient pas : `vitest.config.mts` fixe
`environment: "node"`, et le test appelle `result.props.persist(...)`
directement sur l'élément React retourné
(`app/builder/[memorialId]/page.test.tsx:208`) — la sérialisation RSC
n'est jamais franchie. `next build` ne le voit pas non plus : c'est une
erreur d'exécution, et la route est `force-dynamic`.

**Ordre réel d'apparition des défauts** — précision utile pour ne pas
sur-diagnostiquer :

1. *Aujourd'hui* : la requête 1 échoue (`permission denied for table
   memorials`) → `status: "error"` → l'avis contrôlé « n'a pas pu être
   chargé ». C'est bien ce que Mission 021 annonce.
2. *Après les grants seuls* : un memorial issu d'une redemption a
   `editorial_context` / `language` à NULL
   (`20260901120000:58-61`), donc `isConfiguredMemorial()` est faux et
   l'écran « doit encore être configuré » s'affiche — `BuilderShell`
   n'est pas rendu, le crash n'est pas atteint.
3. *Après les grants, sur un memorial configuré* : `BuilderShell` est
   rendu et la sérialisation de `persist` lève.

Autrement dit **les grants sont nécessaires mais pas suffisants** pour
que Mission 021 fonctionne. À traiter dans la mission applicative (une
Server Action `"use server"` qui reconstruit le client serveur et
ré-autorise `memorialId`), pas dans la migration.

---

## C. Grants et policies actuels, vus dans le dépôt

`20260901190000_privilege_model.sql` révoque tout sur les sept tables
pour `public, anon, authenticated, service_role`, puis re-accorde
uniquement :

```
owners        service_role  SELECT, INSERT
entitlements  service_role  SELECT, INSERT, UPDATE
memorials     service_role  SELECT, INSERT
```

Aucune migration postérieure (015B, 019C) ne touche ces trois tables —
vérifié par recherche exhaustive des `grant`/`revoke`.

État qui en résulte, **confirmé en appliquant les migrations réelles sur
un cluster vierge** :

| Table | `anon` | `authenticated` | `service_role` |
|---|---|---|---|
| `memorials` | — | **—** | SELECT, INSERT |
| `memorial_drafts` | — | **—** | **—** |
| `memorial_published_snapshots` | — | **—** | **—** |

RLS activée sur les sept tables. Les policies pertinentes existent et
ciblent bien `authenticated` : `memorials_select_own`,
`memorial_drafts_select_own`, `memorial_drafts_update_own`,
`memorial_published_snapshots_select_own`. Elles sont **inertes**, faute
du privilège de table.

À noter : **`service_role` ne détient rien non plus sur
`memorial_drafts`** — et `BYPASSRLS` ne contourne *pas* les privilèges de
table. Mesuré : `set role service_role; select count(*) from
memorial_drafts;` → `permission denied`.

---

## D. Contradiction avec Mission 013C ?

**Non — aucune contradiction, mais une sous-estimation de portée.**

013C a délibérément laissé `anon`/`authenticated` sans privilège et l'a
écrit noir sur blanc (lignes 124-138) : « *A policy without a grant is
inert, not broken… The mission that wires an owner-facing screen opens
the grant it needs, as a conscious act.* » Mission 021 **est** cette
mission. Ouvrir le grant applique la doctrine 013C, ne la renverse pas.

Deux affirmations de 013C ont été re-testées et tiennent :

* `current_owner_id()` en `DEFINER` supprime réellement le besoin de
  `SELECT` sur `owners` — **vérifié**.
* `create_memorial_draft()` en `DEFINER` supprime réellement le besoin
  d'`INSERT` sur `memorial_drafts` — **vérifié** (§E, question 5).

Le seul écart est dans le **rapport de Mission 021**, pas dans 013C : il
annonce « `SELECT`/`UPDATE` sur `memorials`/`memorial_drafts` »
(`README.md:857-863`, et le commentaire `page.tsx:68-77`), en omettant
`memorial_published_snapshots`. Appliqué tel quel, le parcours resterait
cassé.

---

## E. Solution minimale recommandée

### Réponses directes

**3. Quels privilèges manquent exactement ?** Quatre, sur trois tables,
pour le seul rôle `authenticated` :

```
authenticated  SELECT  memorials                     -- findById() + sous-requête des policies du draft
authenticated  SELECT  memorial_drafts               -- getDraftContent() + WHERE et RETURNING de saveDraftContent()
authenticated  UPDATE  memorial_drafts               -- l'autosave lui-même
authenticated  SELECT  memorial_published_snapshots  -- 3e lecture de findById()
```

**4. Peut-on n'ouvrir que le nécessaire ?** Oui. Rien pour `anon`, rien
sur `owners`, rien sur `entitlements` (donc `activation_key_hash` reste
inatteignable — la protection décrite par 013C:142-146 est intacte), pas
d'`INSERT`, pas de `DELETE`, pas d'`UPDATE` sur `memorials`, aucun
privilège de colonne.

**5. Les INSERT sur `memorial_drafts` sont-ils nécessaires ?** **Non — le
draft existe déjà.** Le trigger `memorials_create_draft` crée la ligne au
moment où le memorial est créé, à l'intérieur de `redeem_entitlement()`
(`20260901120000:197`), et `create_memorial_draft()` est `SECURITY
DEFINER` depuis 013C — l'invariant ne dépend d'aucun privilège de
l'appelant. `DraftRepository` n'expose d'ailleurs aucune méthode de
création : `getDraftContent` et `saveDraftContent`, rien d'autre.

**6. GRANT direct, `service_role`, ou RPC ?** **GRANT direct à
`authenticated`.** Voir §F.

### Le point à arbitrer par le QG

Accorder `SELECT` sur `memorial_published_snapshots` à `authenticated`
active aussi la policy `memorial_published_snapshots_select_public`
(`20260829155000:93-101`), qui cible `anon, authenticated`. Conséquence :
**tout compte connecté pourra lire le contenu déjà publié de n'importe
quel memorial.** `anon` reste fermé (aucun grant).

Sémantiquement c'est cohérent — « publié » veut dire public — mais c'est
une ouverture qui arrive **avant** la mission qui devait la décider. Deux
options, à trancher explicitement plutôt qu'à subir :

* **(a)** accepter, en le documentant dans la migration ;
* **(b)** ne pas accorder cette table et faire en sorte que le Builder ne
  la lise pas — ce qui suppose une modification applicative de
  `findById()` (ou un port de lecture dédié), donc du code Mission 021,
  pas seulement une migration.

Recommandation : **(a)**, à condition de l'écrire dans la migration. (b)
crée une seconde voie de lecture pour le memorial, exactement ce que la
consigne demande d'éviter.

---

## F. Pourquoi les alternatives sont moins bonnes

| Option | Verdict |
|---|---|
| **GRANT direct à `authenticated`** *(recommandé)* | Active des policies **déjà écrites, déjà ciblées `authenticated`, déjà testées** par `scripts/db/test-local.sh`. Zéro nouvelle surface. Le refus reste « 0 ligne », pas « permission denied » — ce dont les `.maybeSingle()`/`.single()` du dépôt dépendent. |
| **Primitive serveur en `service_role`** | Coûte **plus** de grants, pas moins : `service_role` n'a rien sur `memorial_drafts`, il faudrait lui ouvrir `SELECT` + `UPDATE` — et `BYPASSRLS` fait alors de la sécurité une propriété du code applicatif, avec les policies définitivement inertes. Contredit frontalement le contrat de `draft-repository.ts:15-22` (« *the caller must construct this with a session-scoped client, never the service-role client* ») et le principe Mission 014 selon lequel `service_role` ne sert qu'à établir la vérité terrain d'une décision, jamais à porter les données de l'utilisateur. |
| **RPC dédié** | Mêmes défauts que ci-dessus, plus une **seconde voie d'accès au draft** à côté de `DraftRepository` — ce que la consigne interdit. Aucun problème que le GRANT ne règle pas. |
| **Grants de colonne** | `memorial_drafts` n'a que `memorial_id`, `content`, `updated_at` : les trois sont lues. Complexité sans réduction d'accès. |
| **Envelopper la sous-requête des policies dans un `SECURITY DEFINER`** | N'économise rien : `SELECT` sur `memorials` est de toute façon requis par `findById()`. Réécrirait des policies Mission 002 sans bénéfice. |

---

## G. Préflight SQL read-only

`supabase/checks/021a_privileges_preflight.sql` — une **unique
instruction `SELECT`** (un seul `;` en fin de fichier ; les autres
occurrences sont de la ponctuation française dans des commentaires).

Couvre : privilèges effectifs `PUBLIC`/`anon`/`authenticated`/
`service_role` sur les sept tables (y compris les couples sans aucun
privilège, rendus explicites) · propriétaires · `pg_default_acl` ·
RLS activée/forcée · policies avec rôles ciblés et expressions
`USING`/`WITH CHECK` réelles · privilèges de colonne **propres**
(ceux qui n'échappent pas déjà à la section 1) · fonctions et RPC
(`prosecdef`, propriétaire, `search_path`, EXECUTE par rôle) · présence
du trigger `memorials_create_draft` · vues/RPC constituant une autre voie
d'accès · **verdict ligne à ligne des quatre privilèges manquants**,
avec les contrôles de non-élargissement · état des migrations 013C /
015B / 019C · volumes et invariant « un memorial ⇒ un draft » · version
serveur.

Vérifications faites sur ce fichier :

* exécuté sans erreur sur un cluster construit à partir des **migrations
  réelles** du dépôt (91 lignes retournées) ;
* exécuté avec succès sous `default_transaction_read_only = on` — toute
  écriture y échouerait ;
* aucune ligne ne commence par `GRANT`, `REVOKE`, `CREATE`, `ALTER`,
  `DROP`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `SET`, `DO`, `CALL`
  (commentaires exclus).

Sur ce cluster de contrôle, la section 9 rend :

```
authenticated SELECT memorials                     -> MANQUANT
authenticated SELECT memorial_drafts               -> MANQUANT
authenticated UPDATE memorial_drafts               -> MANQUANT
authenticated SELECT memorial_published_snapshots  -> MANQUANT
... tous les contrôles de non-élargissement        -> OK (ferme)
```

**Ceci mesure le dépôt, pas le vrai projet Supabase.** Seule l'exécution
du préflight sur le vrai projet fait foi — c'est tout l'objet de cette
mission.

---

## H. Impacts attendus sur les tests / le harness

`scripts/db/test-local.sh` a **anticipé** cette mission ; les impacts
sont ciblés et connus d'avance.

1. **Assertions à déplacer.** Lignes 258-266, la boucle
   « *client roles get nothing from the migrations* » affirme que
   `anon` **et** `authenticated` n'ont ni `SELECT`, `INSERT`, `UPDATE`,
   `DELETE` sur les sept tables. Quatre de ces assertions passeront au
   rouge. Elles ne doivent pas être supprimées mais **resserrées** : le
   jeu attendu pour `authenticated` devient exactement les quatre
   privilèges du §E, et tout le reste doit rester à `f`. Le commentaire
   ligne 355-357 le prévoit explicitement (« *The mission that wires an
   owner-facing screen adds the real grant to a migration and moves the
   matching assertion* »).

2. **Grants de test à réduire.** Lignes 358-362, le harness s'accorde
   lui-même `select` sur six tables et `update` sur quatre pour
   `authenticated`. Une fois la migration en place, ces grants doivent
   être retirés pour les privilèges désormais fournis par la migration —
   sinon le harness masque à nouveau ce qu'il est censé mesurer,
   exactement le défaut que 013C a corrigé. Les grants restants
   (`media`, `messages`, colonnes d'`entitlements`, `anon` sur
   `memorials`/`memorial_drafts`) conservent leur justification.

3. **Aucun test RLS à réécrire.** Les assertions d'isolation
   (lignes 464-491 : lecture propre, lecture croisée à zéro, autosave
   propre, autosave croisé sans effet, `anon` à zéro) tournent déjà sous
   des grants **plus larges** que la recommandation. Elles restent
   valides et deviennent enfin une mesure de l'état réel plutôt que d'un
   état fabriqué par le harness.

4. **Suite Vitest : aucun impact.** Aucun test ne touche PostgreSQL ; les
   repositories sont mockés. Corollaire à ne pas perdre de vue : **la
   suite Vitest ne peut pas prouver que la migration marche**, et n'a pas
   détecté le blocage `persist` du §B.4. Un postflight (non écrit ici)
   sera nécessaire côté vrai projet.

5. **Un postflight reste à écrire** après retour du préflight, sur le
   modèle de `013c_postflight.sql` : les quatre privilèges présents,
   tous les contrôles de non-élargissement toujours fermés, et l'effet de
   bord `_select_public` constaté et assumé.

---

## STOP

Aucune migration ne doit être écrite ni appliquée avant le retour du
préflight réel au QG. Trois décisions attendent ce retour :

1. **Confirmation de l'état réel** — en particulier que 013C est bien
   appliquée sur le vrai projet et que `current_owner_id()` y est bien
   `SECURITY DEFINER`. Si elle est `INVOKER`, `authenticated` exigerait
   **en plus** `SELECT` sur `owners`, et la recommandation change.
2. **Arbitrage de l'effet de bord** `memorial_published_snapshots_select_public`
   (§E, options (a)/(b)).
3. **Traitement du blocage `persist`** (§B.4), qui relève de la mission
   applicative et non de la migration — mais sans lequel les grants ne
   suffiront pas à faire fonctionner Mission 021.
