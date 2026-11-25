// 验收：chore/ci-typecheck（L-04 类型检查配置、L-05 远端 CI 文件、L-18 零 mock E2E 红灯桩）
// 出题方：Claude Haiku 5.5（API），照 docs/gemini/kickoff-1125.md:475、:476、:499 单独写。
// 只读真实仓库文件，不 mock，不依赖仓库当前数字。YAML 按文本行判断，不引第三方库。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../../../', import.meta.url);
const ROOT_PATH = fileURLToPath(ROOT);
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8');
const exists = (rel) => { try { readFileSync(new URL(rel, ROOT)); return true; } catch { return false; } };

// 去掉 JSONC 的注释与尾逗号；字符串内的 // 与 /* 不算注释（如 "archive/**" 不能被误删）。
function stripJsonc(src) {
  let out = '';
  let inStr = false;
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (inStr) {
      out += c;
      if (c === '\\') { out += n ?? ''; i += 2; continue; }
      if (c === '"') inStr = false;
      i++;
      continue;
    }
    if (c === '"') { inStr = true; out += c; i++; continue; }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end < 0 ? src.length : end + 2;
      continue;
    }
    out += c;
    i++;
  }
  let res = '';
  inStr = false;
  for (let j = 0; j < out.length; j++) {
    const c = out[j];
    if (inStr) {
      res += c;
      if (c === '\\') { res += out[j + 1] ?? ''; j++; continue; }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; res += c; continue; }
    if (c === ',' && /^\s*[}\]]/.test(out.slice(j + 1))) continue;
    res += c;
  }
  return res;
}

function walkSource(relDir) {
  const found = [];
  const visit = (dirUrl) => {
    for (const ent of readdirSync(dirUrl, { withFileTypes: true })) {
      if (ent.name === 'node_modules') continue;
      if (ent.isDirectory()) visit(new URL(ent.name + '/', dirUrl));
      else if (/\.(mjs|js)$/.test(ent.name)) found.push(new URL(ent.name, dirUrl));
    }
  };
  visit(new URL(relDir, ROOT));
  return found;
}

// 解析 ci.yml 的 jobs 段：返回 { name, lines }[]（按缩进为 2 的 job 键切分）。
function parseJobs(yml) {
  const lines = yml.split(/\r?\n/);
  const start = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  if (start < 0) return [];
  const jobs = [];
  let cur = null;
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^\S/.test(l)) break;
    const head = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(l);
    if (head) { cur = { name: head[1], lines: [] }; jobs.push(cur); continue; }
    if (cur) cur.lines.push(l);
  }
  return jobs;
}

const DIRECTIVE = /(?:\/\/\/?|\/\*+|^\s*\*+)\s*@ts-(?:nocheck|ignore|expect-error)\b/;
const E2E = 'tests/e2e/vertical-slice-smoke.test.mjs';

test('package.json：devDependencies.typescript 为确切版本（不以 ^ 或 ~ 开头）', () => {
  const pkg = JSON.parse(read('package.json'));
  const v = pkg.devDependencies?.typescript;
  assert.ok(v, 'devDependencies 缺 typescript');
  assert.match(v, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, `typescript 版本应为确切版本，实际为 ${v}`);
});

test('package.json：scripts 含 typecheck、test:e2e、test:all，且 test:all 不含 tests/e2e', () => {
  const scripts = JSON.parse(read('package.json')).scripts ?? {};
  for (const name of ['typecheck', 'test:e2e', 'test:all']) {
    assert.ok(typeof scripts[name] === 'string' && scripts[name].trim() !== '', `scripts 缺 ${name}`);
  }
  assert.doesNotMatch(scripts['test:all'], /tests\/e2e/, 'test:all 不应包含 tests/e2e');
});

test('jsconfig.json 或 tsconfig.json：存在、可解析，compilerOptions 含 allowJs/checkJs/noEmit 且为 true', () => {
  const candidates = ['jsconfig.json', 'tsconfig.json'].filter(exists);
  assert.ok(candidates.length > 0, '既无 jsconfig.json 也无 tsconfig.json');
  for (const f of candidates) {
    let cfg;
    try { cfg = JSON.parse(stripJsonc(read(f))); } catch (e) { assert.fail(`${f} 无法解析：${e.message}`); }
    const co = cfg.compilerOptions ?? {};
    for (const key of ['allowJs', 'checkJs', 'noEmit']) {
      assert.equal(co[key], true, `${f} compilerOptions.${key} 应为 true`);
    }
  }
});

test('jsconfig.json 或 tsconfig.json：exclude 含 archive 与 SillyTavern，include/files 不含 archive', () => {
  const candidates = ['jsconfig.json', 'tsconfig.json'].filter(exists);
  assert.ok(candidates.length > 0, '既无 jsconfig.json 也无 tsconfig.json');
  for (const f of candidates) {
    const cfg = JSON.parse(stripJsonc(read(f)));
    const exclude = Array.isArray(cfg.exclude) ? cfg.exclude : [];
    assert.ok(exclude.some((e) => /archive/.test(e)), `${f} exclude 应含 archive`);
    assert.ok(exclude.some((e) => /SillyTavern/.test(e)), `${f} exclude 应含 SillyTavern`);
    for (const key of ['include', 'files']) {
      const list = Array.isArray(cfg[key]) ? cfg[key] : [];
      const hit = list.filter((e) => /archive/.test(e));
      assert.deepEqual(hit, [], `${f} ${key} 不应含 archive`);
    }
  }
});

test('源码：server-plugin/、tools/、tests/ 下 .mjs/.js 无 @ts-nocheck / @ts-ignore / @ts-expect-error 指令', () => {
  const hits = [];
  for (const dir of ['server-plugin/', 'tools/', 'tests/']) {
    for (const fileUrl of walkSource(dir)) {
      const lines = readFileSync(fileUrl, 'utf8').split(/\r?\n/);
      lines.forEach((line, idx) => {
        if (DIRECTIVE.test(line)) hits.push(`${fileURLToPath(fileUrl)}:${idx + 1}`);
      });
    }
  }
  assert.deepEqual(hits, [], `发现类型检查指令：\n${hits.join('\n')}`);
});

test('npm run typecheck 退出码为 0', { timeout: 360000 }, () => {
  const r = spawnSync('npm run typecheck', {
    cwd: ROOT_PATH,
    shell: true,
    encoding: 'utf8',
    timeout: 300000,
    maxBuffer: 1 << 26,
  });
  const tail = `${r.stdout ?? ''}${r.stderr ?? ''}`.split(/\r?\n/).slice(-30).join('\n');
  assert.equal(r.status, 0, `npm run typecheck 退出码 ${r.status}，末段输出：\n${tail}`);
});

test('.github/workflows/ci.yml 存在，文本里按顺序出现 npm ci → typecheck → tools/accept/run.mjs pre_commit → gen-status-snapshot.mjs --check → test:all', () => {
  assert.ok(exists('.github/workflows/ci.yml'), '缺 .github/workflows/ci.yml');
  const text = read('.github/workflows/ci.yml');
  const markers = ['npm ci', 'typecheck', 'tools/accept/run.mjs pre_commit', 'gen-status-snapshot.mjs --check', 'test:all'];
  let pos = 0;
  for (const m of markers) {
    const idx = text.indexOf(m, pos);
    assert.ok(idx >= 0, `ci.yml 中未按顺序找到「${m}」（自位置 ${pos} 起）`);
    pos = idx + m.length;
  }
});

test('.github/workflows/ci.yml：有一个 job 跑 test:e2e 且该 job 带 job 级 continue-on-error: true', () => {
  const jobs = parseJobs(read('.github/workflows/ci.yml'));
  const e2eJobs = jobs.filter((j) => j.lines.some((l) => /test:e2e/.test(l)));
  assert.ok(e2eJobs.length > 0, 'ci.yml 没有任何 job 跑 test:e2e');
  const ok = e2eJobs.some((j) => {
    const firstProp = j.lines.find((l) => /\S/.test(l));
    const propIndent = firstProp ? /^\s*/.exec(firstProp)[0].length : 0;
    return j.lines.some((l) =>
      /^\s*/.exec(l)[0].length === propIndent && /^\s*continue-on-error:\s*true\s*$/.test(l));
  });
  assert.ok(ok, '跑 test:e2e 的 job 未带 job 级 continue-on-error: true');
});

test('.github/workflows/ci.yml：主 job（不跑 test:e2e 的 job）里没有 continue-on-error', () => {
  const jobs = parseJobs(read('.github/workflows/ci.yml'));
  const mainJobs = jobs.filter((j) => !j.lines.some((l) => /test:e2e/.test(l)));
  assert.ok(mainJobs.length > 0, 'ci.yml 没有主 job');
  for (const j of mainJobs) {
    assert.ok(!j.lines.some((l) => /continue-on-error/.test(l)), `主 job「${j.name}」里出现 continue-on-error`);
  }
});

test('.github/workflows/ci.yml：checkout 步骤带 fetch-depth: 0', () => {
  const lines = read('.github/workflows/ci.yml').split(/\r?\n/);
  const idxs = lines.map((l, i) => (/actions\/checkout/.test(l) ? i : -1)).filter((i) => i >= 0);
  assert.ok(idxs.length > 0, 'ci.yml 没有 actions/checkout');
  const ok = idxs.some((i) => {
    const stepStart = lines.findIndex((l, k) => k > i && /^\s*-\s/.test(l));
    const end = stepStart < 0 ? Math.min(lines.length, i + 8) : Math.min(stepStart, i + 8);
    return lines.slice(i, end).some((l) => /fetch-depth:\s*0\b/.test(l));
  });
  assert.ok(ok, 'actions/checkout 步骤未带 fetch-depth: 0');
});

test('tests/e2e/vertical-slice-smoke.test.mjs 存在，import 了 server-plugin/index.mjs', () => {
  assert.ok(exists(E2E), `缺 ${E2E}`);
  const text = read(E2E);
  assert.match(text, /(?:import\s[^;]*|import\()\s*['"][^'"]*server-plugin\/index\.mjs['"]/, '未 import server-plugin/index.mjs');
});

test('tests/e2e/vertical-slice-smoke.test.mjs 不含 mock（不区分大小写）、.skip、todo', () => {
  const text = read(E2E);
  assert.doesNotMatch(text, /mock/i, '含 mock');
  assert.ok(!text.includes('.skip'), '含 .skip');
  assert.doesNotMatch(text, /todo/i, '含 todo');
});

test('node --test tests/e2e/vertical-slice-smoke.test.mjs 退出码非 0 且输出含「未实现」', { timeout: 120000 }, () => {
  const r = spawnSync(process.execPath, ['--test', E2E], {
    cwd: ROOT_PATH,
    encoding: 'utf8',
    timeout: 90000,
    maxBuffer: 1 << 26,
  });
  const out = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
  assert.notEqual(r.status, 0, '红灯桩应以非 0 退出');
  assert.ok(out.includes('未实现'), `输出应含「未实现」，实际末段：\n${out.split(/\r?\n/).slice(-30).join('\n')}`);
});
