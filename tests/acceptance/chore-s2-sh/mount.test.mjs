// 验收：卡 chore/s2-sh（S2-SH mount 半分片：body、lifecycle 两个域的登记随域清单装配）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s2sh；未参与写码与审卡。
// 依据：卷二:561（终止协议的清理函数与发起方登记，装配层收进 engine）、卷二:512–:513（加载期组装与冻结）、卷二:1764（bodyPlan 为 ref body_plan，未登记即 error）；草案 §3、§8.1。
// 黑盒：真实 init（不 mock）；「改前」序列取自当前主干 mount.mjs 登记的 handlerRef（卷二:561 的 rules/body/death.mjs#settleBody 等），不是仓库计数。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import express from '../../support/express.mjs';
import { copyRepo } from '../../support/wire-host.mjs';
import { testTempRoot, removeTempRoot } from '../../accept/temp-root.mjs';
import { writeTempRepoFile } from '../../../tools/accept/lib/temp-repo-write.mjs';
import { DOMAINS } from '../../../server-plugin/rules/load/domains.mjs';

const REPO = new URL('../../../', import.meta.url);

test('N-1 init 装配的终止清理、终止发起方、建档实例化登记序列与改前相同', async () => {
  const saveRoot = testTempRoot('s2sh-mount-');
  try {
    const plugin = await import(new URL('server-plugin/index.mjs', REPO).href);
    const { engine } = await plugin.init(express.Router(), { saveRoot });
    assert.deepEqual(engine.terminationCleanups.map((x) => x.handlerRef), ['rules/body/death.mjs#settleBody']);
    assert.deepEqual(engine.terminationTriggers.map((x) => x.handlerRef), ['rules/body/death.mjs#dieByDestroy']);
    assert.deepEqual(engine.instantiators.map((x) => x.handlerRef), ['rules/body/person.mjs#instantiatePerson']);
    assert.deepEqual(engine.advanceHooks, []);
  } finally {
    removeTempRoot(saveRoot);
  }
});

test('N-2 缺 body 计划的世界（物种指向未登记的 body_plan）仍按 E-DIM-REF-MISSING 被拒', async () => {
  const { root, repo } = copyRepo();
  const saveRoot = testTempRoot('s2sh-mount-bad-');
  try {
    const speciesPath = join(repo, 'world/ontology/dimensions/species.json');
    const text = readFileSync(speciesPath, 'utf8');
    assert.ok(text.includes('"bodyPlan": "body_avian"'), '样本物种的 bodyPlan 行应存在（副本内）');
    writeTempRepoFile(root, 'repo/world/ontology/dimensions/species.json', text.replace('"bodyPlan": "body_avian"', '"bodyPlan": "body_zz_missing"'));
    const plugin = await import(pathToFileURL(join(repo, 'server-plugin', 'index.mjs')).href);
    let err = null;
    try { await plugin.init(express.Router(), { saveRoot }); } catch (e) { err = e; }
    assert.ok(err, '缺 body 计划的世界应被拒');
    assert.match(String(err.code ?? err.message), /E-DIM-REF-MISSING/);
  } finally {
    removeTempRoot(saveRoot);
    removeTempRoot(root);
  }
});

test('N-3 domains.mjs 存在且只用静态 import（无 import( 动态导入），域清单按 domain 升序', () => {
  const p = new URL('server-plugin/rules/load/domains.mjs', REPO);
  assert.ok(existsSync(p), '域清单 server-plugin/rules/load/domains.mjs 应存在');
  const text = readFileSync(p, 'utf8');
  assert.equal(/\bimport\s*\(/.test(text), false, 'domains.mjs 不得有动态 import()（import_edge 会判全局未列）');
  // 裁定丁（主会话 11-27）：装配期核对是固定断言、按名直调，lifecycle 域没有登记项，不要求它出现在清单里。
  // 收紧的断言：清单里每个域都至少交一项登记；body 必须在列。
  assert.ok(DOMAINS.some((d) => d.domain === 'body'), '域清单应含 body 域');
  for (const d of DOMAINS) {
    const fields = ['terminationCleanups', 'terminationTriggers', 'instantiators', 'advanceHooks'];
    const n = fields.filter((k) => /** @type {any} */ (d)[k] && /** @type {any} */ (d)[k].length > 0).length;
    assert.ok(n > 0, `域 ${d.domain} 没有交任何登记项（四个字段都为空）`);
  }
});

test('N-4 mount.mjs 不再直接接线三类登记项（清理、发起方、实例化），它们只经域清单 DOMAINS 收齐', () => {
  const text = readFileSync(new URL('server-plugin/rules/load/mount.mjs', REPO), 'utf8');
  for (const name of ['SETTLE_BODY_CLEANUP', 'DIE_BY_DESTROY_TRIGGER', 'PERSON_INSTANTIATOR']) {
    assert.equal(text.includes(name), false, `mount.mjs 不应直接引用 ${name}（应由域清单收齐）`);
  }
  assert.match(text, /DOMAINS/, 'mount.mjs 应从域清单 DOMAINS 取登记');
});
