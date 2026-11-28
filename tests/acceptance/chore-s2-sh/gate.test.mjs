// 验收：卡 chore/s2-sh（S2-SH 登记分片）：工具一致与门禁读合并结果。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s2sh；未参与写码与审卡。
// 依据：卷二:763（总登记表 entries 与 file 字段，状态快照与入口接通率由它派生）、卷二:811（dimension 路径须按 keyKinds 取表头，缺 keyKinds 即违例）、卷十二:468（门禁基线分量，违例只经执行器计）、卷二:57（state-owners 系统声明表）。
// 黑盒：真实仓库 CLI（退出码与标准输出）；注入类用例在 withIsolatedRepo 的 HEAD 干净副本里做（不碰工作区），新增失败 = 注入后出现而基线没有的 (itemKey, code) 对。
// 改动理由（master CI 运行 46079982717 红在 G-1）：G-1 原先在同一 HEAD 上先生成快照再 --check，HEAD 为合并提交时两边必不一致；现改为生成后恢复已提交快照再检查，门槛不降，生成器不改。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { withIsolatedRepo, runGate } from '../../support/isolated-repo.mjs';
import { writeTempRepoFile } from '../../../tools/accept/lib/temp-repo-write.mjs';

const TIMEOUT = 900000;


// 失败条目展开为 (itemKey, code) 对（与 chore-detector-harden 同口径）。
const failPairs = (report) => {
  assert.ok(report && report.items && Array.isArray(report.items.failed), 'JSON 报告须含 items.failed 数组');
  return new Set(report.items.failed.flatMap((f) => (f.codes ?? []).map((c) => `${f.itemKey}|${c}`)));
};

test('G-1 干净 HEAD 副本内生成快照退出 0；恢复已提交快照后 --check 退出 0（不依赖刚生成的文件）', { timeout: TIMEOUT }, async () => {
  // 生成模式把 HEAD 本身当基准，检查模式只取 HEAD 的各父提交（S2-GOV Q3 裁定，生成器是对的）。
  // 同一 HEAD 上「先生成再检查」在合并提交（带「角色：合并」）处必不一致，所以生成后先把副本里的快照恢复成已提交版本，再检查。
  // 运行号 46079982717：master CI 红在本例，根因即此。
  await withIsolatedRepo(async (copyRoot) => {
    const gen = spawnSync(process.execPath, [join(copyRoot, 'tools/gen-status-snapshot.mjs')], { cwd: copyRoot, encoding: 'utf8', timeout: TIMEOUT });
    assert.equal(gen.status, 0, `生成快照未过：${String(gen.stderr).slice(-300)}`);
    execFileSync('git', ['checkout', '--', 'docs/状态快照.generated.md'], { cwd: copyRoot, stdio: 'ignore' });
    const chk = spawnSync(process.execPath, [join(copyRoot, 'tools/gen-status-snapshot.mjs'), '--check'], { cwd: copyRoot, encoding: 'utf8', timeout: TIMEOUT });
    assert.equal(chk.status, 0, `已提交快照 --check 未过：${String(chk.stdout).slice(-500)}${String(chk.stderr).slice(-300)}`);
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
