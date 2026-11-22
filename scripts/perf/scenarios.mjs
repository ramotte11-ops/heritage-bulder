#!/usr/bin/env node
// Mission 04-G / L1.4 — joue le parcours famille dans Chromium contre le
// build de production local branché sur le faux Supabase, et mesure
// chaque action. La latence simulée ne s'applique qu'aux actions mesurées
// (les étapes de mise en place tournent à 0 ms).
//
// Usage : node scripts/perf/scenarios.mjs <latence_ms> <résultat.json>
// Prérequis : Playwright et Chromium disponibles (voir README.md).

import { createRequire } from "node:module";
import fs from "node:fs";
import { APP_URL, IDS, STUB_URL, sessionCookie } from "./bench-constants.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const [latencyArg, outPath] = process.argv.slice(2);
const LATENCY = Number(latencyArg ?? 0);
const BUILDER = `${APP_URL}/builder/${IDS.memorial}`;

const stub = (path) => fetch(`${STUB_URL}${path}`).then((r) => r.text());
const setLatency = (ms) => stub(`/__latency?ms=${ms}`);
const mark = (label) => stub(`/__mark?label=${encodeURIComponent(label)}`);

const h1 = (page) => page.evaluate(() => document.querySelector("h1")?.textContent ?? "");
const h1Changes = (page, before) =>
  page.waitForFunction((b) => document.querySelector("h1")?.textContent !== b, before, { timeout: 60_000 });

async function measure(results, id, label, action) {
  await setLatency(LATENCY);
  await mark(`BEGIN ${id}`);
  const t0 = Date.now();
  await action();
  const ms = Date.now() - t0;
  await mark(`END ${id}`);
  await setLatency(0);
  results.push({ id, label, browserMs: ms });
}

async function freshPage(browser) {
  await stub("/__reset");
  await setLatency(0);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addCookies([sessionCookie()]);
  const page = await context.newPage();
  await page.goto(BUILDER, { waitUntil: "networkidle" });
  return { context, page };
}

const browser = await chromium.launch();
const results = [];
try {
  // Séquence 1 — chargement, Continuer, Revoir, Reprendre.
  {
    const { context, page } = await freshPage(browser);
    await measure(results, "builder_load", "Chargement complet /builder (document)", async () => {
      await page.goto(BUILDER, { waitUntil: "load" });
    });
    await page.waitForLoadState("networkidle");
    let before = await h1(page);
    await page.locator("input[type=radio]").first().waitFor({ state: "attached" });
    await page.locator("input[type=radio]").first().check({ force: true });
    await measure(results, "continuer", "Continuer (A04 → A05, sans saisie récente)", async () => {
      await page.getByRole("button", { name: "Continuer", exact: true }).click();
      await h1Changes(page, before);
    });
    before = await h1(page);
    await page.getByRole("button", { name: "Mon parcours", exact: true }).click();
    await page.getByRole("button", { name: /^Votre proche/ }).click();
    await measure(results, "revoir", "Revoir « Nom et dates » depuis Mon parcours", async () => {
      await page.getByRole("button", { name: "Revoir — Nom et dates" }).click();
      await page.waitForFunction(
        (b) => document.querySelector("h1")?.textContent !== b && !document.querySelector("[role=dialog]"),
        before,
        { timeout: 60_000 },
      );
    });
    before = await h1(page);
    await measure(results, "reprendre", "Reprendre où j'en étais", async () => {
      await page.getByRole("button", { name: "Reprendre où j'en étais" }).first().click();
      await h1Changes(page, before);
    });
    await context.close();
  }

  // Séquence 2 — saisie puis Continuer immédiatement (autosave en attente).
  {
    const { context, page } = await freshPage(browser);
    let before = await h1(page);
    await page.locator("input[type=radio]").first().check({ force: true });
    await page.getByRole("button", { name: "Continuer", exact: true }).click();
    await h1Changes(page, before);
    before = await h1(page);
    await page.getByRole("button", { name: "Passer cette étape" }).click();
    await h1Changes(page, before);
    before = await h1(page);
    await page.locator("#ceremony-venue").fill("Église Saint-Martin");
    await measure(results, "saisie_continuer", "Saisie puis Continuer immédiat (A06, autosave en attente)", async () => {
      await page.getByRole("button", { name: "Continuer", exact: true }).click();
      await h1Changes(page, before);
    });
    await context.close();
  }

  // Séquence 3 — espace familial (/owner), rendu du document.
  {
    const { context, page } = await freshPage(browser);
    await page.goto(`${APP_URL}/owner`, { waitUntil: "networkidle" });
    await measure(results, "owner", "Espace familial /owner (document)", async () => {
      await page.goto(`${APP_URL}/owner`, { waitUntil: "domcontentloaded" });
    });
    await context.close();
  }
} finally {
  await browser.close();
}

fs.writeFileSync(outPath, JSON.stringify({ latencyMs: LATENCY, results }, null, 2));
console.log(`latence ${LATENCY} ms :`, results.map((r) => `${r.id}=${r.browserMs} ms`).join(", "));
