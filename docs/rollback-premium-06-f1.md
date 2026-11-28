# Retour arrière après activation de la durée premium

Le retour arrière porte sur la version de l’application. Conserver le schéma, les dates contractuelles, les fonctions, les déclencheurs, les politiques RLS et les privilèges de la migration 06-F1. La première version du fichier `20261127214203_premium_term_foundation.down.sql` rétablissait une visibilité qui ignorait l’échéance premium. Écarter cette version du SHA `66506d5fbdb76d72bfb55ac961d36211215f1301`.

1. Identifier une version applicative compatible avec la base 06-F1 et qui conserve les contrôles serveur de publication, d’accès public, de récupération familiale et d’archivage. Le build antérieur à 06-F1 ne possède pas tous ces contrôles.
2. Exécuter le fichier `supabase/rollbacks/20261127214203_premium_term_foundation.down.sql` corrigé comme contrôle de lecture avec arrêt à la première erreur. Il vérifie les déclencheurs de datation et de protection des publications, puis refuse si le prédicat de visibilité ou la RPC publique expose un hommage premium expiré.
3. Sur un environnement isolé, vérifier le build candidat avec un avis gratuit visible, un avis gratuit expiré, un premium actif, un premium en récupération et un premium en archive. Contrôler aussi les lectures directes, les photos, les vidéos, les contributions et les droits de la famille. Comparer les dates contractuelles et les empreintes du brouillon et de l’instantané de publication.
4. Avant toute restauration en exploitation, obtenir le GO séparé et consigner la cible, les résultats et les critères d’arrêt. Si aucun build compatible n’est disponible ou si un contrôle échoue, isoler les surfaces publiques concernées et préparer une correction qui conserve les protections.

Le contrôle SQL ne modifie ni les protections ni les données. L’exercice PostgreSQL local couvre l’état de la base. Une restauration applicative complète et les contrôles des fournisseurs restent à valider sur un environnement isolé.

## Candidat et recette 06-F1-R2

Conserver l’artefact du premier build 06-F1-R2 validé en tant que version de secours pour les versions suivantes. Enregistrer son SHA Git, l’empreinte de l’artefact et les versions de ses migrations dans le registre de livraison. Le build 06-F1-R (`af366e2d0fd83864be9038780340c5ba28dfae23`) ne répond pas à l’exigence R2 de plafonnement des liens publics. Si la version en défaut est la première version R2 et qu’aucun autre artefact n’offre les mêmes protections, appliquer la stratégie d’isolement et de correction de l’étape 4.

Préparer deux instances applicatives sur un environnement de recette isolé, avec la même base jetable contenant 06-F1 et 06-F1-R2, un bucket privé de test, des vidéos de test chez Mux et deux identités familiales synthétiques. Utiliser un média reconnaissable pour chaque cas et des échéances proches. Conserver une empreinte des quatre dates, du brouillon, de l’instantané, des contributions et des métadonnées et objets médias.

1. Exécuter le contrôle SQL en lecture seule avant la bascule. Relever les résultats de référence avec un visiteur anonyme, la famille propriétaire et une autre famille.
2. Basculer le trafic de recette vers l’artefact de secours, sans revenir en arrière sur le schéma. Refaire les lectures gratuites et premium, y compris l’album paginé, le renouvellement des liens de contribution, le lecteur vidéo et les accès familiaux.
3. Vérifier qu’un premium expiré reste fermé au public, qu’une famille propriétaire en récupération voit ses contenus et qu’une archive ne permet plus de les lire ou de compter, modérer ou retirer ses contributions. Vérifier qu’un autre propriétaire reste refusé.
4. Exercer les photos et vidéos juste avant, à et après l’échéance. Contrôler l’expiration des nouveaux jetons, une lecture HLS engagée, puis les requêtes directes avec cache froid et chaud. Relever séparément les réponses des fournisseurs et les octets déjà en mémoire dans le navigateur.
5. Comparer les empreintes initiales et finales, puis réexécuter le contrôle SQL. Toute réouverture, échéance déplacée ou divergence de contenu bloque la validation du candidat.
