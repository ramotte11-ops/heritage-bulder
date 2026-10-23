"use client";

import { useState } from "react";
import type { MediaPurpose } from "@/config/media";
import {
  createBrowserPhotoPreparationEnv,
  preparePhotoForUpload,
  type PhotoPreparationEnv,
  type PhotoPreparationResult,
} from "@/lib/media/photo-preparation";

interface Row {
  name: string;
  purpose: MediaPurpose;
  result: PhotoPreparationResult;
  url: string | null;
}

/**
 * Banc d'essai : `?nowebp=1` simule un navigateur sans encodeur WebP
 * (Safari) ; `?nobitmap=1` force le repli sans décodage redimensionné.
 */
export function PhotoPreparationPilot() {
  const [purpose, setPurpose] = useState<MediaPurpose>("gallery");
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);

  async function run(files: File[]) {
    setBusy(true);
    const params = new URLSearchParams(window.location.search);
    const base = createBrowserPhotoPreparationEnv({ bitmapDecode: params.get("nobitmap") !== "1" });
    const env: PhotoPreparationEnv = params.get("nowebp") === "1" ? { ...base, canEncodeWebp: async () => false } : base;
    const next: Row[] = [];
    for (const file of files) {
      const result = await preparePhotoForUpload(file, purpose, env);
      next.push({ name: file.name, purpose, result, url: result.ok ? URL.createObjectURL(result.file) : null });
    }
    setRows((current) => [...current, ...next]);
    setBusy(false);
  }

  return (
    <main style={{ padding: 16, fontFamily: "system-ui, sans-serif", fontSize: 14 }}>
      <p data-pilot-banner style={{ fontWeight: 600 }}>Banc d’essai — préparation des photos dans le navigateur. Rien n’est envoyé.</p>
      <label>
        Profil{" "}
        <select data-pilot-purpose value={purpose} onChange={(e) => setPurpose(e.target.value as MediaPurpose)}>
          <option value="gallery">Galerie (1600 px)</option>
          <option value="hero">Hero (2400 px)</option>
        </select>
      </label>{" "}
      <input
        data-pilot-input
        type="file"
        multiple
        accept="image/*"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          void run(files);
        }}
      />
      <output data-pilot-busy={busy ? "1" : "0"} />
      <ol data-pilot-results>
        {rows.map((row, i) => (
          <li key={i} data-pilot-row={row.name} data-ok={row.result.ok ? "1" : "0"} data-report={JSON.stringify(row.result.ok ? row.result.report : row.result)}>
            <strong>{row.name}</strong> — {row.purpose} —{" "}
            {row.result.ok
              ? `${Math.round(row.result.report.inputBytes / 1024)} Ko → ${Math.round(row.result.report.outputBytes / 1024)} Ko, ${row.result.report.width}×${row.result.report.height}, ${row.result.report.type}, q${row.result.report.quality}, ${row.result.report.durationMs} ms`
              : `refusé : ${row.result.code}`}
            {row.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img data-pilot-output src={row.url} alt="" style={{ display: "block", maxWidth: 320, marginTop: 4 }} />
            ) : null}
          </li>
        ))}
      </ol>
    </main>
  );
}
