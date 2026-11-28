// S2-TP1 黑盒验收：规则层不硬编码、不落解锁字段（AGENTS.md 红线；卷十五 A15-15.1）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-tp1。
// 依据与每条测的是什么见 docs/卡档案/feat-s2-tp1/出题.md。扫描只看本卡新增的规则层文件（清单由存在性推出，缺文件即报错）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as S from './support.mjs';

// 本卡规则层文件：polity 目录、travel 下的 circle*.mjs、economy 下的 org-endow.mjs（draft-s2-tp §4 落点）。
function ruleFilesOf(root) {
  const out = [];
  const polity = join(root, 'server-plugin/rules/polity');
  if (existsSync(polity)) for (const f of readdirSync(polity)) if (f.endsWith('.mjs')) out.push(join(polity, f));
  const travel = join(root, 'server-plugin/rules/travel');
  if (existsSync(travel)) for (const f of readdirSync(travel)) if (/^circle.*\.mjs$/.test(f)) out.push(join(travel, f));
  const endow = join(root, 'server-plugin/rules/economy/org-endow.mjs');
  if (existsSync(endow) && statSync(endow).isFile()) out.push(endow);
  return out;
}
// 去掉注释后的源码（只看代码，不看说明文字）。
const codeOnly = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

test('8a. 规则层字面量：本卡新增的规则层代码里，字符串字面量不含 crule_ / org_ / loc_ / bld_ / fac_ 等 id 前缀', async () => {
  const files = ruleFilesOf(S.ROOT);
  assert.ok(files.length > 0, '前提：应有本卡新增的规则层文件（polity 或 travel/circle* 或 economy/org-endow）');
  const hits = [];
  for (const f of files) {
    const src = codeOnly(readFileSync(f, 'utf8'));
    for (const m of src.matchAll(/(['"`])([^'"`\n]*)\1/g)) {
      if (/\b(crule_|org_|loc_|bld_|fac_)/.test(m[2])) hits.push(`${f}: ${m[2]}`);
    }
  }
  assert.deepEqual(hits, [], `规则层字面量违例：${hits.join(' | ')}`);
});

test('8b. 无解锁字段：本卡新增的规则层代码里没有「已解锁」「可传送标记」类的状态字段名（卷十五 A15-15.1：字段数 0）', async () => {
  const files = ruleFilesOf(S.ROOT);
  assert.ok(files.length > 0, '前提：应有本卡新增的规则层文件');
  const hits = [];
  for (const f of files) {
    const src = codeOnly(readFileSync(f, 'utf8'));
    if (/已解锁|unlock|可传送标记|teleportMark|travelMark/i.test(src)) hits.push(f);
  }
  assert.deepEqual(hits, [], `出现解锁类字段名的文件：${hits.join(',')}`);
});
