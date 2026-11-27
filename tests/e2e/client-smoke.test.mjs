// 浏览器菜单前端冒烟（S1-4 写码方单测；草案 §5 第 1、2 条；主会话裁定 Q5 甲、Q10 甲）。
// 子进程起 npm start 同一入口 tools/host/serve.mjs（PORT=0、IF_SAVE_ROOT 指临时目录），读 stdout 的 ready 行；playwright-core 以系统浏览器
// channel 启动（默认 chrome，环境变量 IF_BROWSER_CHANNEL 覆盖），不下载浏览器；没有浏览器即红，不 skip。
// 断言只按 DOM 的 data-code / data-value，不比对显示文字。每步失败报「停在第 N/6 步」，tests/e2e/wire-cuts.json 的 index-mount-client 行按它判。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { testTempRoot, removeTempRoot } from '../accept/temp-root.mjs';

const require = createRequire(import.meta.url);
const PW = 'playwright-core';
const { chromium } = require(PW);
const SERVE = fileURLToPath(new URL('../../tools/host/serve.mjs', import.meta.url));
const STEPS = 6;
const READY_MS = 10000;

/** 起宿主子进程，等 ready 行（10 秒内）。 @param {string} saveRoot */
async function startServe(saveRoot) {
  const child = spawn(process.execPath, [SERVE], { env: { ...process.env, PORT: '0', IF_SAVE_ROOT: saveRoot }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  let err = '';
  child.stderr.on('data', (c) => { err += String(c); });
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ready line in ${READY_MS} ms; stderr: ${err}`)), READY_MS);
    child.stdout.on('data', (c) => {
      out += String(c);
      const line = out.split('\n').find((l) => l.startsWith('{'));
      if (line) { clearTimeout(timer); resolve(JSON.parse(line).ready); }
    });
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`serve exited ${code}; stderr: ${err}`)); });
  });
  return { url, child };
}

test('浏览器菜单前端：开局 → 选来历 → 等待 → 存档 → 再等 → 读档（零 console error）', async (t) => {
  const root = testTempRoot('s14-client-');
  /** @type {any} */ let host = null;
  /** @type {any} */ let browser = null;
  t.after(async () => {
    if (browser) await browser.close();
    if (host) { host.child.kill(); await once(host.child, 'exit').catch(() => {}); }
    removeTempRoot(root);
  });
  const errors = [];
  /** @type {any} */ let page = null;
  const step = async (/** @type {number} */ n, /** @type {string} */ name, /** @type {() => Promise<void>} */ fn) => {
    try { await fn(); } catch (e) { throw new Error(`[E2E 未实现] 停在第 ${n}/${STEPS} 步「${name}」：${/** @type {Error} */ (e).message}`); }
  };
  const minuteOfDay = async () => Number(await page.locator('[data-code="uitok_fld_minute_of_day"] [data-value]').getAttribute('data-value'));
  // 一次操作完成 = 记录栏多一行且页面不再处于等待（回复记下后还会重发 view 重画，body 的 data-state 在请求途中是 waiting）。
  const act = async (/** @type {() => Promise<void>} */ click) => {
    const before = await page.locator('[data-code="uitok_blk_log"] li').count();
    await click();
    await page.locator('[data-code="uitok_blk_log"] li').nth(before).waitFor();
    await page.waitForFunction(() => document.body.dataset.state === '');
  };
  const submitCard = (/** @type {any} */ card) => act(() => card.locator('button[type="submit"]').click());

  await step(1, '起宿主并打开页面，开局菜单出现四个槽的卡片', async () => {
    host = await startServe(root);
    browser = await chromium.launch({ channel: process.env.IF_BROWSER_CHANNEL ?? 'chrome', headless: true });
    page = await browser.newPage();
    page.on('console', (/** @type {any} */ m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    page.on('pageerror', (/** @type {any} */ e) => errors.push(`pageerror: ${e.message}`));
    page.on('requestfailed', (/** @type {any} */ r) => errors.push(`requestfailed: ${r.url()}`));
    const res = await page.goto(host.url);
    assert.equal(res?.status(), 200, 'page status');
    const card = page.locator('[data-code="uitok_blk_menu"] form').first();
    await card.waitFor({ timeout: READY_MS });
    assert.equal(await card.locator('select').count(), 4, 'opening card should have 4 slot selects');
  });

  await step(2, '选来历（各槽第一项）后，我在哪 5 级、身上至少 1 行、菜单换成带数字框的卡片', async () => {
    await submitCard(page.locator('[data-code="uitok_blk_menu"] form').first());
    await page.locator('[data-code="uitok_blk_menu"] form input[type="number"]').first().waitFor();
    assert.equal(await page.locator('[data-code="uitok_blk_here"] li').count(), 5, 'here chain length');
    assert.ok(await page.locator('[data-code="uitok_blk_self"] li').count() >= 1, 'self rows');
  });

  await step(3, '等待 30 分钟，此刻日内分钟 0 → 30', async () => {
    assert.equal(await minuteOfDay(), 0);
    const card = page.locator('[data-code="uitok_blk_menu"] form').first();
    await card.locator('input[type="number"]').fill('30');
    await submitCard(card);
    assert.equal(await minuteOfDay(), 30);
  });

  await step(4, '存档到槽 1', async () => {
    await page.locator('[data-code="uitok_blk_save"] select').selectOption('1');
    await act(() => page.locator('button[data-code="uitok_btn_save"]').click());
    assert.equal(await page.locator('[data-code="uitok_blk_log"] li').first().getAttribute('data-code'), 'save_op.save');
  });

  await step(5, '再等 30 分钟后读档槽 1，此刻回到 30', async () => {
    const card = page.locator('[data-code="uitok_blk_menu"] form').first();
    await card.locator('input[type="number"]').fill('30');
    await submitCard(card);
    assert.equal(await minuteOfDay(), 60);
    await act(() => page.locator('button[data-code="uitok_btn_load"]').click());
    assert.equal(await minuteOfDay(), 30);
  });

  await step(6, '全程 console error、pageerror、失败请求均为 0', async () => {
    assert.deepEqual(errors, []);
  });
});
