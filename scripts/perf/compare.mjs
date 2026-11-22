#!/usr/bin/env node
// Mission 04-G / L1.4 — compare deux campagnes du banc (avant / après).
// Usage : node scripts/perf/compare.mjs <libellé_avant> <libellé_après>

import fs from "node:fs";
import path from "node:path";

const [before, after] = process.argv.slice(2);
if (!before || !after) {
  console.error("Usage : node scripts/perf/compare.mjs <libellé_avant> <libellé_après>");
  process.exit(2);
}
const dir = (label) => path.join(import.meta.dirname, ".out", label);
const read = (label, latency) => {
  const file = path.join(dir(label), `run-${latency}.analysed.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
};
const sha = (label) => fs.readFileSync(path.join(dir(label), "sha.txt"), "utf8").trim().slice(0, 7);

console.log(`Avant : ${before} (${sha(before)}) — Après : ${after} (${sha(after)}) — faux Supabase local, latence simulée\n`);
for (const latency of [0, 100, 300]) {
  const a = read(before, latency);
  const b = read(after, latency);
  if (!a || !b) continue;
  console.log(`### ${latency} ms par appel`);
  console.log("| Action | Appels avant → après | Profondeur avant → après | Durée avant → après | Écart |");
  console.log("|---|---|---|---|---|");
  for (const rowA of a.rows) {
    const rowB = b.rows.find((r) => r.id === rowA.id);
    if (!rowB) continue;
    const delta = rowB.browserMs - rowA.browserMs;
    console.log(
      `| ${rowA.label} | ${rowA.calls} → ${rowB.calls} | ${rowA.depth} → ${rowB.depth} | ${rowA.browserMs} → ${rowB.browserMs} ms | ${delta > 0 ? "+" : ""}${delta} ms |`,
    );
  }
  console.log();
}
