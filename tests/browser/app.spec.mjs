import { test as base, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createApp } from '../../server/index.mjs';
import { config } from '../../server/config.mjs';
import { passwordHash } from '../../server/security.mjs';

// A real API and isolated SQLite database; no intercepted/mock browser responses.
const test = base.extend({
  app: [async ({}, use) => {
    const dir = await mkdtemp(join(tmpdir(), 'ruzmah-browser-'));
    const cfg = config({ DATA_DIR: dir, APP_KEY: randomBytes(32).toString('base64') });
    const app = createApp(cfg);
    app.server.listen(0, '127.0.0.1');
    await once(app.server, 'listening');
    cfg.origin = `http://127.0.0.1:${app.server.address().port}`;
    const password = randomBytes(24).toString('base64url');
    for (const role of ['admin', 'student']) {
      const id = randomUUID();
      app.store.db.prepare('INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)')
        .run(id, `${role}@example.test`, role === 'admin' ? 'مالك الاختبار' : 'طالب الاختبار', await passwordHash(password), role, new Date().toISOString());
      if (role === 'student') app.store.db.prepare('INSERT INTO subscriptions VALUES(?,?,?,?,?,?,NULL)')
        .run(randomUUID(), id, 'year', new Date().toISOString(), new Date(Date.now() + 86400000).toISOString(), 'active');
    }
    try { await use({ ...app, url: cfg.origin, password }); }
    finally {
      await new Promise((resolve, reject) => app.server.close(err => err ? reject(err) : resolve()));
      await rm(dir, { recursive: true, force: true });
    }
  }, { scope: 'worker' }],
});
async function login(page, app, email) {
  const owner = email === "admin@example.test";
  const route = owner ? "admin-login" : "login";
  const form = owner ? "#admin-auth-form" : "#auth-form";
  await page.goto(`${app.url}/#/${route}`);
  await page.locator(`${form} input[name=email]`).fill(email);
  await page.locator(`${form} input[name=password]`).fill(app.password);
  await page.locator(`${form} button[type=submit]`).click();
  await expect(page.locator(form)).toHaveCount(0);
}
function trackFailures(page) {
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
  });
  return failures;
}

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`public RTL pages render without missing resources at ${viewport.width}px`, async ({ page, app }) => {
    const failures = trackFailures(page);
    await page.setViewportSize(viewport);
    for (const route of ['', 'sections', 'section/qudrat', 'section/tahsili', 'section/step', 'instructors', 'course/quant-basics', 'pricing', 'subscription/year', 'updates', 'about', 'login', 'signup', 'admin-login']) {
      await page.goto(`${app.url}/#/${route}`);
      await expect(page.locator('#main')).toBeVisible();
      await expect(page.locator('#main')).not.toContainText('تعذر الاتصال');
      expect(await page.locator('#main').innerText()).not.toHaveLength(0);
      expect(await page.locator('html').getAttribute('dir')).toBe('rtl');
      expect(await page.evaluate(() => getComputedStyle(document.body).direction)).toBe('rtl');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
    await page.goto(app.url);
    await page.locator('[data-action=theme]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await page.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts].filter(f => f.family === 'Ruzmah').some(f => f.status === 'loaded');
    })).toBe(true);
    if (viewport.width < 500) {
      await page.locator('[data-action=mobile-menu]').click();
      await expect(page.locator('#main-nav')).toHaveClass(/open/);
      await page.keyboard.press('Escape');
      await expect(page.locator('#main-nav')).not.toHaveClass(/open/);
    }
    await page.screenshot({ path: `test-results/storefront-${viewport.width}.png`, fullPage: true });
    expect(failures).toEqual([]);
  });
}

test('registration, session persistence, login/logout and unpaid subscription gate', async ({ page, app }) => {
  const failures = trackFailures(page);
  const email = `${randomUUID()}@example.test`;
  await page.goto(`${app.url}/#/signup`);
  await page.locator('#auth-form input[name=name]').fill('طالب تسجيل جديد');
  await page.locator('#auth-form input[name=email]').fill(email);
  await page.locator('#auth-form input[name=password]').fill(app.password);
  await page.locator('#auth-form button[type=submit]').click();
  await expect(page).toHaveURL(/#\/sections$/);
  await page.reload();
  await expect(page.locator('[data-action=logout]')).toBeVisible();
  await page.goto(`${app.url}/#/journey`);
  await expect(page.locator('#main')).toContainText('منصة الطالب ضمن اشتراكك الشامل');
  await page.goto(`${app.url}/#/subscription/year`);
  await expect(page.locator('.order-total')).toContainText('99.99');
  await expect(page.locator('#subscription-form button[type=submit]')).toBeDisabled();
  await page.locator('[data-action=logout]').click();
  await expect(page.locator('[data-action=logout]')).toHaveCount(0);
  await login(page, app, email);
  await page.goto(`${app.url}/#/admin`);
  await expect(page.locator('.admin-shell')).toHaveCount(0);
  expect(failures).toEqual([]);
});

test('owner dashboard loads every tab and the local CodeMirror editor', async ({ page, app }) => {
  const failures = trackFailures(page);
  await login(page, app, 'admin@example.test');
  await page.goto(`${app.url}/#/admin`);
  await expect(page.locator('.admin-shell')).toBeVisible();
  const tabs = await page.locator('[data-admin-tab]').evaluateAll(nodes => nodes.map(n => n.dataset.adminTab));
  expect(tabs.length).toBeGreaterThan(15);
  for (const tab of tabs) {
    await page.locator(`[data-admin-tab="${tab}"]`).click();
    await expect(page.locator(`[data-admin-tab="${tab}"]`)).toHaveClass('active');
    await expect(page.locator('#admin-content')).not.toContainText('جارٍ تحميل البيانات');
    await expect(page.locator('#admin-content')).not.toContainText('تعذر تحميل');
    if (tab === 'custom') await expect(page.locator('.cm-editor')).toHaveCount(3);
  }
  await page.locator('[data-admin-tab=storefront]').click();
  await page.locator('input[name=supportEmail]').fill('support@example.test');
  await page.locator('#store-content-form button[type=submit]').click();
  await expect(page.locator('#toast')).toContainText('حُفظ');
  await page.reload();
  await page.locator('[data-admin-tab=storefront]').click();
  await expect(page.locator('input[name=supportEmail]')).toHaveValue('support@example.test');
  expect(failures).toEqual([]);
});

test('subscribed student completes onboarding, saves choices and replans real content', async ({ page, app }) => {
  const failures = trackFailures(page);
  await login(page, app, 'student@example.test');
  await page.goto(`${app.url}/#/welcome`);
  const keys = ['sectionId', 'foundationStarted', 'foundationCompleted', 'selfLevel', 'targetScore', 'examDate', 'dailyMinutes', 'studyDays'];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    await expect(page.locator('#welcome-form')).toHaveAttribute('data-key', key);
    if (key === 'sectionId') {
      await page.locator('input[name=sectionId][value=qudrat]').check();
      await expect(page.locator('#welcome-form')).toHaveAttribute('data-key', keys[i + 1]);
      continue;
    }
    if (key === 'foundationStarted' || key === 'foundationCompleted' || key === 'selfLevel') {
      await page.locator(`input[name="${key}"]`).first().check();
      await expect(page.locator('#welcome-form')).toHaveAttribute('data-key', keys[i + 1]);
      continue;
    }
    if (key === 'targetScore') await page.locator('input[name=targetScore]').fill('90');
    if (key === 'examDate') await page.locator('input[name=examDate]').fill('2027-01-15');
    if (key === 'dailyMinutes') {
      await page.locator('input[name=hours][value="2"]').check();
      await expect(page.locator('#welcome-form')).toHaveAttribute('data-key', keys[i + 1]);
      continue;
    }
    if (key === 'studyDays')
      for (const input of await page.locator('input[name=studyDays]').all()) await input.check();
    await page.locator('#welcome-form button[type=submit]').click();
  }
  await expect(page).toHaveURL((url) => url.hash === "#/choose");
  await page.locator('input[name=courseId][value=quant-basics]').check();
  await page.locator('#choices-form button[type=submit]').click();
  await expect(page).toHaveURL((url) => url.hash === "#/journey");
  await expect(page.locator('#learning-root')).toContainText('الأساس الذي تبني عليه');
  for (const route of ['learning-settings', 'bank', 'tests', 'mistakes', 'scratch', 'subscription', 'tutor']) {
    await page.goto(`${app.url}/#/${route}`);
    await expect(page.locator('#main')).toBeVisible();
    await expect(page.locator('#main')).not.toContainText('تعذر الاتصال');
  }
  await page.goto(`${app.url}/#/learning-settings`);
  await page.locator('#learning-settings input[name=hours]').fill('3');
  await page.locator('#learning-settings button[type=submit]').click();
  await expect(page).toHaveURL((url) => url.hash === "#/journey");
  await page.reload();
  const me = await page.evaluate(() => fetch('/api/learning/me').then(r => r.json()));
  expect(me.profile.dailyMinutes).toBe(180);
  expect(me.selectedCourseIds).toContain('quant-basics');
  expect(failures).toEqual([]);
});
