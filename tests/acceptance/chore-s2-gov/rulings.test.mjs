// 验收：卡 chore/s2-gov：现行有效裁定.json 同步 11-26 拍板、删被推翻条目、CLAUDE.md 行号引用不漂移。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-gov；未参与写码与审卡。
// 依据：CLAUDE.md:8（③ 生效裁定 废止即删、不追流水账）；docs/PLAN.md:67（S2-GOV 范围：11-26 裁定同步进现行有效裁定.json）。
// 黑盒：读工作区 JSON 与基线提交 6413e8a47 的 JSON（git show），只看数据，不 import 实现模块。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const BASE = '6413e8a47';
const REL = 'docs/审查/现行有效裁定.json';
const now = () => JSON.parse(readFileSync(join(ROOT, REL), 'utf8'));
const was = () => JSON.parse(execFileSync('git', ['show', `${BASE}:${REL}`], { cwd: ROOT, encoding: 'utf8' }));
const ids = (doc) => new Set(doc.rulings.map((r) => r.id));
const fileLines = (rel) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n').split('\n');

// 依据：CLAUDE.md:8；测的是什么：现行有效裁定.json 能解析，且每条都有 id、source；测试位置：tests/acceptance/chore-s2-gov/rulings.test.mjs:20
test('现行有效裁定.json 可解析，条目有 id 与 source', () => {
  const doc = now();
  assert.ok(Array.isArray(doc.rulings));
  for (const r of doc.rulings) {
    assert.equal(typeof r.id, 'string');
    assert.equal(typeof r.source, 'string', `${r.id} 缺 source`);
  }
});

// 依据：docs/PLAN.md:67；测的是什么：相对基线新增的条目，source 指向的「文件:行」存在，且该行含 11-26 或 11-27 的拍板日期；测试位置：tests/acceptance/chore-s2-gov/rulings.test.mjs:30
test('新增条目的 source 指向存在的文件:行，且该行含拍板日期', () => {
  const added = now().rulings.filter((r) => !ids(was()).has(r.id));
  assert.ok(added.length > 0, '没有新增 11-26 拍板条目');
  for (const r of added) {
    const m = /^(.+):(\d+)$/.exec(r.source);
    assert.ok(m, `${r.id} 的 source 不是「文件:行」：${r.source}`);
    const [, file, num] = m;
    assert.ok(existsSync(join(ROOT, file)), `${r.id} 指向的文件不存在：${file}`);
    const line = fileLines(file)[Number(num) - 1];
    assert.ok(line !== undefined, `${r.id} 指向的行号越界：${r.source}`);
    assert.match(line, /11-2[67]/, `${r.id} 指向的行不含拍板日期：${r.source}`);
  }
});

// 依据：CLAUDE.md:8；测的是什么：所有写「CLAUDE.md:N」的条目，N 行不是空行也不是标题行；测试位置：tests/acceptance/chore-s2-gov/rulings.test.mjs:45
test('CLAUDE.md:N 引用指向非空、非标题行', () => {
  for (const r of now().rulings) {
    const m = /^CLAUDE\.md:(\d+)$/.exec(r.source);
    if (!m) continue;
    const line = fileLines('CLAUDE.md')[Number(m[1]) - 1];
    assert.ok(line !== undefined && line.trim() !== '' && !line.trimStart().startsWith('#'), `${r.id} 指向的 CLAUDE.md:${m[1]} 是空行或标题：${JSON.stringify(line)}`);
  }
});

// 依据：CLAUDE.md:8；测的是什么：被后文推翻的「裁定1124b」「审批闸门5元-1109」已从生效裁定里删除，且两条 id 都记在 K1125-QUOTA、K1125-COST 的 supersedes 里；测试位置：tests/acceptance/chore-s2-gov/rulings.test.mjs:55
test("被推翻的旧条目已删，新裁定记下 supersedes", () => {
  const doc = now();
  const cur = ids(doc);
  const gone = ["裁定1124b", "审批闸门5元-1109"];
  for (const g of gone) assert.ok(!cur.has(g), g + " 仍在生效裁定里");
  const byId = Object.fromEntries(doc.rulings.map((r) => [r.id, r]));
  const recorded = new Set();
  for (const newer of ["K1125-QUOTA", "K1125-COST"]) {
    assert.ok(byId[newer], "缺 " + newer);
    for (const s of byId[newer].supersedes || []) recorded.add(s);
  }
  // 记法：id 后可跟一句说明（如「裁定1124b（已删，…）」），按「含该 id」判定。
  for (const g of gone) assert.ok([...recorded].some((s) => s.includes(g)), g + " 未记入 K1125-QUOTA/K1125-COST 的 supersedes");
});
