"use client";

import { useEffect, useState, type RefObject } from "react";
import { createCaptionMeasurer, type MeasurerReady } from "@/lib/memorial/gallery/caption-measurer";

/**
 * Resolves the V2.1 caption measurer once La Belle Aurore is confirmed
 * loaded, from the first `[data-caption-probe]` under `root`. Null until
 * then — captions are never laid out with an unconfirmed font.
 */
export function useCaptionMeasurer(root: RefObject<HTMLElement | null>): MeasurerReady | null {
  const [font, setFont] = useState<MeasurerReady | null>(null);
  useEffect(() => {
    const probe = root.current?.querySelector<HTMLElement>("[data-caption-probe]");
    if (!probe) return;
    let alive = true;
    void createCaptionMeasurer(probe).then((ready) => {
      if (alive) setFont(ready);
    });
    return () => {
      alive = false;
    };
  }, [root]);
  return font;
}
