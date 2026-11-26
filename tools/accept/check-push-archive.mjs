// 主会话给卡分支自查用（已入库）：在卡分支工作区按推送阶段口径重跑卡档案检查，不需要管道。
// 用法：node tools/accept/check-push-archive.mjs <工作区> <卡分支名> [合并者标识] [--stage 提交|推送] [--only <文件>[,<文件>]]
// 默认做法：照 PR 真合并后的样子，把本分支相对 origin/master 的改动当作一个「角色：合并」的合并提交（isMerge 为真），按推送阶段核档案（不跑 pre_commit，那个另跑）。
// 合并者标识缺省 main-session-opus55（第三个可选参数可覆盖）。
// 派前自检（门禁封口卡 A）：--only 派卡.md 只查列出的文件（读工作区磁盘，git add 之前就能跑），--stage 提交 按提交阶段口径；引用照常核实。
// 规矩一律取 origin/master 版（防止分支自己改弱规矩）。
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const pos = [];
const opt = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--stage' || argv[i] === '--only') { opt[argv[i].slice(2)] = argv[++i]; continue; }
  pos.push(argv[i]);
}
const [wt, branch, mergerId] = pos;
const stage = opt.stage === undefined ? '推送' : opt.stage;
const only = opt.only === undefined ? null : String(opt.only).split(',').map((s) => s.trim()).filter(Boolean);
if (!wt || !branch || (stage !== '提交' && stage !== '推送') || (only && !only.length)) {
  console.error('usage: node check-push-archive.mjs <worktree> <branch> [merger-id] [--stage 提交|推送] [--only <file>[,<file>]]');
  process.exit(2);
}
const git = (args) => execFileSync('git', ['-C', wt, ...args], { encoding: 'utf8', maxBuffer: 1 << 28 });
const { loadRules, judgeCommit, checkArchive, archiveDirOf } = await import(pathToFileURL(join(wt, 'tools/accept/lib/card-archive.mjs')).href);
const { gitRepo, fsRepo } = await import(pathToFileURL(join(wt, 'tools/accept/commit-hook.mjs')).href);
const doc = git(['show', 'origin/master:docs/派活卡头规矩.md']);
const loaded = loadRules(doc);
if (loaded.error) { console.error(loaded.error); process.exit(1); }
const rules = loaded.rules;

let reasons;
if (only) {
  const dir = archiveDirOf(rules, branch);
  const repo = fsRepo(wt);
  reasons = checkArchive(rules, (f) => repo.read(`${dir}${f}`), null, stage, repo, { only, dir }).map((r) => `${dir}：${r}`);
} else {
  const head = git(['rev-parse', 'HEAD']).trim();
  const files = git(['diff', '--name-only', '-z', 'origin/master...HEAD']).split('\0').filter(Boolean);
  const message = `卡分支：${branch}\n角色：合并\n标识：${mergerId || 'main-session-opus55'}\n`;
  reasons = judgeCommit(rules, {
    files, branch: null, message, isMerge: true, stage,
    rangeFiles: files,
    headBranch: branch,
    history: {
      reachable: (s) => { try { git(['merge-base', '--is-ancestor', s, head]); return true; } catch { return false; } },
      message: (s) => { try { return git(['log', '-1', '--format=%B', s]); } catch { return null; } },
    },
    repo: gitRepo(wt, head),
    readFile: (dir, f) => { try { return git(['show', `${head}:${dir}${f}`]); } catch { return null; } },
  });
}
if (reasons.length) { for (const r of reasons) console.log(r); console.log(`archive_${stage === '推送' ? 'push' : 'commit'} rejected (${reasons.length})`); process.exit(1); }
console.log(`archive_${stage === '推送' ? 'push' : 'commit'} pass`);
