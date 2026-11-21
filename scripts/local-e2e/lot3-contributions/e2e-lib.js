// Node script (CommonJS, resolves the pre-installed Playwright through NODE_PATH).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { chromium } = require('playwright');
const BASE = 'http://localhost:3100';
async function login(browser, email, pw, ctxOpts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...ctxOpts });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.getByRole('tab', { name: /déjà un compte/i }).click().catch(() => {});
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill(pw);
  await Promise.all([page.waitForURL(/\/owner/, { timeout: 60000 }), page.locator('form button[type=submit]').last().click()]);
  return { ctx, page };
}
module.exports = { chromium, BASE, login };
