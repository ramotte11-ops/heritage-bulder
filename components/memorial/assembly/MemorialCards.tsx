"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./MemorialCards.module.css";

/**
 * Cartes mémorielles V2.1 — validées par la PO (direction artistique gelée).
 *
 * Chaque rubrique assemblée (`[data-memorial-section]`, posé par
 * `MemorialAssembly`) devient une grande carte. La carte suivante monte et se
 * pose DEVANT la précédente, qui se met en retrait (léger recul, voile, bord
 * supérieur arrondi). Aucune règle n'entre dans un Master : tout porte sur le
 * bloc neutre qui l'enveloppe. Un seul moteur, pour la Preview du Builder et
 * pour la page publique, puisque les deux montent `MemorialAssembly`.
 *
 * Le mouvement est natif (`position: sticky`). Le JS ne fait que mesurer
 * (ResizeObserver) et, une fois par image pendant le défilement, écrire la
 * part recouverte `--p` de chaque carte. Aucun défilement forcé, aucune
 * inertie simulée. Une carte ne se fige que lorsque son bas atteint le bas de
 * l'écran : elle est lue en entier avant d'être recouverte, jamais tronquée.
 *
 * Variables écrites sur chaque carte (lues par MemorialCards.module.css) :
 *   --pin   top sticky : 0, ou (hauteur visible − hauteur de la carte)
 *   --clip  haut de la zone visible, dans la carte (bord arrondi du retrait)
 *   --oy    origine verticale du recul (centre de la zone visible)
 *   --p     0 → 1 : part de l'écran déjà recouverte par la carte suivante
 *
 * Effet coupé (cartes statiques, lecture linéaire) quand :
 *   - l'appareil demande moins d'animations (`prefers-reduced-motion`) ;
 *   - écran tactile de moins de 560 px de haut (téléphone en paysage) ;
 *   - souris / trackpad et moins de 360 px de haut. V2.1 : un seuil unique de
 *     560 px coupait l'effet sur les fenêtres d'ordinateur basses ;
 *   - le navigateur n'offre pas matchMedia, ResizeObserver ou
 *     requestAnimationFrame ;
 *   - l'Album complet de la Galerie est ouvert (CSS, voir le module).
 */
export const TOUCH_MIN_HEIGHT = 560;
export const POINTER_MIN_HEIGHT = 360;

/** Marge laissée au-dessus d'un élément pris au clavier qu'une carte recouvrait. */
const FOCUS_MARGIN = 24;

export function MemorialCards({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    if (
      typeof window.matchMedia !== "function" ||
      typeof ResizeObserver !== "function" ||
      typeof requestAnimationFrame !== "function"
    ) {
      return;
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarse = window.matchMedia("(pointer: coarse)");
    const cards = () =>
      Array.from(root.children).filter(
        (el): el is HTMLElement => el instanceof HTMLElement && el.hasAttribute("data-memorial-section"),
      );

    // Chrome épinglée par l'hôte au-dessus de l'hommage : la barre sticky
    // « Revenir à la création » de la Preview. Zéro sur la page publique.
    const offset = () => {
      const bar = root.closest("[data-memorial-preview]")?.firstElementChild;
      if (!(bar instanceof HTMLElement) || bar.contains(root)) return 0;
      return getComputedStyle(bar).position === "sticky" ? bar.offsetHeight : 0;
    };

    let vh = 0;
    let top = 0;
    let on = false;
    let raf = 0;

    const frame = () => {
      raf = 0;
      const list = cards();
      const span = vh - top;
      // Toutes les lectures d'abord, puis toutes les écritures : aucune mise
      // en page forcée pendant le défilement.
      const tops = list.map((card) => (on ? card.getBoundingClientRect().top : 0));
      let previousP = 0;
      for (let i = list.length - 1; i >= 0; i--) {
        const card = list[i];
        const p = on && i + 1 < list.length ? Math.min(1, Math.max(0, (vh - tops[i + 1]) / span)) : 0;
        const value = p.toFixed(4);
        if (card.style.getPropertyValue("--p") !== value) card.style.setProperty("--p", value);
        const covered = p <= 0 ? undefined : p >= 1 && previousP >= 1 ? "buried" : p >= 1 ? "full" : "partial";
        if (card.dataset.covered !== covered) {
          if (covered === undefined) delete card.dataset.covered;
          else card.dataset.covered = covered;
        }
        previousP = p;
      }
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };

    const measure = () => {
      vh = window.innerHeight;
      top = offset();
      on = !reduce.matches && vh >= (coarse.matches ? TOUCH_MIN_HEIGHT : POINTER_MIN_HEIGHT);
      root.dataset.deck = on ? "on" : "off";
      for (const card of cards()) {
        const h = card.offsetHeight;
        const pin = top + Math.min(0, vh - top - h);
        card.style.setProperty("--pin", `${pin}px`);
        card.style.setProperty("--clip", `${top - pin}px`);
        card.style.setProperty("--oy", `${(top + vh) / 2 - pin}px`);
      }
      schedule();
    };

    const ro = new ResizeObserver(measure);
    for (const card of cards()) ro.observe(card);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", schedule, { passive: true });
    reduce.addEventListener("change", measure);
    coarse.addEventListener("change", measure);
    measure();

    // Clavier : un élément focalisé ne reste jamais sous une carte. Le
    // `scrollIntoView` natif ne le découvre pas (il est « dans » l'écran,
    // seulement recouvert) : on remonte de la hauteur du recouvrement.
    const onFocusIn = (event: FocusEvent) => {
      if (!on || !(event.target instanceof Element)) return;
      let own: Element | null = event.target;
      while (own && own.parentElement !== root) own = own.parentElement;
      if (!own) return;
      const rect = event.target.getBoundingClientRect();
      let overlap = 0;
      for (let next = own.nextElementSibling; next; next = next.nextElementSibling) {
        overlap = Math.max(overlap, rect.bottom - next.getBoundingClientRect().top);
      }
      if (overlap > 0) window.scrollBy({ left: 0, top: -(overlap + FOCUS_MARGIN), behavior: "instant" });
    };
    root.addEventListener("focusin", onFocusIn);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", schedule);
      reduce.removeEventListener("change", measure);
      coarse.removeEventListener("change", measure);
      root.removeEventListener("focusin", onFocusIn);
    };
  }, []);

  return (
    <div ref={ref} className={styles.deck} data-memorial-cards="" data-deck="off">
      {children}
    </div>
  );
}
