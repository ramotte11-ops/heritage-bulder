// A15-R — recette locale isolée (Supabase LOCAL jetable uniquement ; refuse toute autre base).
// Node (CommonJS) ; Playwright préinstallé. Variables : REPO, DB_URL, API_URL, SERVICE_ROLE_KEY, LOT3_PW, PHOTO.
// Serveur : `next start -p 3100` de la branche de recette, .env.local vers la pile locale,
// CONTRIBUTIONS_RECETTE_SLUGS=a1b2c3d4e5f6,b6e5d4c3b2a1 (c0ffee000001 reste hors liste).
/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const sharp = require(process.env.REPO + '/node_modules/sharp');
const BASE = 'http://localhost:3100';
const DBURL = process.env.DB_URL; const API = process.env.API_URL; const SRK = process.env.SERVICE_ROLE_KEY;
if (!/127\.0\.0\.1/.test(DBURL) || !/127\.0\.0\.1/.test(API)) throw new Error('refusing: not local');
const sql = (q) => execFileSync('psql', [DBURL, '-t', '-A', '-X', '-c', q]).toString().trim();
const results = []; const check = (n, ok, d = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); };
const PHOTO = process.env.PHOTO;
const mem = (slug) => sql(`select id from memorials where slug='${slug}'`);
const msg = (m, author) => sql(`select id || '|' || status from messages where memorial_id='${m}' and author_name='${author}' order by created_at desc limit 1`);
async function storageStatus(path) { const r = await fetch(`${API}/storage/v1/object/memorial-media/${path}`, { headers: { Authorization: `Bearer ${SRK}`, apikey: SRK } }); return { status: r.status, buf: r.ok ? Buffer.from(await r.arrayBuffer()) : null }; }
async function settle(p) { await p.waitForLoadState('networkidle'); await p.waitForTimeout(400); }

async function deposit(page, slug, kind, author, text) {
  await page.goto(`${BASE}/hommage/${slug}`); await settle(page);
  await page.getByRole('button', { name: /Laisser un message/i }).first().click();
  const dlg = page.getByRole('dialog');
  const label = { condolence: /^Condoléances/, story: /^Récit ou anecdote/, photo: /^Photographie/ }[kind];
  await dlg.locator('[data-choice]').filter({ hasText: label }).click();
  await dlg.getByLabel('Votre nom').fill(author);
  if (kind === 'condolence') await dlg.getByLabel('Votre message').fill(text);
  if (kind === 'story') await dlg.getByLabel('Votre récit').fill(text);
  if (kind === 'photo') { await dlg.locator('input[type=file]').setInputFiles(PHOTO); await dlg.getByLabel(/Légende/).fill(text); }
  const status = await dlg.innerText();
  await page.waitForTimeout(3600); // jeton anti-robots : au moins 3 s
  await dlg.getByRole('button', { name: /^Envoyer$/ }).click();
  await dlg.locator('[role=status]').filter({ hasText: /Merci|patience|abouti|ne reçoit/ }).first().waitFor({ timeout: 60000 });
  const result = (await dlg.locator('[role=status]').filter({ hasText: /Merci|patience|abouti|ne reçoit/ }).first().innerText()).trim();
  return { result, privacyShown: status.includes('Proposition de texte — non validée juridiquement') && status.includes('contact@herelys.com') };
}
async function visible(page, slug, needle) { await page.goto(`${BASE}/hommage/${slug}`); await settle(page); return (await page.content()).includes(needle); }
async function login(b, email) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const page = await ctx.newPage();
  await page.goto(`${BASE}/login`); await page.getByRole('tab', { name: /déjà un compte/i }).click().catch(() => {});
  await page.locator('input[name=email]').fill(email); await page.locator('input[name=password]').fill(process.env.LOT3_PW);
  await Promise.all([page.waitForURL(/\/owner/, { timeout: 60000 }), page.locator('form button[type=submit]').last().click()]);
  return { ctx, page };
}
const modPath = (m, vue) => `${BASE}/owner/hommages/${m}/contributions${vue ? '?vue=' + vue : ''}`;
async function act(page, m, vue, id, action, confirm) {
  await page.goto(modPath(m, vue)); await settle(page);
  if (action === 'delete') await page.locator(`[data-contribution-delete="${id}"]`).click();
  else await page.locator(`[data-contribution-id="${id}"] [data-contribution-action=${action}]`).click();
  if (confirm) await page.locator(`[data-confirm-yes="${id}"]`).click();
  await page.waitForTimeout(1200);
}

async function scenario(b, offer, slug, family) {
  const M = mem(slug); const tag = `[${offer}]`;
  const visitor = await b.newContext({ viewport: { width: 1440, height: 900 } }); const v = await visitor.newPage();
  // 1. Condoléance immédiate
  const c = await deposit(v, slug, 'condolence', `Visiteur fictif ${offer} C`, 'Message de condoléances fictif de recette.');
  check(`${tag} 1 condoléance : « désormais visible »`, /désormais visible/.test(c.result), c.result);
  check(`${tag} 1 mention Q6 « non validée » et contact affichés dans la lettre`, c.privacyShown);
  const [cId, cSt] = msg(M, `Visiteur fictif ${offer} C`).split('|');
  check(`${tag} 1 condoléance : status = published en base`, cSt === 'published', cSt);
  check(`${tag} 1 condoléance visible sur la page publique`, await visible(v, slug, `Visiteur fictif ${offer} C`));
  // 2. Récit en attente
  const s = await deposit(v, slug, 'story', `Visiteur fictif ${offer} R`, 'Récit fictif de recette, soumis à la famille.');
  check(`${tag} 2 récit : « dès que la famille l'aura validé »`, /famille l.aura validé/.test(s.result), s.result);
  const [sId, sSt] = msg(M, `Visiteur fictif ${offer} R`).split('|');
  check(`${tag} 2 récit : status = pending, absent de la page`, sSt === 'pending' && !(await visible(v, slug, `Visiteur fictif ${offer} R`)), sSt);
  // 3. Photo en attente, traitée
  const p = await deposit(v, slug, 'photo', `Visiteur fictif ${offer} P`, 'Légende fictive');
  check(`${tag} 3 photo : en attente`, /famille l.aura validé/.test(p.result), p.result);
  const [pId, pSt] = msg(M, `Visiteur fictif ${offer} P`).split('|');
  const [path, mst, mime] = sql(`select md.storage_path||'|'||md.status||'|'||md.mime_type from messages m join media md on md.id=m.media_id where m.id='${pId}'`).split('|');
  const stored = await storageStatus(path); const meta = stored.buf ? await sharp(stored.buf).metadata() : {};
  check(`${tag} 3 photo : pending, média ready, WebP ≤ 2000 px, sans EXIF/GPS`, pSt === 'pending' && mst === 'ready' && mime === 'image/webp' && meta.format === 'webp' && Math.max(meta.width, meta.height) <= 2000 && !meta.exif, `${pSt} ${mst} ${mime} ${meta.format} ${meta.width}x${meta.height} exif=${meta.exif ? 'OUI' : 'non'}`);
  check(`${tag} 3 photo absente de la page publique avant validation`, !(await visible(v, slug, `Visiteur fictif ${offer} P`)));
  // 4. Modération et publication
  const { ctx: fctx, page: f } = await login(b, family);
  await act(f, M, null, sId, 'approve'); await act(f, M, null, pId, 'approve');
  check(`${tag} 4 approbation : récit et photo published en base`, sql(`select string_agg(status, ',' order by status) from messages where id in ('${sId}','${pId}')`) === 'published,published');
  check(`${tag} 4 récit et photo visibles par le visiteur`, (await visible(v, slug, `Visiteur fictif ${offer} R`)) && (await visible(v, slug, `Visiteur fictif ${offer} P`)));
  // 5. Masquage / réaffichage / refus / suppression
  const pubAt = sql(`select published_at from messages where id='${cId}'`);
  await act(f, M, 'published', cId, 'hide');
  check(`${tag} 5 masquage : hidden, disparaît de la page`, sql(`select status from messages where id='${cId}'`) === 'hidden' && !(await visible(v, slug, `Visiteur fictif ${offer} C`)));
  await act(f, M, 'hidden', cId, 'unhide');
  check(`${tag} 5 réaffichage : revient, published_at inchangé`, sql(`select status from messages where id='${cId}'`) === 'published' && sql(`select published_at from messages where id='${cId}'`) === pubAt && (await visible(v, slug, `Visiteur fictif ${offer} C`)));
  await deposit(v, slug, 'story', `Visiteur fictif ${offer} X`, 'Second récit fictif, à refuser.');
  const [xId] = msg(M, `Visiteur fictif ${offer} X`).split('|');
  await act(f, M, null, xId, 'reject', true);
  check(`${tag} 5 refus (avec confirmation) : rejected, jamais public`, sql(`select status from messages where id='${xId}'`) === 'rejected' && !(await visible(v, slug, `Visiteur fictif ${offer} X`)));
  await act(f, M, 'published', pId, 'delete', true);
  const gone = await storageStatus(path);
  check(`${tag} 5 suppression photo : message supprimé, octets absents du bucket, absente de la page`, sql(`select count(*) from messages where id='${pId}'`) === '0' && gone.status !== 200 && !(await visible(v, slug, `Visiteur fictif ${offer} P`)), `storage ${gone.status}`);
  await visitor.close();
  return { fctx, f, M };
}

(async () => {
  const b = await chromium.launch();
  // Barrière A15-R : hommage hors de la liste de recette
  const o = await (await b.newContext()).newPage();
  await o.goto(`${BASE}/hommage/c0ffee000001`); await settle(o);
  check('[hors liste] rubrique absente et aucun « Laisser un message »', (await o.getByRole('button', { name: /Laisser un message/i }).count()) === 0);
  const A = await scenario(b, 'complete', 'a1b2c3d4e5f6', 'famille.martin@example.test');
  const B = await scenario(b, 'gratuite', 'b6e5d4c3b2a1', 'famille.durand@example.test');
  // 6. Droits entre familles. Le 404 est rendu en flux (app/owner/loading.tsx) : on juge le CONTENU.
  for (const [who, page, other, foreign] of [['A', A.f, B.M, 'Visiteur fictif gratuite'], ['B', B.f, A.M, 'Visiteur fictif complete']]) {
    for (const vue of [null, 'published', 'hidden', 'rejected']) {
      await page.goto(modPath(other, vue)); await settle(page);
      const html = await page.content();
      check(`6 famille ${who} → modération de l'autre famille (${vue || 'pending'}) : page introuvable, aucune donnée`,
        html.includes('This page could not be found') && !html.includes(foreign) && (await page.locator('[data-contribution-id]').count()) === 0);
    }
  }
  const anon = await (await b.newContext()).newPage();
  await anon.goto(modPath(A.M)); await anon.waitForURL(/\/login/, { timeout: 15000 }).catch(() => {});
  check('6 visiteur non connecté → /login, aucune donnée', /\/login/.test(anon.url()) && !(await anon.content()).includes('Visiteur fictif'));
  await b.close();
  console.log(results.join('\n'));
  console.log(`\n${results.filter((r) => r.startsWith('PASS')).length} / ${results.length} PASS`);
})().catch((e) => { console.log(results.join('\n')); console.error(e); process.exit(1); });
