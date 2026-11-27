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

// 去掉 JS 的 // 与 /* */ 注释；字符串与模板字面量内的 // 与 /* 不算注释。
function stripJsComments(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '"' || c === "'" || c === '`') {
      out += c;
      i++;
      while (i < src.length && src[i] !== c) {
        if (src[i] === '\\') { out += src[i] + (src[i + 1] ?? ''); i += 2; continue; }
        out += src[i];
        i++;
      }
      if (i < src.length) { out += src[i]; i++; }
      continue;
    }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end < 0 ? src.length : end + 2;
      out += ' ';
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

// 在去注释的基础上，把字符串字面量内容清空（保留引号），用于判断代码本体是否含替身用法；
// 测试标题里的「零 mock」字样是文字，不是替身。
function codeOnly(src) {
  const s = stripJsComments(src);
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '"' || c === "'" || c === '`') {
      out += c;
      i++;
      while (i < s.length && s[i] !== c) {
        if (s[i] === '\\') { i += 2; continue; }
        i++;
      }
      out += c;
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
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

test('.github/workflows/ci.yml：跑 test:e2e 的 job 是主 job（main），且不带 continue-on-error（烟测必过）', () => {
  const jobs = parseJobs(read('.github/workflows/ci.yml'));
  const e2eJobs = jobs.filter((j) => j.lines.some((l) => /test:e2e/.test(l)));
  assert.ok(e2eJobs.length > 0, 'ci.yml 没有任何 job 跑 test:e2e');
  assert.ok(e2eJobs.some((j) => j.name === 'main'), '跑 test:e2e 的 job 应为主 job（main）');
  for (const j of e2eJobs) {
    assert.ok(!j.lines.some((l) => /continue-on-error/.test(l)), `跑 test:e2e 的 job「${j.name}」不得带 continue-on-error`);
  }
});

test('.github/workflows/ci.yml：主 job（main）跑 test:e2e 且无 continue-on-error', () => {
  const jobs = parseJobs(read('.github/workflows/ci.yml'));
  const main = jobs.find((j) => j.name === 'main');
  assert.ok(main, 'ci.yml 缺主 job main');
  assert.ok(main.lines.some((l) => /test:e2e/.test(l)), '主 job 必须跑 test:e2e');
  assert.ok(!main.lines.some((l) => /continue-on-error/.test(l)), '主 job 不得带 continue-on-error');
});

test('.github/workflows/ci.yml：无 e2e-observe 红灯观测 job（烟测已升格进主 job）', () => {
  const jobs = parseJobs(read('.github/workflows/ci.yml'));
  assert.ok(!jobs.some((j) => j.name === 'e2e-observe'), '不得再有 e2e-observe job');
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
  const code = stripJsComments(read(E2E));
  assert.ok(code.includes('server-plugin/index.mjs'), '未引用 server-plugin/index.mjs 路径');
  assert.ok(/\bimport\s*\(/.test(code) || /^\s*import\s/m.test(code), '路径串所在文件无 import( 或 import 语句');
});

test('tests/e2e/vertical-slice-smoke.test.mjs 不含 mock（不区分大小写）、.skip、todo（先去注释）', () => {
  const src = read(E2E);
  const code = codeOnly(src);
  assert.doesNotMatch(code, /mock/i, '代码中含 mock（字符串字面量与注释已排除）');
  assert.doesNotMatch(stripJsComments(src), /(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"][^'"]*mock/i, 'import 说明符指向 mock 模块');
  assert.ok(!code.includes('.skip'), '含 .skip');
  assert.doesNotMatch(code, /\btest\.todo\b|\{\s*todo\b/, '含 test.todo 或 { todo');
});

test('node --test tests/e2e/vertical-slice-smoke.test.mjs 退出码为 0 且输出不含「未实现」（烟测六步全绿）', { timeout: 120000 }, () => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(process.execPath, ['--test', E2E], {
    cwd: ROOT_PATH,
    env,
    encoding: 'utf8',
    timeout: 90000,
    maxBuffer: 1 << 26,
  });
  const out = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
  assert.equal(r.status, 0, `烟测应全绿，实际末段：\n${out.split(/\r?\n/).slice(-30).join('\n')}`);
  assert.ok(!out.includes('未实现'), '烟测输出不应含「未实现」');
});
