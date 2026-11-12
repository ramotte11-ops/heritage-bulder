/** QG 008 Lot 3 — the main photo screen (T06), opened for revision through
 * the route's own validated `?etape=` claim (`JOURNEY_SCREEN_IDS`: the
 * screen id is `photo`; `resolveRevisionTarget` ignores anything else). */
export function heroPhotoPath(builderPath: string | null): string | null {
  return builderPath === null ? null : `${builderPath}?etape=photo`;
}
