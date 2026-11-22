#!/usr/bin/env node
// Mission 04-G / L1.4 — faux Supabase LOCAL pour le banc de mesure.
//
// Répond aux appels que l'application fait à Supabase (Auth, PostgREST,
// RPC, Storage) avec des données de test fixes, après un délai réglable,
// et journalise chaque appel (début, fin, nombre d'appels en vol,
// connexion) dans un fichier JSONL. Ne se connecte à rien : aucune donnée
// réelle, aucun secret. Diagnostic local uniquement — jamais déployé.
//
// Points de contrôle (hors API Supabase) :
//   GET /__latency?ms=N   délai appliqué aux appels suivants
//   GET /__mark?label=X   écrit un repère dans le journal
//   GET /__reset          remet le brouillon de test dans son état initial
//
// Usage : node scripts/perf/supabase-stub.mjs <fixture.json> <journal.jsonl> [port]

import http from "node:http";
import fs from "node:fs";
import { IDS } from "./bench-constants.mjs";

const [fixturePath, logPath, portArg] = process.argv.slice(2);
if (!fixturePath || !logPath) {
  console.error("Usage : node scripts/perf/supabase-stub.mjs <fixture.json> <journal.jsonl> [port]");
  process.exit(2);
}
const PORT = Number(portArg ?? 54399);
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

const NOW = "2026-11-22T06:00:00.000Z";

let latency = 0;
let revision = 7;
let content = structuredClone(fixture.content);

function reset() {
  revision = 7;
  content = structuredClone(fixture.content);
}

const ROWS = {
  owners: () => ({ id: IDS.owner, auth_user_id: IDS.user, email: "famille@example.test", created_at: NOW, updated_at: NOW }),
  memorials: () => ({
    id: IDS.memorial,
    owner_id: IDS.owner,
    entitlement_id: IDS.entitlement,
    memorial_type: "person",
    editorial_context: "announcement",
    skin_id: "intemporel",
    skin_variant: "light",
    language: "fr",
    enabled_sections: ["story"],
    status: "draft",
    slug: null,
    first_published_at: null,
    created_at: NOW,
    updated_at: NOW,
  }),
  memorial_drafts: () => ({ memorial_id: IDS.memorial, content, updated_at: NOW, revision }),
  media: () => ({
    id: fixture.heroMediaId,
    memorial_id: IDS.memorial,
    owner_id: IDS.owner,
    storage_path: `bench/${fixture.heroMediaId}.jpg`,
    media_type: "image",
    purpose: "hero",
    status: "ready",
    mime_type: "image/jpeg",
    original_filename: "bench.jpg",
    size_bytes: 1000,
    width: 1600,
    height: 2000,
    created_at: NOW,
    updated_at: NOW,
  }),
};

function respond(method, path, accept, body) {
  if (path === "/auth/v1/user") {
    return {
      status: 200,
      payload: {
        id: IDS.user,
        aud: "authenticated",
        role: "authenticated",
        email: "famille@example.test",
        app_metadata: { provider: "email" },
        user_metadata: {},
        created_at: NOW,
      },
    };
  }
  if (path.startsWith("/rest/v1/rpc/")) {
    const fn = path.slice("/rest/v1/rpc/".length);
    if (fn === "commit_memorial_draft_edit_v1") {
      try {
        content = JSON.parse(body).p_content ?? content;
      } catch {
        // keep the previous content
      }
      revision += 1;
      return { status: 200, payload: { updated_at: NOW, revision } };
    }
    return { status: 200, payload: null };
  }
  if (path.startsWith("/rest/v1/")) {
    const table = path.slice("/rest/v1/".length);
    const single = (accept ?? "").includes("vnd.pgrst.object");
    if (method === "PATCH" && table === "memorial_drafts") {
      try {
        content = JSON.parse(body).content ?? content;
      } catch {
        // keep the previous content
      }
      revision += 1;
    }
    const row = ROWS[table] ? ROWS[table]() : null;
    return { status: 200, payload: single ? row : row ? [row] : [] };
  }
  if (path.startsWith("/storage/v1/object/sign")) {
    return { status: 200, payload: { signedURL: "/storage/v1/object/sign/bench?token=t" } };
  }
  return { status: 404, payload: { message: `faux Supabase : route inconnue ${path}` } };
}

let inflight = 0;
let seq = 0;
http
  .createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const url = new URL(req.url, "http://stub");
      if (url.pathname === "/__latency") {
        latency = Number(url.searchParams.get("ms") ?? 0);
        res.end("ok");
        return;
      }
      if (url.pathname === "/__mark") {
        fs.appendFileSync(logPath, JSON.stringify({ mark: url.searchParams.get("label"), t: Date.now() }) + "\n");
        res.end("ok");
        return;
      }
      if (url.pathname === "/__reset") {
        reset();
        res.end("ok");
        return;
      }
      const id = ++seq;
      const t0 = Date.now();
      inflight += 1;
      const concurrent = inflight;
      setTimeout(() => {
        const { status, payload } = respond(req.method, url.pathname, req.headers.accept, body);
        inflight -= 1;
        const select = url.searchParams.get("select");
        fs.appendFileSync(
          logPath,
          JSON.stringify({
            id,
            method: req.method,
            path: url.pathname + (select ? `?select=${select.slice(0, 40)}` : ""),
            t0,
            t1: Date.now(),
            concurrent,
            status,
            port: req.socket.remotePort,
          }) + "\n",
        );
        res.writeHead(status, { "content-type": "application/json", "content-range": "0-0/1" });
        res.end(JSON.stringify(payload));
      }, latency);
    });
  })
  .listen(PORT, "127.0.0.1", () => console.log(`faux Supabase prêt sur http://127.0.0.1:${PORT}`));
