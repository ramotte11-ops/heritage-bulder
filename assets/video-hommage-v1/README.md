# Vidéo hommage — « Des instants pour se souvenir » V1 : Masters officiels

Les quatre Masters validés par la Product Owner (VID-02 V1.1, déclinaisons
validées en VID-05A), copiés **octet pour octet** depuis l'archive remise par
la PO, `HERITAGE_VIDEO_Desktop_Light_MASTER.zip` (contenant les quatre PNG),
pour la mission VID-05B.

Zone protégée (`AGENTS.md`) : ne jamais modifier, recompresser ni supprimer.
Ces sources ne sont jamais servies. Les versions servies au navigateur sont
dérivées par `scripts/pilot/video-hommage-v1-derive.py` dans
`public/assets/video-hommage/v1/` : AVIF 4:4:4 qualité 90 et WebP sans perte,
à la largeur native et à une largeur réduite, chaque nom de fichier commençant
par le SHA-256 complet de ses octets (convention du lot 06-D). Le manifeste
est `components/memorial/video/video-masters.ts`, vérifié par
`video-masters.test.ts`.

Scène unique par Master : aucun recadrage, aucune recomposition, aucun
découpage en bandes décoratives.

| Fichier | Dimensions | Octets | SHA-256 |
|---|---|---|---|
| `source/HERITAGE_VIDEO_Desktop_Light_MASTER.png` | 1670 × 942 | 1 564 693 | `47d07afc7ad65a2576d9a93b52e1b24c7fdb35d677e364fccb7a5e51b2938c13` |
| `source/HERITAGE_VIDEO_Desktop_Dark_MASTER.png` | 1670 × 942 | 1 336 900 | `46c31724fde3bca7f0fc420c27076291a4869a9828c906829dcad92b1de25b7e` |
| `source/HERITAGE_VIDEO_Mobile_Light_MASTER.png` | 1024 × 1536 | 1 698 507 | `9c6fadb9d63ecd60d1ebe3f5b6bfb054ac3d408db3b13041a151ec3753c9eae1` |
| `source/HERITAGE_VIDEO_Mobile_Dark_MASTER.png` | 1024 × 1536 | 1 340 309 | `d07e5be549e78d0ed0e5ae184c0b42455ea81f3e34e4d4e3d9ce38682153f1bf` |
