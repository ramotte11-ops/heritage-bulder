import type { Language } from "@/config/languages";

/**
 * Cérémonie Intemporel V2 — heures affichées seules (cartouche « Date et
 * heure », déroulement). Le Master écrit « 14 h 00 », sans la préposition
 * « à » de la V1 (`formatCeremonyTime`, lib/memorial/format-ceremony-datetime.ts,
 * que ce module ne modifie pas). Espaces insécables : une heure ne se
 * coupe jamais en fin de ligne.
 *
 * - fr : « 14 h 00 », « 9 h 30 » (l'heure sans zéro initial, usage
 *   typographique français) ;
 * - es : « 14:00 », « 9:30 » ;
 * - en : « 2:00 PM ».
 */
export function formatCeremonyClock(time: string, language: Language): string {
  const [hours, minutes] = time.split(":").map(Number);
  const mm = String(minutes).padStart(2, "0");
  if (language === "fr") return `${hours} h ${mm}`;
  if (language === "es") return `${hours}:${mm}`;
  const period = hours >= 12 ? "PM" : "AM";
  const hours12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hours12}:${mm} ${period}`;
}

/**
 * Lien « Voir sur la carte » : une recherche OpenStreetMap sur le lieu et
 * l'adresse réellement saisis par la famille (aucune clé, aucun traceur ;
 * OpenStreetMap validé par la PO pour la V2). Jamais d'adresse fictive :
 * sans adresse, le renderer n'affiche aucun lien.
 */
export function ceremonyMapUrl(venueName: string | null, address: string): string {
  const query = [venueName, address.replace(/\s*\n\s*/g, ", ")].filter((part) => part !== null).join(", ");
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(query)}`;
}
