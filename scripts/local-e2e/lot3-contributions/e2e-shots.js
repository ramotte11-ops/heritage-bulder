// Node script (CommonJS, resolves the pre-installed Playwright through NODE_PATH).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { chromium, BASE, login } = require('./e2e-lib.js');
const MA = process.env.MA; const OUT = process.argv[2];
const hideDev = 'nextjs-portal{display:none!important}';
(async () => {
  const b = await chromium.launch();
  const { ctx } = await login(b, 'famille.martin@example.test', process.env.LOT3_PW);
  const report = [];
  const shots = [
    ['desktop-1440', 1440, 900, 'fr'], ['mobile-430', 430, 932, 'fr'], ['mobile-390', 390, 844, 'fr'],
    ['mobile-375', 375, 812, 'fr'], ['mobile-320', 320, 640, 'fr'], ['mobile-390-en', 390, 844, 'en'], ['desktop-1440-es', 1440, 900, 'es'],
  ];
  for (const [name, w, h, lang] of shots) {
    const p = await ctx.newPage();
    await p.setViewportSize({ width: w, height: h });
    const q = lang === 'fr' ? '' : `&langue=${lang}`;
    await p.goto(`${BASE}/owner?hommage=${MA}${q}`); await p.addStyleTag({ content: hideDev }); await p.waitForLoadState('networkidle');
    await p.locator('[data-feature="contributions"]').scrollIntoViewIfNeeded();
    await p.locator('[data-family-features]').screenshot({ path: `${OUT}/${name}-tableau-de-bord.jpg`, quality: 82 });
    await p.goto(`${BASE}/owner/hommages/${MA}/contributions${lang === 'fr' ? '' : '?langue=' + lang}`); await p.addStyleTag({ content: hideDev }); await p.waitForLoadState('networkidle');
    await p.waitForTimeout(400);
    await p.screenshot({ path: `${OUT}/${name}-a-examiner.jpg`, quality: 82, fullPage: false });
    // Overflow and touch targets
    const m = await p.evaluate(() => {
      const over = document.documentElement.scrollWidth > window.innerWidth + 1;
      const small = [...document.querySelectorAll('[data-family-contributions] button, [data-family-contributions] a, [data-family-contributions] input[type=checkbox]')]
        .filter((e) => e.offsetParent !== null)
        .map((e) => { const r = (e.closest('label') ?? e).getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width), t: (e.textContent || e.getAttribute('data-contribution-category') || '').trim().slice(0, 24) }; })
        .filter((r) => r.h < 44);
      return { over, small };
    });
    report.push({ name, horizontalOverflow: m.over, under44px: m.small });
    if (w === 390 && lang === 'fr' || name === 'desktop-1440') {
      await p.goto(`${BASE}/owner/hommages/${MA}/contributions?vue=published`); await p.addStyleTag({ content: hideDev }); await p.waitForLoadState('networkidle');
      const del = p.locator('[data-contribution-delete]').first();
      await del.click();
      await p.locator('[data-confirm-delete]').first().scrollIntoViewIfNeeded();
      await p.waitForTimeout(200);
      await p.screenshot({ path: `${OUT}/${name}-publiees-confirmation.jpg`, quality: 82 });
      await p.locator('[data-confirm-cancel]').first().click();
      await p.locator('[data-contribution-settings]').scrollIntoViewIfNeeded();
      await p.locator('[data-contribution-settings]').screenshot({ path: `${OUT}/${name}-reglages.jpg`, quality: 82 });
      for (const v of ['hidden', 'rejected']) {
        await p.goto(`${BASE}/owner/hommages/${MA}/contributions?vue=${v}`); await p.addStyleTag({ content: hideDev }); await p.waitForLoadState('networkidle');
        await p.screenshot({ path: `${OUT}/${name}-${v === 'hidden' ? 'masquees' : 'refusees'}.jpg`, quality: 82 });
      }
    }
    await p.close();
  }
  // Keyboard: from the views, Tab reaches the first item's actions; Enter approves.
  const k = await ctx.newPage(); await k.setViewportSize({ width: 1440, height: 900 });
  await k.goto(`${BASE}/owner/hommages/${MA}/contributions`); await k.waitForLoadState('networkidle');
  await k.locator('[data-contributions-tab=rejected]').focus();
  const seq = [];
  for (let i = 0; i < 4; i++) { await k.keyboard.press('Tab'); seq.push(await k.evaluate(() => { const a = document.activeElement; return (a.getAttribute('data-contribution-action') || a.getAttribute('data-contributions-tab') || a.tagName) + (getComputedStyle(a).outlineStyle !== 'none' ? '[focus-ring]' : ''); })); }
  report.push({ keyboardAfterLastTab: seq });
  await k.close();
  console.log(JSON.stringify(report, null, 1));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
