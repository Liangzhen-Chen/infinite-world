// 状态快照生成器（docs/gemini/kickoff-1125.md:485 L-11）：把 git 提交、入口接通率、门禁基线与在途卡渲染成 ≤80 行的只读快照。
// 唯一渲染入口 renderSnapshot(inputs) 是纯函数；CLI 只按 process.cwd() 读盘、跑 git、写文件。
// 不读墙钟（kickoff-1125.md:399）：生成基准的提交时间只取自 git，同一提交上两次生成逐字节相同。

import { existsSync, readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { writeCliOut } from './accept/lib/cli-out.mjs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// 段名、行数上限、截断长度、受检段起点集中在这里，别处不再写字面量（卡文「不写死」）。
const SNAPSHOT_TITLE = '# 状态快照（机器生成，禁止手改）';
const MAX_LINES = 80;
const MAX_COMMITS = 10;
const SUBJECT_MAX_CHARS = 60;
const SNAPSHOT_PATH = 'docs/状态快照.generated.md';
const CARD_ARCHIVE_DIR = 'docs/卡档案';
const CARD_TEMPLATE_DIR = '_template';
const REGISTRY_PATH = 'tools/accept/entry-registry.json';
const BASELINE_PATH = 'tools/accept/baseline.json';
const SECTION_HEAD = '## 生成基准';
const SECTION_COMMITS = '## 最近提交';
const SECTION_REGISTRY = '## 入口接通';
const SECTION_BASELINE = '## 门禁基线';
const SECTION_CARDS = '## 在途卡';
// 受检段从「入口接通」起到文末；「生成基准」「最近提交」不受检（提交快照本身就会让 HEAD 与提交列表变化）。
const CHECKED_HEADING = SECTION_REGISTRY;

const missing = (what) => `（缺：${what}）`;
const compareText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const truncateChars = (text, max) => {
  const chars = Array.from(String(text));
  return chars.length > max ? chars.slice(0, max).join('') : chars.join('');
};

function commitLine(commit) {
  if (!commit || typeof commit !== 'object') return missing('commit');
  if (!commit.sha) return missing('sha');
  if (!commit.subject) return missing('subject');
  return `${commit.sha} ${truncateChars(commit.subject, SUBJECT_MAX_CHARS)}`;
}

function registryLine(registry) {
  if (!registry || typeof registry !== 'object') return missing(REGISTRY_PATH);
  if (!Array.isArray(registry.entries)) return missing('entries');
  const total = registry.entries.length;
  const wired = registry.entries.filter((entry) => entry && typeof entry.file === 'string' && entry.file.trim() !== '').length;
  const rate = total === 0 ? 0 : Math.floor((wired / total) * 100);
  return `- 条目总数 ${total}；file 非空 ${wired}；接通率 ${rate}%`;
}

function baselineLine(baseline) {
  if (!baseline || typeof baseline !== 'object') return missing(BASELINE_PATH);
  if (!Array.isArray(baseline.rows)) return missing('rows');
  let sum = 0;
  let unlocked = 0;
  for (const row of baseline.rows) {
    if (!row || typeof row !== 'object' || typeof row.current !== 'number' || Number.isNaN(row.current)) return missing('current');
    sum += row.current;
    if (row.locked !== true) unlocked += 1;
  }
  return `- 分量总数 ${baseline.rows.length}；current 之和 ${sum}；未锁定 ${unlocked}`;
}

function cardName(card) {
  return card && typeof card.card === 'string' ? card.card : '';
}

function cardLine(card) {
  if (!card || typeof card !== 'object') return missing('state.json');
  const absent = ['card', 'phase', 'failCount', 'nextAction']
    .filter((key) => card[key] === undefined || card[key] === null || card[key] === '');
  if (absent.length) return missing(absent.join('、'));
  return `${card.card} | ${card.phase} | 失败 ${card.failCount} | 下一步 ${card.nextAction}`;
}

function cardSectionLines(cards) {
  if (!Array.isArray(cards)) return [missing('cards')];
  if (cards.length === 0) return ['（无）'];
  return cards.slice().sort((a, b) => compareText(cardName(a), cardName(b))).map(cardLine);
}

// 卡文要求每张卡一行，又硬性要求 ≤80 行；卡多到放不下时按行数上限截断并写明省略张数，不静默超限。
function appendCardLines(lines, cardLines) {
  const room = MAX_LINES - lines.length;
  if (room <= 0) return;
  if (cardLines.length <= room) {
    lines.push(...cardLines);
    return;
  }
  const shown = Math.max(0, room - 1);
  lines.push(...cardLines.slice(0, shown));
  lines.push(`（另有 ${cardLines.length - shown} 张卡未列出）`);
}

// 唯一渲染入口：输入为已读好的数据对象，返回字符串（纯函数，不碰盘也不碰 git）。
export function renderSnapshot(inputs = {}) {
  const { head, commits, registry, baseline, cards } = inputs || {};
  const lines = [];
  lines.push(SNAPSHOT_TITLE);
  lines.push('');
  lines.push(SECTION_HEAD);
  if (!head || !head.sha || !head.time) {
    lines.push(missing(!head ? 'head' : (!head.sha ? 'head.sha' : 'head.time')));
  } else {
    lines.push(`生成时 HEAD=${head.sha}（${head.time}）`);
  }
  lines.push('');
  lines.push(SECTION_COMMITS);
  if (!Array.isArray(commits)) lines.push(missing('commits'));
  else if (commits.length === 0) lines.push('（无）');
  else for (const commit of commits.slice(0, MAX_COMMITS)) lines.push(commitLine(commit));
  lines.push('');
  lines.push(SECTION_REGISTRY);
  lines.push(registryLine(registry));
  lines.push('');
  lines.push(SECTION_BASELINE);
  lines.push(baselineLine(baseline));
  lines.push('');
  lines.push(SECTION_CARDS);
  appendCardLines(lines, cardSectionLines(cards));
  return `${lines.join('\n')}\n`;
}

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function readHead(root) {
  try {
    const [sha, time] = git(root, ['log', '-1', '--format=%h%n%cI']).split('\n');
    return sha && time ? { sha, time } : null;
  } catch {
    return null;
  }
}

function readCommits(root) {
  try {
    const out = git(root, ['log', '-n', String(MAX_COMMITS), '--format=%h %s']);
    if (!out) return [];
    return out.split('\n').filter(Boolean).map((line) => {
      const split = line.indexOf(' ');
      return split < 0 ? { sha: line, subject: '' } : { sha: line.slice(0, split), subject: line.slice(split + 1) };
    });
  } catch {
    return null;
  }
}

function readJson(root, relPath) {
  const full = join(root, relPath);
  if (!existsSync(full)) return null;
  try {
    return JSON.parse(readFileSync(full, 'utf8'));
  } catch {
    return null;
  }
}

// 只扫 docs/卡档案/<卡>/state.json；_template 是模板不是在途卡。
function readCards(root) {
  const base = join(root, CARD_ARCHIVE_DIR);
  if (!existsSync(base)) return null;
  const byName = (a, b) => compareText(a.name, b.name);
  const cards = [];
  for (const entry of readdirSync(base, { withFileTypes: true }).slice().sort(byName)) {
    if (!entry.isDirectory() || entry.name === CARD_TEMPLATE_DIR) continue;
    const statePath = join(base, entry.name, 'state.json');
    if (!existsSync(statePath)) continue;
    try {
      cards.push(JSON.parse(readFileSync(statePath, 'utf8')));
    } catch {
      cards.push({});
    }
  }
  return cards;
}

function collectInputs(root) {
  return {
    head: readHead(root),
    commits: readCommits(root),
    registry: readJson(root, REGISTRY_PATH),
    baseline: readJson(root, BASELINE_PATH),
    cards: readCards(root),
  };
}

function checkedLines(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const start = lines.indexOf(CHECKED_HEADING);
  return start < 0 ? null : { start, lines: lines.slice(start) };
}

function firstCheckedDifference(diskText, memoryText) {
  const disk = checkedLines(diskText);
  if (!disk) return { line: 1, disk: '（磁盘文件缺少受检段）', memory: CHECKED_HEADING };
  const memory = checkedLines(memoryText);
  const length = Math.max(disk.lines.length, memory.lines.length);
  for (let index = 0; index < length; index += 1) {
    if (disk.lines[index] !== memory.lines[index]) {
      return {
        line: disk.start + index + 1,
        disk: disk.lines[index] === undefined ? '（文件结束）' : disk.lines[index],
        memory: memory.lines[index] === undefined ? '（文件结束）' : memory.lines[index],
      };
    }
  }
  return null;
}

function parseArgs(argv) {
  const opts = { check: false, out: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--check') opts.check = true;
    else if (arg === '--out') {
      const value = argv[index + 1];
      if (!value) throw new Error('--out 需要路径参数');
      opts.out = value;
      index += 1;
    } else throw new Error(`未知参数：${arg}`);
  }
  return opts;
}

function main(argv) {
  const opts = parseArgs(argv);
  const root = process.cwd();
  const target = opts.out ? resolve(root, opts.out) : join(root, SNAPSHOT_PATH);
  const memoryText = renderSnapshot(collectInputs(root));
  if (opts.check) {
    if (!existsSync(target)) {
      process.stderr.write(`状态快照不存在：${target}\n`);
      process.exitCode = 1;
      return;
    }
    // Windows core.autocrlf=true 检出会把 LF 变 CRLF；比对前统一换行，免得把检出差异当成手改。
    const diff = firstCheckedDifference(readFileSync(target, 'utf8'), memoryText);
    if (diff) {
      process.stdout.write(`第一处差异：受检段磁盘第 ${diff.line} 行\n磁盘：${diff.disk}\n内存：${diff.memory}\n`);
      process.exitCode = 1;
    }
    return;
  }
  mkdirSync(dirname(target), { recursive: true });
  writeCliOut(root, target, memoryText);
  process.stdout.write(`已写入 ${target}\n`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
