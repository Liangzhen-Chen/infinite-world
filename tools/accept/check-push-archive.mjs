// 主会话给卡分支自查用（已入库）：在卡分支工作区按推送阶段口径重跑卡档案检查，不需要管道。
// 用法：node tools/accept/check-push-archive.mjs <工作区> <卡分支名> [合并者标识]
// 做法：照 squash 合并后主会话提交的样子，把本分支相对 origin/master 的改动当作一个「角色：合并」提交，按推送阶段核档案（不跑 pre_commit，那个另跑）。
// 合并者标识缺省 main-session-opus55（第三个可选参数可覆盖）。
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const [wt, branch, mergerId] = process.argv.slice(2);
if (!wt || !branch) { console.error('usage: node check-push-archive.mjs <worktree> <branch> [merger-id]'); process.exit(2); }
const git = (args) => execFileSync('git', ['-C', wt, ...args], { encoding: 'utf8', maxBuffer: 1 << 28 });
const { loadRules, judgeCommit } = await import(pathToFileURL(join(wt, 'tools/accept/lib/card-archive.mjs')).href);
const { gitRepo } = await import(pathToFileURL(join(wt, 'tools/accept/commit-hook.mjs')).href);
const doc = git(['show', 'origin/master:docs/派活卡头规矩.md']);
const loaded = loadRules(doc);
if (loaded.error) { console.error(loaded.error); process.exit(1); }
const head = git(['rev-parse', 'HEAD']).trim();
const files = git(['diff', '--name-only', '-z', 'origin/master...HEAD']).split('\0').filter(Boolean);
const message = `卡分支：${branch}\n角色：合并\n标识：${mergerId || 'main-session-opus55'}\n`;
const reasons = judgeCommit(loaded.rules, loaded.questions, {
  files, branch: null, message, isMerge: false, stage: '推送',
  repo: gitRepo(wt, head),
  readFile: (dir, f) => { try { return git(['show', `${head}:${dir}${f}`]); } catch { return null; } },
});
if (reasons.length) { for (const r of reasons) console.log(r); console.log(`archive_push rejected (${reasons.length})`); process.exit(1); }
console.log('archive_push pass');
