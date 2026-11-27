// 验收：卡 chore/s2-sh（S2-SH 登记分片）：工具一致与门禁读合并结果。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s2sh；未参与写码与审卡。
// 依据：卷二:763（总登记表 entries 与 file 字段，状态快照与入口接通率由它派生）、卷二:811（dimension 路径须按 keyKinds 取表头，缺 keyKinds 即违例）、卷十二:468（门禁基线分量，违例只经执行器计）、卷二:57（state-owners 系统声明表）。
// 黑盒：真实仓库 CLI（退出码与标准输出）；注入类用例在 withIsolatedRepo 的 HEAD 干净副本里做（不碰工作区），新增失败 = 注入后出现而基线没有的 (itemKey, code) 对。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { withIsolatedRepo, runGate } from '../../support/isolated-repo.mjs';
import { writeTempRepoFile } from '../../../tools/accept/lib/temp-repo-write.mjs';

const TIMEOUT = 900000;


// 失败条目展开为 (itemKey, code) 对（与 chore-detector-harden 同口径）。
const failPairs = (report) => {
  assert.ok(report && report.items && Array.isArray(report.items.failed), 'JSON 报告须含 items.failed 数组');
  return new Set(report.items.failed.flatMap((f) => (f.codes ?? []).map((c) => `${f.itemKey}|${c}`)));
};

test('G-1 临时仓库内先生成状态快照，再 gen-status-snapshot --check 退出 0（不依赖工作区快照现状）', { timeout: TIMEOUT }, async () => {
  // 夹具先生成快照（工作区快照可能因暂存的卡档案未重生成而不符，那不是本卡问题）；生成后 --check 必须绿。
  await withIsolatedRepo(async (copyRoot) => {
    const gen = spawnSync(process.execPath, [join(copyRoot, 'tools/gen-status-snapshot.mjs')], { cwd: copyRoot, encoding: 'utf8', timeout: TIMEOUT });
    assert.equal(gen.status, 0, `生成快照未过：${String(gen.stderr).slice(-300)}`);
    const chk = spawnSync(process.execPath, [join(copyRoot, 'tools/gen-status-snapshot.mjs'), '--check'], { cwd: copyRoot, encoding: 'utf8', timeout: TIMEOUT });
    assert.equal(chk.status, 0, `刚生成的快照 --check 未过：${String(chk.stdout).slice(-500)}${String(chk.stderr).slice(-300)}`);
  });
});

// 硬问题计数：entry-registry --check 标准输出里形如「名称：N（…）」的行（跳过「总登记表 …」摘要行）。
const hardProblemCounts = (out) => {
  const m = new Map();
  for (const line of String(out).split('\n')) {
    const hit = /^([^：\n]+?)：(\d+)/.exec(line);
    if (hit && !hit[1].startsWith('总登记表')) m.set(hit[1], Number(hit[2]));
  }
  return m;
};

test('G-2 分片前后 entry-registry --check 的各项硬问题计数相同（同一夹具先算基准，不写死数字）', { timeout: TIMEOUT }, async () => {
  // 主干上 --check 本就因既有硬问题退出 1（不在 CI），故不断言退出码；断言的是：空分片不增加、不改变任何一项的硬问题计数。
  await withIsolatedRepo(async (copyRoot) => {
    const check = () => spawnSync(process.execPath, [join(copyRoot, 'tools/entry-registry.mjs'), '--check'], { cwd: copyRoot, encoding: 'utf8', maxBuffer: 1 << 28, timeout: TIMEOUT }).stdout;
    const before = hardProblemCounts(check());
    assert.ok(before.size > 0, '基准输出应能解析出硬问题计数行（格式变了须同步此解析）');
    writeTempRepoFile(copyRoot, 'tools/accept/entry-registry.d/zz.json', JSON.stringify({ entries: [] }));
    const after = hardProblemCounts(check());
    assert.deepEqual([...after].sort(), [...before].sort(), '空分片改变了硬问题计数');
  });
});

test('G-3 pre_commit 在 HEAD 干净副本上 verdict 为 pass（无分片，违例零净增）', { timeout: TIMEOUT }, async () => {
  await withIsolatedRepo(async (copyRoot) => {
    const report = runGate(copyRoot);
    assert.equal(report.verdict, 'pass', `pre_commit 未 pass：${JSON.stringify(report.items?.failed ?? []).slice(0, 600)}`);
  });
});

test('G-4 注入分片登记的违例（状态键挂资源单位 piece）：pre_commit 新增失败，锚点在分片文件', { timeout: TIMEOUT }, async () => {
  await withIsolatedRepo(async (copyRoot) => {
    const basePairs = failPairs(runGate(copyRoot));
    // 分片登记一条挂资源单位 piece（economyResources 行）且非应付的状态键：门禁按命中计违例（dimension 缺 keyKinds 只是参数错，不计入）。主文件里没有它。
    writeTempRepoFile(copyRoot, 'world/ontology/state-owners.d/body.json', JSON.stringify({ pathTypes: { 'zz-probe.*': 'integer:piece' } }));
    const after = runGate(copyRoot);
    const added = [...failPairs(after)].filter((p) => !basePairs.has(p));
    assert.ok(added.length > 0, '分片里的违例未被门禁读到（门禁仍只读主文件）');
    assert.ok(JSON.stringify(after).includes('state-owners.d/body.json'), '违例锚点应指向分片文件 world/ontology/state-owners.d/body.json');
  });
});

test('G-5 注入一个空的 entry-registry 分片：entry-registry --check 的标准输出与无分片时逐字相同（分片本身不改变结论）', { timeout: TIMEOUT }, async () => {
  // 不依赖 --check 的退出码（主干上它已因既有硬问题为非 0，见 G-2 的说明）：比较有无空分片两次输出是否相同。
  await withIsolatedRepo(async (copyRoot) => {
    const check = () => spawnSync(process.execPath, [join(copyRoot, 'tools/entry-registry.mjs'), '--check'], { cwd: copyRoot, encoding: 'utf8', maxBuffer: 1 << 28, timeout: TIMEOUT }).stdout;
    const before = String(check());
    writeTempRepoFile(copyRoot, 'tools/accept/entry-registry.d/zz.json', JSON.stringify({ entries: [] }));
    const after = String(check());
    assert.equal(after, before, '空分片改变了 --check 的标准输出');
  });
});
