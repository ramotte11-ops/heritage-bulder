# Retour arrière après activation de la durée premium

Le retour arrière porte sur la version de l’application. Conserver le schéma, les dates contractuelles, les fonctions, les déclencheurs, les politiques RLS et les privilèges de la migration 06-F1. La première version du fichier `20261127214203_premium_term_foundation.down.sql` rétablissait une visibilité qui ignorait l’échéance premium. Écarter cette version du SHA `66506d5fbdb76d72bfb55ac961d36211215f1301`.

1. Identifier une version applicative compatible avec la base 06-F1 et qui conserve les contrôles serveur de publication, d’accès public, de récupération familiale et d’archivage. Le build antérieur à 06-F1 ne possède pas tous ces contrôles.
2. Exécuter le fichier `supabase/rollbacks/20261127214203_premium_term_foundation.down.sql` corrigé comme contrôle de lecture avec arrêt à la première erreur. Il vérifie les déclencheurs de datation et de protection des publications, puis refuse si le prédicat de visibilité ou la RPC publique expose un hommage premium expiré.
3. Sur un environnement isolé, vérifier le build candidat avec un avis gratuit visible, un avis gratuit expiré, un premium actif, un premium en récupération et un premium en archive. Contrôler aussi les lectures directes, les photos, les vidéos, les contributions et les droits de la famille. Comparer les dates contractuelles et les empreintes du brouillon et de l’instantané de publication.
4. Avant toute restauration en exploitation, obtenir le GO séparé et consigner la cible, les résultats et les critères d’arrêt. Si aucun build compatible n’est disponible ou si un contrôle échoue, isoler les surfaces publiques concernées et préparer une correction qui conserve les protections.

Le contrôle SQL ne modifie ni les protections ni les données. L’exercice PostgreSQL local couvre l’état de la base. Une restauration applicative complète et les contrôles des fournisseurs restent à valider sur un environnement isolé.
