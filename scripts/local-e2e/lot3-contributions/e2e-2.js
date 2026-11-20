// Node script (CommonJS, resolves the pre-installed Playwright through NODE_PATH).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { execFileSync } = require('child_process');
// Node script (CommonJS, resolves the pre-installed Playwright through NODE_PATH).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { chromium, BASE, login } = require('./e2e-lib.js');
const DBURL = process.env.DB_URL; const MA = process.env.MA; const MB = process.env.MB;
if (!/127\.0\.0\.1/.test(DBURL)) throw new Error('not local');
const sql = (q) => execFileSync('psql', [DBURL, '-t', '-A', '-X', '-c', q]).toString().trim();
const results = [];
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };
const pagePath = (m, vue) => `${BASE}/owner/hommages/${m}/contributions${vue ? '?vue=' + vue : ''}`;
async function settle(page) { await page.waitForLoadState('networkidle'); await page.waitForTimeout(300); }
async function statusText(page) { return (await page.locator('[data-contributions-view] [role=status]').first().innerText()).trim(); }

(async () => {
  const b = await chromium.launch();
  const { ctx, page } = await login(b, 'famille.martin@example.test', process.env.LOT3_PW);

  // 1. Pagination over identical timestamps: every pending item exactly once.
  await page.goto(pagePath(MA)); await settle(page);
  const first = await page.locator('[data-contribution-id]').count();
  // « plus anciennes » until the server's cursor says there is nothing left.
  while ((await page.locator('[data-contributions-more]').count()) > 0) {
    const before = await page.locator('[data-contribution-id]').count();
    await page.locator('[data-contributions-more]').click();
    await page.waitForFunction((n) => document.querySelectorAll('[data-contribution-id]').length > n || !document.querySelector('[data-contributions-more]'), before);
    await settle(page);
  }
  const ids = await page.$$eval('[data-contribution-id]', (els) => els.map((e) => e.getAttribute('data-contribution-id')));
  const dbIds = sql(`select id from messages where memorial_id='${MA}' and status='pending' order by id`).split('\n');
  check('pagination: page 1 = 20', first === 20, String(first));
  check('pagination: all pending seen once (22 share one timestamp)', ids.length === dbIds.length && new Set(ids).size === ids.length && [...ids].sort().join() === dbIds.join(), `${ids.length}/${dbIds.length}`);
  check('pagination: no more button at the end', (await page.locator('[data-contributions-more]').count()) === 0);

  // 2. Approve a story → published in DB, visible, count 25.
  const story = sql(`select id from messages where memorial_id='${MA}' and status='pending' and message_type='testimonial' order by created_at desc, id desc limit 1`);
  await page.locator(`[data-contribution-id="${story}"] [data-contribution-action=approve]`).click();
  await page.waitForSelector(`[data-contribution-id="${story}"]`, { state: 'detached' });
  check('approve: DB published+visible', sql(`select status||'|'||visible from messages where id='${story}'`) === 'published|true');
  const expectedBadge = sql(`select count(*) from messages where memorial_id='${MA}' and status='pending' and message_type in ('testimonial','photo')`);
  await page.waitForFunction((n) => document.querySelector('[data-pending-total]')?.getAttribute('data-pending-total') === n, expectedBadge);
  check('approve: live pending badge follows the DB', true, expectedBadge);
  check('approve: message', /publiée/.test(await statusText(page)));

  // 3. Reject another → rejected in DB, invisible.
  const story2 = sql(`select id from messages where memorial_id='${MA}' and status='pending' and message_type='testimonial' order by created_at desc, id desc limit 1`);
  await page.locator(`[data-contribution-id="${story2}"] [data-contribution-action=reject]`).click();
  check('reject: confirmation shown first, nothing sent yet', (await page.locator(`[data-confirm-reject="${story2}"]`).count()) === 1 && sql(`select status from messages where id='${story2}'`) === 'pending');
  await page.locator(`[data-confirm-cancel="${story2}"]`).click();
  check('reject: cancel keeps it pending', sql(`select status from messages where id='${story2}'`) === 'pending');
  await page.locator(`[data-contribution-id="${story2}"] [data-contribution-action=reject]`).click();
  await page.locator(`[data-confirm-yes="${story2}"]`).click();
  await page.waitForSelector(`[data-contribution-id="${story2}"]`, { state: 'detached' });
  check('reject: DB rejected, invisible', sql(`select status||'|'||visible from messages where id='${story2}'`) === 'rejected|false');

  // 4. Approve a photo, then in « Publiées »: hide a condolence (publicly gone), then « Masquées »: unhide (published_at kept).
  const photo = sql(`select id from messages where memorial_id='${MA}' and status='pending' and message_type='photo' order by created_at limit 1`);
  await page.locator(`[data-contribution-id="${photo}"] [data-contribution-action=approve]`).click();
  await page.waitForSelector(`[data-contribution-id="${photo}"]`, { state: 'detached' });
  const condo = sql(`select id from messages where memorial_id='${MA}' and message_type='condolence' order by created_at limit 1`);
  const pubAt = sql(`select published_at from messages where id='${condo}'`);
  await page.goto(pagePath(MA, 'published')); await settle(page);
  const publicBefore = sql(`select count(*) from read_public_contributions_v1('a1b2c3d4e5f6', 100, null, null) where contribution_id='${condo}'`);
  await page.locator(`[data-contribution-id="${condo}"] [data-contribution-action=hide]`).click();
  await page.waitForSelector(`[data-contribution-id="${condo}"]`, { state: 'detached' });
  const publicAfter = sql(`select count(*) from read_public_contributions_v1('a1b2c3d4e5f6', 100, null, null) where contribution_id='${condo}'`);
  check('hide: DB hidden, gone from the public read', sql(`select status from messages where id='${condo}'`) === 'hidden' && publicBefore === '1' && publicAfter === '0', `${publicBefore}->${publicAfter}`);
  await page.goto(pagePath(MA, 'hidden')); await settle(page);
  await page.locator(`[data-contribution-id="${condo}"] [data-contribution-action=unhide]`).click();
  await page.waitForSelector(`[data-contribution-id="${condo}"]`, { state: 'detached' });
  check('unhide: DB published, original published_at kept (P1)', sql(`select status from messages where id='${condo}'`) === 'published' && sql(`select published_at from messages where id='${condo}'`) === pubAt);

  // 5. memory_message read-only in « Publiées »; rejected shows no action.
  await page.goto(pagePath(MA, 'published')); await settle(page);
  while ((await page.locator('[data-contributions-more]').count()) > 0) { await page.locator('[data-contributions-more]').click(); await settle(page); }
  const mem = await page.locator('[data-type=memory_message]').first();
  check('memory_message: listed, no action', (await mem.count()) === 1 && (await mem.locator('button').count()) === 0);
  await page.goto(pagePath(MA, 'rejected')); await settle(page);
  check('rejected: listed, no action, no re-approval', (await page.locator(`[data-contribution-id="${story2}"]`).count()) === 1 && (await page.locator(`[data-contribution-id="${story2}"] button`).count()) === 0);

  // 6. Photo URL renewal: break the signed URL, the screen re-reads once and loads a fresh one.
  await page.goto(pagePath(MA, 'published')); await settle(page);
  const img = page.locator(`[data-contribution-id="${photo}"] img`);
  const oldSrc = await img.getAttribute('src');
  await img.evaluate((el) => { el.src = el.src.replace(/token=[^&]+/, 'token=expired'); });
  await page.waitForFunction((id) => { const i = document.querySelector(`[data-contribution-id="${id}"] img`); return i && /token=(?!expired)/.test(i.src) && i.complete && i.naturalWidth > 0; }, photo, { timeout: 15000 });
  check('photo: expired URL renewed by a fresh read, image loads', (await img.getAttribute('src')) !== oldSrc);

  // 7. Delete with confirmation (the published photo) → row gone, storage object gone, media retired.
  const mediaPath = sql(`select storage_path from media where id=(select media_id from messages where id='${photo}')`);
  await page.locator(`[data-contribution-delete="${photo}"]`).click();
  check('delete: confirmation shown, nothing deleted yet', (await page.locator(`[data-confirm-delete="${photo}"]`).count()) === 1 && sql(`select count(*) from messages where id='${photo}'`) === '1');
  await page.locator(`[data-confirm-cancel="${photo}"]`).click();
  check('delete: cancel keeps it', sql(`select count(*) from messages where id='${photo}'`) === '1');
  await page.locator(`[data-contribution-delete="${photo}"]`).click();
  await page.locator(`[data-confirm-yes="${photo}"]`).click();
  await page.waitForSelector(`[data-contribution-id="${photo}"]`, { state: 'detached' });
  check('delete: row gone', sql(`select count(*) from messages where id='${photo}'`) === '0');
  check('delete: storage object removed', sql(`select count(*) from storage.objects where bucket_id='memorial-media' and name='${mediaPath}'`) === '0', mediaPath);

  // 8. Concurrency: two tabs; tab 2 approves, tab 1 then declines the same item → invalid_transition, real state shown, no false success.
  const p2 = await ctx.newPage();
  await page.goto(pagePath(MA)); await settle(page);
  await p2.goto(pagePath(MA)); await settle(p2);
  const race = sql(`select id from messages where memorial_id='${MA}' and status='pending' order by created_at desc, id desc limit 1`);
  await p2.locator(`[data-contribution-id="${race}"] [data-contribution-action=approve]`).click();
  await p2.waitForSelector(`[data-contribution-id="${race}"]`, { state: 'detached' });
  await page.locator(`[data-contribution-id="${race}"] [data-contribution-action=reject]`).click();
  await page.locator(`[data-confirm-yes="${race}"]`).click();
  await page.waitForSelector(`[data-contribution-id="${race}"]`, { state: 'detached' });
  check('concurrency: decline after approval elsewhere → « modifiée entre-temps », DB stays published', /modifiée entre-temps/.test(await statusText(page)) && sql(`select status from messages where id='${race}'`) === 'published');
  // Same action twice (unchanged) is a success.
  const twice = sql(`select id from messages where memorial_id='${MA}' and status='pending' order by created_at desc, id desc limit 1`);
  await p2.reload(); await settle(p2); await page.reload(); await settle(page);
  await p2.locator(`[data-contribution-id="${twice}"] [data-contribution-action=approve]`).click();
  await p2.waitForSelector(`[data-contribution-id="${twice}"]`, { state: 'detached' });
  await page.locator(`[data-contribution-id="${twice}"] [data-contribution-action=approve]`).click();
  await page.waitForSelector(`[data-contribution-id="${twice}"]`, { state: 'detached' });
  check('concurrency: approve twice → unchanged treated as success', /publiée/.test(await statusText(page)));

  // 9. Categories: turn photos off → immediate effect in DB and public read; stale_revision across two tabs.
  await page.goto(pagePath(MA)); await settle(page);
  await p2.goto(pagePath(MA)); await settle(p2);
  await page.locator('[data-contribution-category=photos]').uncheck();
  await page.locator('[data-contribution-settings-save]').click();
  await page.waitForSelector('[data-contribution-settings] [role=status]:not([hidden])');
  check('categories: photos off in effect immediately', sql(`select photos from memorial_contribution_categories where memorial_id='${MA}'`) === 'f');
  check('categories: data kept (photos still stored)', Number(sql(`select count(*) from messages where memorial_id='${MA}' and message_type='photo'`)) >= 1);
  await p2.locator('[data-contribution-category=stories]').uncheck();
  await p2.locator('[data-contribution-settings-save]').click();
  await p2.waitForSelector('[data-contribution-settings] [role=status]:not([hidden])');
  const staleMsg = (await p2.locator('[data-contribution-settings] [role=status]').innerText()).trim();
  const p2Photos = await p2.locator('[data-contribution-category=photos]').isChecked();
  check('categories: stale_revision in the other tab → explained, real state re-read, nothing re-sent', /modifié ailleurs/.test(staleMsg) && p2Photos === false && sql(`select stories from memorial_contribution_categories where memorial_id='${MA}'`) === 't', staleMsg);
  await page.locator('[data-contribution-category=photos]').check();
  await page.locator('[data-contribution-settings-save]').click();
  await page.waitForFunction(() => /enregistrés/.test(document.querySelector('[data-contribution-settings] [role=status]')?.textContent ?? ''));
  check('categories: photos back on', sql(`select photos from memorial_contribution_categories where memorial_id='${MA}'`) === 't');

  // 10. Security: another family's tribute → 404, and a REPLAYED Server Action with B's contribution id is refused.
  const res = await page.goto(pagePath(MB));
  check('security: another family\'s page → 404', res.status() === 404, String(res.status()));
  await page.goto(pagePath(MA)); await settle(page);
  const bItem = sql(`select id from messages where memorial_id='${MB}' and status='pending' and message_type='testimonial' limit 1`);
  const target = sql(`select id from messages where memorial_id='${MA}' and status='pending' order by created_at desc, id desc limit 1`);
  let captured = null;
  await page.route('**/*', async (route) => { const r = route.request(); if (r.method() === 'POST' && r.headers()['next-action'] && !captured) captured = { url: r.url(), headers: r.headers(), body: r.postData() }; await route.continue(); });
  await page.locator(`[data-contribution-id="${target}"] [data-contribution-action=approve]`).click();
  await page.waitForSelector(`[data-contribution-id="${target}"]`, { state: 'detached' });
  await page.unroute('**/*');
  const forged = captured.body.replace(target, bItem);
  const replay = await page.request.post(captured.url, { headers: { 'next-action': captured.headers['next-action'], 'content-type': captured.headers['content-type'], accept: captured.headers['accept'] }, data: forged });
  const replayText = await replay.text();
  check('security: replayed moderation on another family\'s contribution → denied, unchanged in DB', /"status":"denied"/.test(replayText) && sql(`select status from messages where id='${bItem}'`) === 'pending', replayText.slice(-40).replace(/\s+/g, ' '));
  const anon = await b.newContext(); const ap = await anon.newPage();
  const ar = await ap.request.post(captured.url, { headers: { 'next-action': captured.headers['next-action'], 'content-type': captured.headers['content-type'], accept: captured.headers['accept'] }, data: captured.body.replace(target, bItem) });
  check('security: the same action without a session → denied', /"status":"denied"/.test(await ar.text()) && sql(`select status from messages where id='${bItem}'`) === 'pending');
  const vis = await ap.goto(pagePath(MA));
  check('security: a visitor is sent to /login', /\/login/.test(ap.url()), vis.status() + ' ' + ap.url().replace(BASE, ''));
  await anon.close();

  // 11. Pending count on the dashboard matches the DB.
  await page.goto(`${BASE}/owner?hommage=${MA}`); await settle(page);
  const dbPending = sql(`select count(*) from messages where memorial_id='${MA}' and status='pending' and message_type in ('testimonial','photo')`);
  check('dashboard: exact pending count', (await page.locator('[data-contributions-pending]').getAttribute('data-contributions-pending')) === dbPending, dbPending);

  console.log(results.join('\n'));
  console.log(`== ${results.filter((r) => r.startsWith('PASS')).length} passed, ${results.filter((r) => r.startsWith('FAIL')).length} failed`);
  await b.close();
})().catch((e) => { console.log(results.join('\n')); console.error(e); process.exit(1); });
