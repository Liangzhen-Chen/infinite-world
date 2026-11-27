// S1-4 黑盒验收：卡文第 2、3、6、7 条（浏览器真玩一局；判定只看结构；拔语言包仍可玩；拔 mountClient 后冒烟必红）。
// 出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s14。依据与每条测什么，见 docs/卡档案/feat-s1-4/出题.md。
// 口径：起真实宿主子进程（node tools/host/serve.mjs，PORT=0）；浏览器用 playwright-core 的 chromium.launch({channel})，
// channel 默认 chrome，环境变量 IF_BROWSER_CHANNEL 覆盖；启动失败即测试红，不 skip。
// 前提全由真实动作造（点选、填数、点提交）；期望从 view 回复与 world/ 数据推出，不写死槽数、候选数、链长、分钟范围。
// 判定只看 DOM 上的 data-code / data-value 属性，不比中文文字。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
import { cpSync, readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { testTempRoot, removeTempRoot, writeUnderTempRoot } from '../../accept/temp-root.mjs';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const MOUNT = '/api/plugins/if';
// 测试机余量，非产品要求：只有 host-route 第 1 条有 10 秒产品要求；本文件的等待上限只为全量并发时稳定通过。
const TEST_MACHINE_WAIT_MS = 120000;
const CHANNEL = process.env.IF_BROWSER_CHANNEL || 'chrome';
const CHILD_ENV = (() => {
  const e = { ...process.env };
  delete e.NODE_TEST_CONTEXT; // 否则子进程按父子协议跑，退出码恒 0。
  return e;
})();
const CJK = /[　-〿㐀-鿿豈-﫿＀-￯]/;

const children = [];
const roots = [];
after(async () => {
  for (const c of children.splice(0)) await stopChild(c);
  for (const r of roots.splice(0)) removeTempRoot(r);
});

function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => { child.once('exit', () => resolve(undefined)); child.kill(); });
}

/**
 * @param {{cwd?: string, saveRoot?: string}} [opts]
 * @returns {Promise<{child: import('node:child_process').ChildProcess, ready: string}>}
 */
function startHost({ cwd = REPO, saveRoot } = {}) {
  return new Promise((resolve, reject) => {
    /** @type {Record<string, string>} */
    const env = { ...CHILD_ENV, PORT: '0' };
    if (saveRoot) env.IF_SAVE_ROOT = saveRoot;
    const child = spawn(process.execPath, ['tools/host/serve.mjs'], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(child);
    let out = '';
    let err = '';
    let settled = false;
    const done = (fn, v) => { if (settled) return; settled = true; clearTimeout(timer); fn(v); };
    const timer = setTimeout(() => done(reject, new Error(`${TEST_MACHINE_WAIT_MS} ms 内未打出 ready 行；stderr 末段：${err.slice(-400)}`)), TEST_MACHINE_WAIT_MS);
    child.stdout.on('data', (d) => {
      out += d;
      const line = out.split(/\r?\n/).find((l) => l.trim().startsWith('{'));
      if (!line) return;
      let obj = null;
      try { obj = JSON.parse(line); } catch { return; }
      if (typeof obj?.ready === 'string') done(resolve, { child, ready: obj.ready });
    });
    child.stderr.on('data', (d) => { err += d; });
    child.on('exit', (code) => done(reject, new Error(`宿主提前退出，退出码 ${code}；stderr 末段：${err.slice(-400)}`)));
  });
}

// 临时副本：复制运行宿主所需的目录，node_modules 以联接链入（与 tests/support/isolated-repo.mjs 同法）。
function copyRepo() {
  const root = testTempRoot('s14-copy-');
  roots.push(root);
  cpSync(join(REPO, 'server-plugin'), join(root, 'repo', 'server-plugin'), { recursive: true });
  cpSync(join(REPO, 'world'), join(root, 'repo', 'world'), { recursive: true });
  cpSync(join(REPO, 'client'), join(root, 'repo', 'client'), { recursive: true });
  cpSync(join(REPO, 'assets'), join(root, 'repo', 'assets'), { recursive: true });
  cpSync(join(REPO, 'tools', 'host'), join(root, 'repo', 'tools', 'host'), { recursive: true });
  cpSync(join(REPO, 'package.json'), join(root, 'repo', 'package.json'));
  symlinkSync(join(REPO, 'node_modules'), join(root, 'repo', 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  return { root, dst: join(root, 'repo') };
}

/** @typedef {{block: string, kind?: string, path?: string, rows?: Array<{token: string, path: string, kind?: string}>, tables?: Array<{token: string, path: string}>, slots?: number[], buttons?: Record<string, string>}} LayoutBlock */
/** @returns {LayoutBlock[]} */
const readLayout = (dir = REPO) => JSON.parse(readFileSync(join(dir, 'client', 'layout.json'), 'utf8')).blocks;
// 此刻块里日内分钟数的代号：路径或块内令牌都可作 data-code。
/** @param {LayoutBlock} b */
const minCodes = (b) => (b.rows ?? []).filter((r) => r.path.endsWith('minuteOfDay')).flatMap((r) => [r.path, r.token]);
// 块承载的数据路径：块自身的 path、行的 path、表的 path。
/** @param {LayoutBlock} b */
const pathsOf = (b) => [b.path, ...(b.rows ?? []).map((r) => r.path), ...(b.tables ?? []).map((t) => t.path)].filter((x) => typeof x === 'string');

async function until(fn, msg, limit = TEST_MACHINE_WAIT_MS) {
  const t0 = Date.now();
  for (;;) {
    if (await fn()) return;
    if (Date.now() - t0 > limit) throw new Error(`超时：${msg}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

// 反复执行断言直到通过（DOM 重画有先后）；超时抛最后一次的错。
async function eventually(check, limit = TEST_MACHINE_WAIT_MS) {
  const t0 = Date.now();
  for (;;) {
    try { await check(); return; } catch (e) {
      if (Date.now() - t0 > limit) throw e;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}

const VIEW = { payload: 'ui', command: 'view' };
async function view(menuUrl) {
  const res = await fetch(menuUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(VIEW) });
  return res.json();
}

const cardSel = (act) => `[data-code="${act}"]`;
const blockSel = (b) => `[data-code="${b.block}"], #${b.block}`;
/** @param {LayoutBlock[]} layout @param {string} prefix @returns {LayoutBlock} */
const blockWithPath = (layout, prefix) => {
  const b = layout.find((x) => pathsOf(x).some((q) => q.startsWith(prefix)));
  assert.ok(b, `layout.json 中应有某块含路径前缀 ${prefix}`);
  return b;
};
/** @param {import("playwright-core").Locator} loc */
// 代号与数值的配对：元素自带 data-value，或紧随其后的兄弟元素（或其后代）带 data-value。
const pairsIn = (loc) => loc.evaluate((el) => [el, ...el.querySelectorAll('[data-code]')]
  .filter((e) => e.hasAttribute('data-code'))
  .map((e) => {
    const nxt = e.nextElementSibling;
    const holder = nxt ? (nxt.hasAttribute('data-value') ? nxt : nxt.querySelector('[data-value]')) : null;
    return [e.getAttribute('data-code'), e.getAttribute('data-value') ?? holder?.getAttribute('data-value') ?? null];
  }));

// 点击并等待：动作回复，再等页面重画用的 view。返回动作的上行体与回复。
/** @param {import("playwright-core").Locator} target @param {import("playwright-core").Response[]} posts @param {string} menuUrl */
async function fire(target, posts, menuUrl) {
  const before = posts.length;
  await target.click();
  await until(() => posts.length >= before + 2, '动作之后应先有动作请求，再有重画用的 view 请求');
  const req = posts[before];
  const body = req.request().postDataJSON();
  assert.doesNotMatch(JSON.stringify(body), CJK, `上行只允许代号与数值，实得 ${JSON.stringify(body)}`);
  return { body, reply: await req.json() };
}

/** @param {import("playwright-core").Locator} blk @param {string|number} slot */
async function pickSlot(blk, slot) {
  const idx = await blk.evaluate((el, s) => [...el.querySelectorAll('option')].findIndex((o) => o.getAttribute('data-value') === s || o.value === s), String(slot));
  if (idx >= 0) { await blk.locator('select').first().selectOption({ index: idx }); return; }
  await blk.locator(`[data-value="${slot}"]`).first().click();
}

// 一局：开局（每个槽都选） → 看此刻/我在哪/身上 → 等待 → 存档 → 再等待 → 读档。
// 返回收集到的控制台/请求错误（测试据此断言为 0）。选项用候选序号 0；等待分钟取 min..max 的中点。
// removedUrls：拔包变体里被拔掉的 i18n 文件 URL 集合（缺省为空，即主流程口径）。
/**
 * @param {import("playwright-core").Browser} browser
 * @param {string} ready
 * @param {{layout: LayoutBlock[], removedUrls?: string[] | null}} opts
 */
async function playRound(browser, ready, { layout, removedUrls = null }) {
  const menuUrl = new URL('../menu', ready).href;
  const page = await browser.newPage();
  page.setDefaultTimeout(TEST_MACHINE_WAIT_MS);
  page.setDefaultNavigationTimeout(TEST_MACHINE_WAIT_MS);
  const consoleErrs = [];
  const pageErrs = [];
  const failedUrls = new Set();
  const posts = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrs.push({ text: m.text(), url: m.location()?.url ?? '' }); });
  page.on('pageerror', (e) => pageErrs.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => failedUrls.add(r.url()));
  page.on('response', (r) => {
    if (r.status() >= 400) failedUrls.add(r.url());
    if (r.request().method() === 'POST' && r.url() === menuUrl) posts.push(r);
  });
  try {
    await page.goto(ready);
    await until(() => posts.length >= 1, '页面加载后应发出首个 view');

    // --- 开局 ---
    let v = await view(menuUrl);
    const openAct = v.menu.find((e) => Object.keys(e.slots ?? {}).length > 0);
    assert.ok(openAct, '开局菜单应含带槽位的动作');
    for (const e of v.menu) {
      assert.ok(await page.locator(cardSel(e.act)).count() >= 1, `菜单应有动作 ${e.act} 的卡片`);
    }
    const card = page.locator(cardSel(openAct.act)).first();
    await card.waitFor();
    const slotNames = Object.keys(openAct.slots);
    assert.equal(await card.locator('select').count(), slotNames.length, '每个槽应有一个下拉框');
    for (const slot of slotNames) {
      const sel = card.locator(`select[data-code="${slot}"]`);
      assert.equal(await sel.locator('option').count(), openAct.slots[slot].length, `槽 ${slot} 的选项数应等于回复里的候选数`);
      await sel.selectOption({ index: 0 });
    }
    const opened = await fire(card.locator('button').last(), posts, menuUrl);
    assert.equal(opened.body.act, openAct.act, '上行的动作代号应为所点卡片的代号');
    for (const slot of slotNames) assert.equal(opened.body.slots[slot], 0, `槽 ${slot} 应上行候选序号 0`);
    assert.equal(opened.reply.result, 'ok', `开局动作应成功：${JSON.stringify(opened.reply).slice(0, 300)}`);

    // --- 看此刻 / 我在哪 / 身上 ---
    const hereB = blockWithPath(layout, 'here.');
    const selfB = blockWithPath(layout, 'self.');
    const nowB = blockWithPath(layout, 'now.');
    v = await view(menuUrl);
    assert.ok(v.self, '选完来历后 self 应非 null');
    const checkPanels = async () => {
      const hereCodes = (await pairsIn(page.locator(blockSel(hereB)).first())).map((p) => p[0]);
      const chain = v.here.chain;
      assert.ok(chain.length >= 1, '我在哪应有链');
      let i = 0;
      for (const c of hereCodes) if (i < chain.length && c === chain[i]) i++;
      assert.equal(i, chain.length, `我在哪应按序含链上 ${chain.length} 个地点代号，实得 ${JSON.stringify(hereCodes)}`);

      const pairs = await pairsIn(page.locator(blockSel(selfB)).first());
      const codes = pairs.map((p) => p[0]);
      assert.ok(v.self.accounts.length + v.self.holdings.length >= 1, '身上应至少有一行');
      for (const a of v.self.accounts) {
        // 资源的名字与余额可能是同一行里的两个元素：取带 data-code=资源代号 的元素所在行，行内应有 data-value=余额。
        const vals = await page.locator(`[data-code="${a.resource}"]`).first().evaluate((el) => {
          const row = el.closest('li,tr,dl,div') ?? el.parentElement;
          return row ? [...row.querySelectorAll('[data-value]')].map((e) => e.getAttribute('data-value')) : [];
        });
        assert.ok(vals.includes(String(a.balance)), `身上应有资源 ${a.resource} 的余额 ${a.balance}，行内实得 ${JSON.stringify(vals)}`);
      }
      for (const h of v.self.holdings) {
        assert.ok([h.kind, h.subject, h.template].some((x) => x != null && codes.includes(x)), `身上应有持有行 ${h.kind}`);
      }
      const nowPairs = await pairsIn(page.locator(blockSel(nowB)).first());
      assert.ok(nowPairs.some(([c, val]) => minCodes(nowB).includes(c) && val === String(v.now.minuteOfDay)), '此刻应显示当前日内分钟数');
    };
    await eventually(checkPanels);

    // --- 等待：数字框取回复里的 min..max ---
    const waitAct = v.menu.find((e) => Object.keys(e.numbers ?? {}).length > 0);
    assert.ok(waitAct, '开局后应出现带数字框的动作');
    const wcard = page.locator(cardSel(waitAct.act)).first();
    await wcard.waitFor();
    const [numName] = Object.keys(waitAct.numbers);
    const { min, max } = waitAct.numbers[numName];
    const input = wcard.locator(`input[data-code="${numName}"]`);
    assert.equal(await input.getAttribute('min'), String(min), '数字框的 min 应取自回复');
    assert.equal(await input.getAttribute('max'), String(max), '数字框的 max 应取自回复');
    const waitBy = async (n) => {
      await input.fill(String(n));
      const r = await fire(wcard.locator('button').last(), posts, menuUrl);
      assert.equal(r.body.numbers[numName], n, '上行的数值应为所填');
      assert.equal(r.reply.result, 'ok', `等待应成功：${JSON.stringify(r.reply).slice(0, 300)}`);
    };
    const amount = min + Math.floor((max - min) / 2);
    assert.ok(amount >= min && amount <= max);
    const before = (await view(menuUrl)).now;
    await waitBy(amount);
    v = await view(menuUrl);
    assert.equal(v.now.minute - before.minute, amount, '绝对分钟应恰增等待的数值');
    if (before.minuteOfDay + amount !== v.now.minuteOfDay) {
      assert.equal(v.now.day, before.day + 1, '日内分钟不是直接相加时，应是跨日（日数进一）');
    }
    await eventually(checkPanels);
    await eventually(async () => {
      const np = await pairsIn(page.locator(blockSel(nowB)).first());
      assert.ok(np.some(([c, val]) => minCodes(nowB).includes(c) && val === String(v.now.minuteOfDay)), '页面此刻的分钟数应与回复一致');
    });

    // --- 存档（槽 1）→ 再等 → 读档（槽 1）---
    // 存档块与按钮代号都取自 layout.json（kind=save 的块：buttons 给按钮代号，slots 给槽号）。
    const saveDef = layout.find((b) => b.kind === 'save');
    assert.ok(saveDef, 'layout.json 应有 kind=save 的存档块');
    const saveB = page.locator(blockSel(saveDef)).first();
    assert.equal(await saveB.locator('select option').count(), saveDef.slots.length, '槽位下拉框的选项数应等于 layout.json 给出的槽数');
    await pickSlot(saveB, 1);
    const saved = await fire(saveB.locator(`[data-code="${saveDef.buttons.save}"]`).first(), posts, menuUrl);
    assert.equal(saved.body.payload, 'act');
    assert.equal(saved.body.save, 'save');
    assert.equal(Number(saved.body.saveSlot), 1);
    assert.equal(saved.reply.result, 'ok', `存档应成功：${JSON.stringify(saved.reply).slice(0, 300)}`);
    const savedNow = (await view(menuUrl)).now;

    await waitBy(amount);
    const afterWait = (await view(menuUrl)).now;
    assert.ok(afterWait.minute > savedNow.minute, '再等之后绝对分钟应前进');

    await pickSlot(saveB, 1);
    const loaded = await fire(saveB.locator(`[data-code="${saveDef.buttons.load}"]`).first(), posts, menuUrl);
    assert.equal(loaded.body.save, 'load');
    assert.equal(Number(loaded.body.saveSlot), 1);
    assert.equal(loaded.reply.result, 'ok', `读档应成功：${JSON.stringify(loaded.reply).slice(0, 300)}`);
    const loadedNow = (await view(menuUrl)).now;
    assert.equal(loadedNow.minute, savedNow.minute, '读档后此刻应回到存档时刻');
    await eventually(async () => {
      const np = await pairsIn(page.locator(blockSel(nowB)).first());
      assert.ok(np.some(([c, val]) => minCodes(nowB).includes(c) && val === String(savedNow.minuteOfDay)), '读档后页面此刻应回到存档时的分钟数');
    });

    // 口径：主流程（removedUrls 为空）页面错误、失败请求、控制台错误全为 0。
    // 拔包变体（主会话更正，出题.md 说明）：pageerror 为 0；失败请求集合非空，且是被拔掉 i18n 文件 URL 集合的子集
    // （客户端在 locales.json 读不到时不再请求 labels，属正确行为，不要求全部被拔文件都被请求）；
    // 控制台 error 每条都必须能由这些失败请求解释（消息或位置里带着其中一个失败 URL）。
    // 理由：浏览器把资源失败记为 console error，属网络日志，不是页面报错。
    const allowed = new Set(removedUrls ?? []);
    assert.deepEqual(pageErrs, [], `页面异常应为 0：${pageErrs.join(' | ')}`);
    if (removedUrls) {
      assert.ok(failedUrls.size > 0, '拔包变体里应至少有一次对被拔掉文件的失败请求');
      for (const u of failedUrls) assert.ok(allowed.has(u), `失败请求应只落在被拔掉的 i18n 文件上：${u}`);
    } else {
      assert.equal(failedUrls.size, 0, `主流程失败请求应为 0：${[...failedUrls].join(' | ')}`);
    }
    const stray = consoleErrs.filter((m) => ![...failedUrls].some((u) => m.url === u || m.text.includes(u)));
    assert.deepEqual(stray.map((m) => m.text), [], '控制台 error 中不能由失败请求解释的条应为 0');
    if (removedUrls) {
      assert.ok(await page.locator('.untranslated').count() > 0, '拔掉语言包后，缺名的节点应带 untranslated 类');
    }
    return { failedUrls: [...failedUrls], consoleErrs: consoleErrs.length };
  } finally {
    await page.close();
  }
}

// ---------- 用例 ----------

test('2. 零 mock 浏览器冒烟：起真宿主，浏览器开局→看板→等待→存档→再等→读档，全程 0 控制台报错、0 页面异常、0 失败请求', async () => {
  const saveRoot = testTempRoot('s14-save-');
  roots.push(saveRoot);
  const { ready } = await startHost({ saveRoot });
  const layout = readLayout();
  const browser = await chromium.launch({ channel: CHANNEL });
  try {
    await playRound(browser, ready, { layout });
  } finally {
    await browser.close();
  }
});

test('3. 判定只看结构：一局中所有上行体只含代号与数值（无 CJK），页面断言只用 data-code 与 data-value', async () => {
  const saveRoot = testTempRoot('s14-struct-');
  roots.push(saveRoot);
  const { ready } = await startHost({ saveRoot });
  const layout = readLayout();
  const browser = await chromium.launch({ channel: CHANNEL });
  try {
    // 独立核一次：页面发出的每个 menu 请求体（含首个 view）都不得含文字；一局的其余断言只看 data-code / data-value。
    const menuUrl = new URL('../menu', ready).href;
    const bodies = [];
    const page = await browser.newPage();
    page.on('request', (r) => { if (r.method() === 'POST' && r.url() === menuUrl) bodies.push(r.postData() ?? ''); });
    await page.goto(ready);
    await until(() => bodies.length >= 1, '页面加载后应发出首个 view');
    await page.close();
    for (const b of bodies) assert.doesNotMatch(b, CJK, `上行体不得含文字：${b}`);
    await playRound(browser, ready, { layout });
    assert.ok(bodies.length >= 1);
  } finally {
    await browser.close();
  }
});

test('6. 拔掉语言包仍可玩：临时副本里静态白名单去掉 i18n 两行后，同一局仍能走完，界面以代号显示（带 untranslated 类），console error 为 0', async () => {
  const { root, dst } = copyRepo();
  const rp = join(dst, 'world', 'display', 'client-route.json');
  const route = JSON.parse(readFileSync(rp, 'utf8'));
  const keep = route.roots.filter((r) => !String(r.url ?? '').startsWith('i18n'));
  assert.ok(keep.length < route.roots.length, '白名单里应有语言包根，去掉后数量应减少');
  writeUnderTempRoot(root, 'repo/world/display/client-route.json', JSON.stringify({ ...route, roots: keep }, null, 2));

  // 被拔掉的 URL：客户端路径 = client/ + 根的 url + 文件名（与 client-route.json 的白名单映射一致）。
  const removed = route.roots.filter((r) => String(r.url ?? '').startsWith('i18n'));
  const removedFiles = removed.flatMap((r) => (r.files ?? []).map((f) => `${r.url}${f.split('/').pop()}`));
  assert.ok(removedFiles.length > 0, '被拔掉的语言包应至少有一个文件');

  const saveRoot = testTempRoot('s14-nolang-');
  roots.push(saveRoot);
  const { ready } = await startHost({ cwd: dst, saveRoot });
  const origin = new URL(ready).origin;
  const removedUrls = removedFiles.map((f) => `${origin}${MOUNT}/client/${f}`);
  const layout = readLayout();
  const browser = await chromium.launch({ channel: CHANNEL });
  try {
    await playRound(browser, ready, { layout, removedUrls });
  } finally {
    await browser.close();
  }
});

test('7. 拔掉 mountClient 后浏览器冒烟必红：临时副本里把 index.mjs 的装配调用改名，宿主起不来或页面走不通，同一局必须失败', async () => {
  const { root, dst } = copyRepo();
  const ip = join(dst, 'server-plugin', 'index.mjs');
  const src = readFileSync(ip, 'utf8');
  assert.equal(src.split('mountClient(').length - 1, 1, 'index.mjs 中 mountClient( 应恰出现一次（装配调用）');
  writeUnderTempRoot(root, 'repo/server-plugin/index.mjs', src.replace('mountClient(', 'mountClient_cut('));

  const saveRoot = testTempRoot('s14-cut-');
  roots.push(saveRoot);
  const layout = readLayout();
  const browser = await chromium.launch({ channel: CHANNEL });
  try {
    await assert.rejects(async () => {
      const { ready } = await startHost({ cwd: dst, saveRoot });
      await playRound(browser, ready, { layout });
    }, '拔掉 mountClient 后冒烟必须红');
  } finally {
    await browser.close();
  }
});
