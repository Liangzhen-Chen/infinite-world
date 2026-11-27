// 验收：卡 chore/s2-sh（S2-SH 登记分片）：等价与读档。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s2sh；未参与写码与审卡。
// 依据：卷二:512–:513（加载期机器生成与冻结）、卷二十七:543（世界数据副本摘要 dataPacksDigest，规则层不读摘要）、卷二十七:740（复演）、卷二:972–:1016（存档路由与存档四路）；草案 §4、§8.1。
// 黑盒：真实 init（不 mock）；分片情形用 copyRepo 的临时副本，副本内的 index.mjs 读副本世界数据。期望值从主文件原文与 saveDigest 比对得出，不写死哈希。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import express from '../../support/express.mjs';
import { copyRepo, startHost, saveAt, loadAt, exportAt, unpack, act } from '../../support/wire-host.mjs';
import { testTempRoot, removeTempRoot } from '../../accept/temp-root.mjs';
import { writeTempRepoFile } from '../../../tools/accept/lib/temp-repo-write.mjs';
import { dataPacksDigestOf } from '../../../server-plugin/kernel/save.mjs';

const REPO = new URL('../../../', import.meta.url);
const REPO_PATH = fileURLToPath(REPO);
const MAIN_OWNERS_TEXT = readFileSync(new URL('world/ontology/state-owners.json', REPO), 'utf8');
// 探针分片：只含一条 rxNamespaces（只增内容、不被任何规则引用）。
const PROBE_SHARD = JSON.stringify({ rxNamespaces: [{ ns: 'zz.probe', type: 'number', entry: '探针', shape: '无', volume: '卷二:57' }] });
const SHARD_REL = 'world/ontology/state-owners.d/body.json';

const importPlugin = (dir) => import(pathToFileURL(join(dir, 'server-plugin', 'index.mjs')).href);

test('E-1 真实 init 起局：engine.dataPacksDigest 与「owners 换成主文件原文」重算值逐字相等', async () => {
  const root = testTempRoot('s2sh-eq-');
  try {
    const plugin = await import(new URL('server-plugin/index.mjs', REPO).href);
    const world = await plugin.init(express.Router(), { saveRoot: root });
    const { engine } = world;
    const recomputed = dataPacksDigestOf(engine, { ...engine.docData, owners: JSON.parse(MAIN_OWNERS_TEXT) });
    assert.equal(engine.dataPacksDigest, recomputed);
  } finally {
    removeTempRoot(root);
  }
});

test('E-2 零 mock 端到端冒烟（tests/e2e/vertical-slice-smoke.test.mjs）退出码 0', () => {
  // 去掉 NODE_TEST_CONTEXT：外层是 node --test 时，子进程的 --test 会被当成子测试上下文而不真跑（退出 0 但什么也没执行）。
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(process.execPath, ['--test', join(REPO_PATH, 'tests/e2e/vertical-slice-smoke.test.mjs')], { cwd: REPO_PATH, encoding: 'utf8', env, timeout: 540000 });
  assert.match(String(r.stdout), /^ℹ pass 1$/m, `冒烟子进程未实际跑出 1 条通过：${String(r.stdout).slice(-400)}`);
  assert.equal(r.status, 0, `冒烟未过：${String(r.stdout).slice(-800)}${String(r.stderr).slice(-400)}`);
});

test('E-3 磁盘上存在分片时，init 装配的 owners 含分片内容，且 dataPacksDigest 与无分片时不同', async () => {
  const { root, repo } = copyRepo();
  const saveRoot = testTempRoot('s2sh-eq-save-');
  try {
    const plain = await (await importPlugin(repo)).init(express.Router(), { saveRoot });
    const plainDigest = plain.engine.dataPacksDigest;
    writeTempRepoFile(root, `repo/${SHARD_REL}`, PROBE_SHARD);
    const sharded = await (await importPlugin(repo)).init(express.Router(), { saveRoot });
    assert.ok(sharded.engine.docData.owners.rxNamespaces.some((x) => x.ns === 'zz.probe'), '分片内容未进入装配的 owners');
    assert.notEqual(sharded.engine.dataPacksDigest, plainDigest, '分片改变了世界数据，dataPacksDigest 应随之变化');
  } finally {
    removeTempRoot(saveRoot);
    removeTempRoot(root);
  }
});

test('E-4 带分片的世界：存槽→导出→读档→再存，saveDigest 逐字节一致（读档取存档内的合并结果）', async () => {
  const { root, repo } = copyRepo();
  let h = null;
  try {
    writeTempRepoFile(root, `repo/${SHARD_REL}`, PROBE_SHARD);
    const plugin = await importPlugin(repo);
    h = await startHost({ plugin, saveRoot: root });
    const B = h.base;
    // S1-3d 起 species 必填（候选为可扮演物种），这里取候选下标 0。
    const a = await act(B, 'act_choose_origin', { species: 0, origin: 0, place: 0 });
    assert.equal(a.json?.result, 'ok', `act_choose_origin 未 ok：${a.text}`);
    const s1 = await saveAt(B, 1);
    assert.equal(s1.json?.result, 'ok', `存槽 1 未 ok：${s1.text}`);
    const d1 = unpack((await exportAt(B, 1)).buf).manifest.saveDigest;
    const l1 = await loadAt(B, 1);
    assert.equal(l1.json?.result, 'ok', `读档 slot 1 未 ok：${l1.text}`);
    const s2 = await saveAt(B, 2);
    assert.equal(s2.json?.result, 'ok', `读档后存槽 2 未 ok：${s2.text}`);
    assert.equal(unpack((await exportAt(B, 2)).buf).manifest.saveDigest, d1, '读档后再存的 saveDigest 应与读档前存档逐字节相同');
  } finally {
    if (h) await h.close();
    removeTempRoot(root);
  }
});
