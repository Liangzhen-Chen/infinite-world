// 派活卡拼接（李白 11-18 19:08）：规矩全文＋===== 以下为本卡卡文 =====＋卡文＋卡尾，一处成型，派卡脚本只管调用。
// 规矩取自 docs/派活卡头规矩.md（命令行从 origin/master 读）；卡文若自带卡头，必须与现行全文逐字相同，否则拒派。
// 卡尾文字原样搬自仓库外派卡脚本（F:/dnd-tools/api/run-card-ds.sh），只把分支占位换成 <分支>。

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const CARD_DELIMITER = '===== 以下为本卡卡文 =====';
export const TAIL_TITLE = '===== 卡尾（派卡脚本自动附） =====';

const TAIL_BODY = '若本卡要提交：把回报（开头为卡头第三节八项自查表，每项填"是"并带证据）写进 docs/卡回报/<分支>.md，每次提交都随提交一并提交该文件（更新为当次实况）；提交关口会核这张表，缺表、缺项、任何一项为"否"都会拒绝提交（E-ACC-CARD-SELFCHECK）。只读核查卡不提交、不写此文件。';

const trimEndNewlines = (text) => String(text ?? '').replace(/\n+$/, '');

// 卡头标记：规矩文件第一行的标题文字（去掉行首 # 与括号里的批准日期等元信息）。
// 元信息会变，标题文字才是"卡文自带卡头"的识别依据；括号后变了也算不同卡头，交给逐字比对拒派。
function titleMarker(header) {
  const firstLine = header.split('\n', 1)[0].trim();
  const marker = firstLine.replace(/^#+\s*/, '').replace(/（.*$/, '').trim();
  return marker || firstLine;
}

export function composeCard(header, card, branch) {
  const head = trimEndNewlines(header);
  if (!head.trim()) throw new Error('派活卡头规矩为空，拒派');
  const body = trimEndNewlines(card);
  const br = String(branch ?? '').replace(/\//g, '-');

  const marker = titleMarker(head);
  let filled;
  if (marker && body.includes(marker)) {
    // 卡文自己带了卡头：只有与现行规矩全文逐字相同才放行，且不再拼第二份。
    if (!body.startsWith(head)) throw new Error('卡文自带的卡头与 docs/派活卡头规矩.md 不一致，拒派');
    filled = body;
  } else {
    filled = `${head}\n\n${CARD_DELIMITER}\n\n${body}`;
  }

  const prompt = `${filled}\n\n${TAIL_TITLE}\n${TAIL_BODY.replace('<分支>', br)}`;
  if (!prompt.startsWith(head)) throw new Error('拼接后卡文开头与卡头规矩不一致，拒派');
  return prompt;
}

function gitOut(wd, args) {
  return execFileSync('git', ['-C', wd, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

// 命令行：node tools/dispatch/compose-card.mjs <工作目录> <卡文文件>；拼好的提示打标准输出，任何一步取不到即非 0 退出。
function main(argv) {
  const [wd, cardFile] = argv;
  if (!wd || !cardFile) {
    process.stderr.write('用法: node tools/dispatch/compose-card.mjs <工作目录> <卡文文件>\n');
    process.exit(2);
  }
  let header;
  try {
    header = gitOut(wd, ['show', 'origin/master:docs/派活卡头规矩.md']);
  } catch {
    process.stderr.write('派活卡头规矩取不到（origin/master:docs/派活卡头规矩.md）\n');
    process.exit(2);
  }
  let branch;
  try {
    branch = gitOut(wd, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  } catch {
    process.stderr.write('分支名取不到（git rev-parse --abbrev-ref HEAD）\n');
    process.exit(2);
  }
  let card;
  try {
    card = readFileSync(cardFile, 'utf8');
  } catch {
    process.stderr.write(`提示文件不存在: ${cardFile}\n`);
    process.exit(2);
  }
  try {
    process.stdout.write(composeCard(header, card, branch));
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(2);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2));
}
