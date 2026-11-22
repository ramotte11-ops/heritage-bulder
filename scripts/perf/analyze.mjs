#!/usr/bin/env node
// Mission 04-G / L1.4 — rapproche le journal du faux Supabase et les durées
// navigateur : pour chaque action, nombre d'appels Supabase, profondeur
// séquentielle (plus longue chaîne d'appels qui attendent chacun le
// précédent) et durée.
//
// Usage : node scripts/perf/analyze.mjs <journal.jsonl> <résultat.json> [--details]

import fs from "node:fs";

/** Longest chain of calls each starting after the previous one ended. */
export function sequentialDepth(calls) {
  const sorted = [...calls].sort((a, b) => a.t1 - b.t1);
  const best = new Map();
  let depth = 0;
  for (const call of sorted) {
    let chain = 1;
    for (const previous of sorted) {
      if (previous === call) break;
      if (previous.t1 <= call.t0 + 1) chain = Math.max(chain, (best.get(previous) ?? 1) + 1);
    }
    best.set(call, chain);
    depth = Math.max(depth, chain);
  }
  return depth;
}

export function groupByAction(lines) {
  const groups = new Map();
  let current = null;
  for (const entry of lines) {
    if (entry.mark?.startsWith("BEGIN ")) {
      current = { id: entry.mark.slice(6), start: entry.t, calls: [] };
      groups.set(current.id, current);
    } else if (entry.mark?.startsWith("END ")) {
      if (current) current.end = entry.t;
      current = null;
    } else if (current && !entry.mark) {
      current.calls.push(entry);
    }
  }
  return groups;
}

function main() {
  const [logPath, resultPath, flag] = process.argv.slice(2);
  const lines = fs
    .readFileSync(logPath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const result = JSON.parse(fs.readFileSync(resultPath, "utf8"));
  const groups = groupByAction(lines);
  const rows = result.results.map((r) => {
    const group = groups.get(r.id) ?? { calls: [] };
    const byPath = {};
    for (const call of group.calls) {
      const key = `${call.method} ${call.path.replace(/\?select=.*/, "")}`;
      byPath[key] = (byPath[key] ?? 0) + 1;
    }
    return {
      ...r,
      calls: group.calls.length,
      depth: sequentialDepth(group.calls),
      connections: new Set(group.calls.map((c) => c.port)).size,
      byPath,
      timeline: flag === "--details"
        ? group.calls.map((c) => ({ at: c.t0 - group.start, method: c.method, path: c.path, concurrent: c.concurrent }))
        : undefined,
    };
  });
  const analysed = { latencyMs: result.latencyMs, rows };
  fs.writeFileSync(resultPath.replace(/\.json$/, ".analysed.json"), JSON.stringify(analysed, null, 2));
  console.log(`\nLatence simulée par appel : ${result.latencyMs} ms`);
  console.log("| Action | Appels Supabase | Profondeur séquentielle | Durée navigateur |");
  console.log("|---|---|---|---|");
  for (const row of rows) console.log(`| ${row.label} | ${row.calls} | ${row.depth} | ${row.browserMs} ms |`);
  if (flag === "--details") {
    for (const row of rows) {
      console.log(`\n## ${row.label}`);
      for (const t of row.timeline) console.log(`  +${String(t.at).padStart(5)} ms  ${t.method} ${t.path} (en vol : ${t.concurrent})`);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
