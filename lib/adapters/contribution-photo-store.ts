/**
 * M8-E2 — O5 : les deux opérations de stockage dont le traitement serveur
 * des photos de proches a besoin, EN PLUS du port existant
 * `MediaObjectStore` (réservation, lecture signée, taille, nettoyage),
 * qui reste inchangé.
 *
 * SERVER ONLY : la mise en œuvre utilise le client service_role sur le
 * bucket privé `memorial-media`.
 *
 * Le circuit reste celui de Mission 030 : le navigateur dépose les octets
 * BRUTS directement dans Storage, au chemin réservé ; le serveur les
 * télécharge, les traite (sharp) et REMPLACE l'objet au même chemin par la
 * version nettoyée avant que le média ne passe `ready`. Les octets bruts
 * ne sont donc jamais ceux d'un média `ready` : rien ne les rend lisibles
 * à la famille ni au public (le bucket est privé ; seules des URL signées
 * de médias `ready` sont émises).
 */
export interface ContributionPhotoStore {
  /**
   * Les octets de l'objet, ou `null` s'il n'existe pas. Refuse (exception)
   * au-delà de `maxBytes` plutôt que de charger un fichier démesuré.
   */
  download(input: { path: string; maxBytes: number }): Promise<Uint8Array | null>;

  /** Remplace l'objet au même chemin (écriture serveur, écrasement explicite). */
  replace(input: { path: string; bytes: Uint8Array; contentType: string }): Promise<void>;
}

export class ContributionPhotoTooLargeError extends Error {
  constructor() {
    super("Contribution photo larger than the accepted ceiling");
  }
}
