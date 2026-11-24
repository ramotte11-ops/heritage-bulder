"use client";

import { useState, type ChangeEvent } from "react";
import type { Language } from "@/config/languages";
import type { SkinVariant } from "@/config/skins";
import { VideoHommageV1 } from "@/components/memorial/video/VideoHommageV1";
import { useLocalVideoCollection, type LocalVideoAddResult } from "@/components/memorial/video/use-local-video-collection";
import {
  formatVideoDuration,
  videoHommageBudget,
  VIDEO_HOMMAGE_MAX_TITLE_LENGTH,
  type VideoHommageItem,
  type VideoHommageStatus,
} from "@/lib/memorial/video/video-hommage";

/**
 * VID-05A — commandes du banc d'essai. Le panneau sert seulement à piloter
 * la rubrique ; il ne préfigure pas l'interface du futur Builder.
 */
const EXAMPLE_TITLES = ["Son dernier anniversaire", null, "Les vacances en famille"] as const;
const EXAMPLE_DURATIONS = [268, 131, 201] as const;

function examples(count: number, status: VideoHommageStatus): VideoHommageItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `exemple-${index + 1}`,
    title: EXAMPLE_TITLES[index] ?? null,
    durationSeconds: EXAMPLE_DURATIONS[index] ?? null,
    status,
  }));
}

function refusal(result: LocalVideoAddResult): string | null {
  if (result.ok) return null;
  switch (result.reason) {
    case "not-a-video":
      return "Ce fichier n'est pas une vidéo.";
    case "unreadable":
      return "Cet appareil ne peut pas lire cette vidéo pour l'aperçu.";
    case "duration-unknown":
      return "La durée de cette vidéo n'a pas pu être lue.";
    case "too-many-videos":
      return "Trois vidéos au maximum.";
    case "too-long":
      return `Cette vidéo dure ${formatVideoDuration(result.durationSeconds)}. Il reste ${formatVideoDuration(result.remainingSeconds)}.`;
  }
}

export function VideoPilot({
  initial,
}: {
  initial: { variant: SkinVariant; language: Language; width: number | null; count: number; state: VideoHommageStatus };
}) {
  const [variant, setVariant] = useState(initial.variant);
  const [width, setWidth] = useState<number | null>(initial.width);
  const collection = useLocalVideoCollection(examples(initial.count, initial.state));
  const [message, setMessage] = useState<string | null>(null);
  const budget = videoHommageBudget(collection.items);

  const onAdd = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file === undefined) return;
    setMessage(refusal(await collection.add(file)));
  };

  const onReplace = (id: string) => async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file === undefined) return;
    setMessage(refusal(await collection.replace(id, file)));
  };

  return (
    <main style={{ background: variant === "dark" ? "#1d140c" : "#efe6d8", minHeight: "100dvh", paddingBottom: 48 }}>
      <div
        data-pilot-panel=""
        style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", padding: 12, font: "14px system-ui", color: variant === "dark" ? "#f4e6cd" : "#2f2a1c" }}
      >
        <label>
          Variante{" "}
          <select value={variant} onChange={(event) => setVariant(event.target.value as SkinVariant)}>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <label>
          Largeur{" "}
          <select value={width ?? ""} onChange={(event) => setWidth(event.target.value === "" ? null : Number(event.target.value))}>
            <option value="">écran</option>
            <option value="360">360</option>
            <option value="390">390</option>
            <option value="768">768</option>
            <option value="1024">1024</option>
            <option value="1440">1440</option>
          </select>
        </label>
        <label>
          Ajouter une vidéo de l&apos;appareil{" "}
          <input type="file" accept="video/*" onChange={onAdd} disabled={!budget.canAddAnother} data-pilot-add="" />
        </label>
        <span data-pilot-budget="">
          {budget.count} / 3 vidéos · temps restant {formatVideoDuration(budget.remainingSeconds)}
        </span>
        {message !== null && (
          <strong role="alert" data-pilot-message="">
            {message}
          </strong>
        )}
      </div>

      <ol data-pilot-items="" style={{ margin: "0 12px 12px", padding: 0, listStyle: "none", font: "14px system-ui", color: variant === "dark" ? "#f4e6cd" : "#2f2a1c" }}>
        {collection.items.map((item, index) => (
          <li key={item.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
            <span>{index + 1}.</span>
            <input
              aria-label={`Titre de la vidéo ${index + 1}`}
              placeholder={`Ex. : À la plage (vide = Souvenir ${index + 1})`}
              value={item.title ?? ""}
              maxLength={VIDEO_HOMMAGE_MAX_TITLE_LENGTH * 2}
              onChange={(event) => collection.setTitle(item.id, event.target.value)}
              style={{ width: 280 }}
            />
            <span>{formatVideoDuration(item.durationSeconds) ?? "—"}</span>
            <button type="button" disabled={index === 0} onClick={() => collection.move(index, index - 1)}>
              Monter
            </button>
            <button type="button" disabled={index === collection.items.length - 1} onClick={() => collection.move(index, index + 1)}>
              Descendre
            </button>
            <label>
              Remplacer <input type="file" accept="video/*" onChange={onReplace(item.id)} />
            </label>
            <button type="button" onClick={() => collection.remove(item.id)}>
              Retirer
            </button>
          </li>
        ))}
      </ol>

      <div style={{ width: width !== null ? `${width}px` : "100%", marginInline: "auto" }} data-pilot-stage="">
        <VideoHommageV1 items={collection.items} skinVariant={variant} language={initial.language} headingLevel="page" />
      </div>
    </main>
  );
}
