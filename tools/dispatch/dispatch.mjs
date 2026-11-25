// 统一派卡入口（docs/gemini/rewrite-guide-1124.md:209 Step 1）：DeepSeek 与 claude -p 一处处理，参数数组 spawn，不拼 shell 字符串。
// 用法：node tools/dispatch/dispatch.mjs --model <deepseek-flash|claude-haiku-5-5|claude-sonnet-5-5|claude-opus-5-5> --wd <工作区> --card <卡文> [--effort medium] [--budget 0.65] [--purpose code]
// deepseek-flash 行为等同旧 tools/dispatch/run-card-ds.sh：清桌面端注入的环境变量、DeepSeek 地址、采样温度按用途（sampling.json）、模型名全为 deepseek-flash。
// claude-* 行为等同旧 tools/dispatch/run-card.sh：密钥读 ANTHROPIC_API_KEY，没有则读 CLAUDE_API_KEY，只在子进程环境传 ANTHROPIC_API_KEY，并清掉 OAuth/会员令牌键；
// 预算经 tools/dispatch/budget-check.mjs（只许 0 < x <= 0.65）。
// 本机路径与派卡配置不写死在本文件：从同目录 paths.json、dispatch-config.json 读，缺键报错退出。
import { readFileSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { composeCard } from './compose-card.mjs';
import { budgetValue, MAX_BUDGET_USD } from './budget-check.mjs';
import { samplingBody } from './sampling-body.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

// dispatch-config.json 的必填键；缺键直接报出来（不回落默认值）。
export function loadDispatchConfig(obj) {
  const keys = ['models', 'deepseekModel', 'deepseekBaseUrl', 'clearDeepseek', 'clearClaude', 'allowedTools'];
  for (const k of keys) {
    const v = obj ? obj[k] : undefined;
    const ok = Array.isArray(v) ? v.length > 0 : typeof v === 'string' && v.length > 0;
    if (!ok) throw new Error(`dispatch-config.json 缺键「${k}」`);
  }
  return Object.fromEntries(keys.map((k) => [k, obj[k]]));
}

const DEFAULT_CONFIG = loadDispatchConfig(JSON.parse(readFileSync(join(HERE, 'dispatch-config.json'), 'utf8')));
export const MODELS = DEFAULT_CONFIG.models;

// 命令行解析：只认卡文写明的开关；缺值、未知开关、模型不在白名单都报错。
export function parseArgs(argv) {
  const out = { effort: 'medium', budget: String(MAX_BUDGET_USD), purpose: 'code' };
  const takes = new Set(['--model', '--wd', '--card', '--effort', '--budget', '--purpose']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!takes.has(a)) throw new Error(`未知参数: ${a}`);
    const v = argv[++i];
    if (v === undefined || v === '') throw new Error(`${a} 缺值`);
    out[a.slice(2)] = v;
  }
  if (!out.model) throw new Error('缺 --model');
  if (!MODELS.includes(out.model)) throw new Error(`模型不在白名单: ${out.model}（只许 ${MODELS.join('|')}）`);
  if (!out.wd) throw new Error('缺 --wd');
  if (!out.card) throw new Error('缺 --card');
  return out;
}

// paths.json 的必填键；缺键直接报出来（不回落默认路径）。
export function loadPaths(obj) {
  const keys = ['claudeExe', 'claudeConfigDir', 'deepseekConfigDir'];
  for (const k of keys) if (!obj || typeof obj[k] !== 'string' || !obj[k]) throw new Error(`paths.json 缺键「${k}」`);
  return Object.fromEntries(keys.map((k) => [k, obj[k]]));
}

// 把要传给子进程的环境拼出来：从 env 去掉清空表里的键，再覆盖本函数给的键。纯函数，测试传入假 env。
function childEnv(base, clear, add) {
  const env = {};
  for (const [k, v] of Object.entries(base || {})) if (!clear.includes(k)) env[k] = v;
  return Object.assign(env, add);
}

// 构造子进程命令与参数（不启动进程）。opts.sampling 是 sampling.json 的内容，只给 deepseek 用；
// opts.paths 是 paths.json 的解析结果：没带就自己读同目录 paths.json（loadPaths 校验必填键，不另写一份）；
// opts.config 是 dispatch-config.json 的解析结果，没带就用启动时读入的同一份（loadDispatchConfig 校验必填键）。
export function buildInvocation(opts = {}, env = {}) {
  const { model, prompt, effort = 'medium', budget = String(MAX_BUDGET_USD), purpose = 'code' } = opts;
  if (!MODELS.includes(model)) throw new Error(`模型不在白名单: ${model}`);
  if (!prompt) throw new Error('卡文为空');
  const paths = opts.paths || loadPaths(JSON.parse(readFileSync(join(HERE, 'paths.json'), 'utf8')));
  const sampling = opts.sampling || JSON.parse(readFileSync(join(HERE, 'sampling.json'), 'utf8'));
  const config = opts.config || DEFAULT_CONFIG;
  const base = ['-p', prompt];
  const tail = ['--permission-mode', 'acceptEdits', '--allowedTools', ...config.allowedTools, '--output-format', 'json'];
  if (model === config.deepseekModel) {
    // 已定（主会话 11-25，审查.md 1d）：Claude Code 对 deepseek-flash 按未知价目估价（第二轮报 15.28 美元、实际约 5 元），--max-budget-usd 会误砍正常运行；DeepSeek 花费靠窄卡文与控制台核账，单项超 5 元停报（CLAUDE.md 第 3 节）。
    if (!env.DEEPSEEK_API_KEY) throw new Error('DEEPSEEK_API_KEY 不存在');
    const ds = config.deepseekModel;
    const extra = samplingBody(sampling, purpose);
    const add = {
      ANTHROPIC_BASE_URL: config.deepseekBaseUrl,
      ANTHROPIC_AUTH_TOKEN: env.DEEPSEEK_API_KEY,
      ANTHROPIC_MODEL: ds, ANTHROPIC_DEFAULT_OPUS_MODEL: ds,
      ANTHROPIC_DEFAULT_SONNET_MODEL: ds, ANTHROPIC_DEFAULT_HAIKU_MODEL: ds,
      ANTHROPIC_SMALL_FAST_MODEL: ds, CLAUDE_CODE_SUBAGENT_MODEL: ds,
      ANTHROPIC_DEFAULT_MODEL: ds, ANTHROPIC_DEFAULT_FABLE_MODEL: ds,
      CLAUDE_CODE_AUTO_MODE_MODEL: ds,
      CLAUDE_CONFIG_DIR: paths.deepseekConfigDir, DND_CARD_AGENT: '1',
    };
    if (extra) add.CLAUDE_CODE_EXTRA_BODY = extra;
    return { command: paths.claudeExe, args: [...base, '--model', ds, ...tail], env: childEnv(env, [...config.clearDeepseek, 'CLAUDE_CODE_EXTRA_BODY'], add) };
  }
  const key = env.ANTHROPIC_API_KEY || env.CLAUDE_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY（或 CLAUDE_API_KEY）不存在');
  const b = budgetValue(budget);
  return {
    command: paths.claudeExe,
    args: [...base, '--model', model, '--effort', effort, '--max-budget-usd', String(b), ...tail],
    env: childEnv(env, config.clearClaude, { ANTHROPIC_API_KEY: key, CLAUDE_CONFIG_DIR: paths.claudeConfigDir, DND_CARD_AGENT: '1' }),
  };
}

function gitOut(wd, args) {
  return execFileSync('git', ['-C', wd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 28 });
}

export function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    return 2;
  }
  try {
    gitOut(opts.wd, ['fetch', '-q', 'origin']);
  } catch {
    // 旧脚本同样忽略 fetch 失败（离线仍可派）。
  }
  let header;
  try {
    header = gitOut(opts.wd, ['show', 'origin/master:docs/派活卡头规矩.md']);
  } catch {
    process.stderr.write('派活卡头规矩取不到（origin/master:docs/派活卡头规矩.md）\n');
    return 2;
  }
  let card;
  try {
    card = readFileSync(opts.card, 'utf8');
  } catch {
    process.stderr.write(`提示文件不存在: ${opts.card}\n`);
    return 2;
  }
  let inv;
  try {
    const prompt = composeCard(header, card);
    inv = buildInvocation({ ...opts, prompt }, process.env);
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    return 2;
  }
  const child = spawn(inv.command, inv.args, { cwd: opts.wd, env: inv.env, stdio: ['ignore', 'inherit', 'inherit'] });
  child.on('error', (e) => {
    process.stderr.write(`${e.message}\n`);
    process.exit(2);
  });
  child.on('exit', (code) => process.exit(code === null ? 1 : code));
  return null;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const code = main(process.argv.slice(2));
  if (code !== null) process.exit(code);
}
