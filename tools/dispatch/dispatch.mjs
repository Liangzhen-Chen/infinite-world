// 统一派卡入口（docs/gemini/rewrite-guide-1124.md:209 Step 1）：DeepSeek 与 claude -p 一处处理，参数数组 spawn，不拼 shell 字符串。
// 用法：node tools/dispatch/dispatch.mjs --model <deepseek-flash|claude-haiku-5-5|claude-sonnet-5-5|claude-opus-5-5> --wd <工作区> --card <卡文> [--effort medium] [--budget 0.65] [--purpose code]
// deepseek-flash 行为等同旧 tools/dispatch/run-card-ds.sh：清桌面端注入的环境变量、DeepSeek 地址、采样温度按用途（sampling.json）、模型名全为 deepseek-flash。
// claude-* 行为等同旧 tools/dispatch/run-card.sh：密钥读 ANTHROPIC_API_KEY，没有则读 CLAUDE_API_KEY，只在子进程环境传 ANTHROPIC_API_KEY，并清掉 OAuth/会员令牌键；
// 预算经 tools/dispatch/budget-check.mjs（只许 0 < x <= 0.65）。
// 本机路径与派卡配置不写死在本文件：从同目录 paths.json、dispatch-config.json 读，缺键报错退出。
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { composeCard } from './compose-card.mjs';
import { budgetValue, MAX_BUDGET_USD } from './budget-check.mjs';
import { samplingBody } from './sampling-body.mjs';
import { loadRules, modelFamilies, modelFamilyReasons, partyModelFamilies } from '../accept/lib/card-archive.mjs';

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
  const takes = new Set(['--model', '--wd', '--card', '--effort', '--budget', '--purpose', '--needs', '--archive', '--role']);
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
  if (!!out.archive !== !!out.role) throw new Error('--archive 与 --role 须同时给');
  if (out.needs !== undefined) {
    out.needs = String(out.needs).split(',').map((s) => s.trim()).filter(Boolean);
    if (!out.needs.length) throw new Error('--needs 为空');
  }
  return out;
}

// 派前核入口 needs 闭包（L-06 ⑤）：keys 是总登记表的行键（file#name）或唯一导出名；沿 needs 传递闭包，
// 任一条目解析不到或 file 为 null/空即算悬空。返回悬空键数组（空数组放行）。规则数据在 entry-registry.json。
export function checkNeeds(registry, keys) {
  const entries = (registry && registry.entries) || [];
  const byName = new Map();
  const byKey = new Map();
  for (const e of entries) {
    const k = `${e.file || ''}#${e.name}`;
    if (!byKey.has(k)) byKey.set(k, e);
    byName.set(e.name, [...(byName.get(e.name) || []), e]);
  }
  const resolve = (n) => {
    const s = String(n);
    if (byKey.has(s)) return byKey.get(s);
    const bare = s.replace(/^.*#/, '');
    const c = byName.get(bare) || [];
    return !s.includes('#') && c.length === 1 ? c[0] : null;
  };
  const dangling = [];
  const seen = new Set();
  const visit = (raw) => {
    const e = resolve(raw);
    const id = e ? `${e.file || ''}#${e.name}` : String(raw);
    if (seen.has(id)) return;
    seen.add(id);
    if (!e) { dangling.push(String(raw)); return; }
    if (e.file === null || e.file === undefined || e.file === '') { dangling.push(id); return; }
    for (const n of e.needs || []) visit(n);
  };
  for (const k of keys) visit(k);
  return dangling;
}

// 规矩文件（三方角色与模型族判据的唯一出处）在派卡机上按仓库当前版本读一次；读到坏文件时报出来，不静默放过。
let cachedRules;
function dispatchRules() {
  if (!cachedRules) {
    try { cachedRules = loadRules(readFileSync(join(HERE, '..', '..', 'docs', '派活卡头规矩.md'), 'utf8')); } catch (e) { cachedRules = { error: e.message }; }
  }
  return cachedRules;
}

// 派前核三方模型族（L-06 ⑤）：① 规矩判据（写码∩出题非空、审卡落在二者并集）有违规即拒；
// ② 本次 --model 的模型族须在派卡.md 里该角色登记的模型族内。返回违规原因数组（空数组放行）。
// 族表与「三方标识」解析都复用 card-archive（不另写一份）。
export function checkRoleModel(archiveText, role, model) {
  const loaded = dispatchRules();
  if (loaded.error) return [`派活卡头规矩解析失败：${loaded.error}`];
  const rules = loaded.rules;
  if (!rules.party.roles.includes(role)) return [`--role「${role}」不在规矩登记的三方角色里（${rules.party.roles.join('/')}）`];
  const [file] = rules.party.section.split('/');
  const parsed = partyModelFamilies(rules, (f) => (f === file ? archiveText : null));
  if (!parsed) return [`派卡.md 读不到「${rules.party.section}」或规矩没有「${rules.party.modelField}」字段`];
  const reasons = modelFamilyReasons(rules, parsed.models, parsed.file, parsed.section);
  const wanted = modelFamilies(model);
  const registered = parsed.models[role] || [];
  if (!registered.length) reasons.push(`派卡.md「${parsed.section}」里没有「${role}」的模型，无法核对本次模型族`);
  else if (!wanted.some((f) => registered.includes(f))) reasons.push(`本次 --model「${model}」的模型族（${wanted.join('、') || '空'}）与派卡.md 里「${role}」登记的（${registered.join('、')}）不一致`);
  return reasons;
}

// 派卡收据（L-06 ⑥）：必填字段缺一个就抛，防止写出残收据。totalCostUsd 允许 null（claude -p 输出取不到钱时），
// headBefore/headAfter 允许 null（取不到 HEAD 时），其余须非空。
const RECEIPT_FIELDS = ['role', 'model', 'family', 'endpoint', 'startedAt', 'endedAt', 'exitCode', 'totalCostUsd', 'promptSha256', 'headBefore', 'headAfter'];
export function buildReceipt(fields) {
  const out = {};
  for (const k of RECEIPT_FIELDS) {
    if (!fields || !Object.prototype.hasOwnProperty.call(fields, k)) throw new Error(`收据缺字段「${k}」`);
    out[k] = fields[k];
  }
  for (const k of ['role', 'model', 'family', 'startedAt', 'endedAt', 'promptSha256']) {
    if (typeof out[k] !== 'string' || !out[k]) throw new Error(`收据字段「${k}」须为非空字符串`);
  }
  if (out.endpoint !== 'deepseek' && out.endpoint !== 'anthropic') throw new Error(`收据字段「endpoint」须为 deepseek 或 anthropic`);
  if (typeof out.exitCode !== 'number' || !Number.isInteger(out.exitCode)) throw new Error('收据字段「exitCode」须为整数');
  if (out.totalCostUsd !== null && (typeof out.totalCostUsd !== 'number' || !Number.isFinite(out.totalCostUsd) || out.totalCostUsd < 0)) throw new Error('收据字段「totalCostUsd」须为非负数或 null');
  for (const k of ['headBefore', 'headAfter']) if (out[k] !== null && (typeof out[k] !== 'string' || !out[k])) throw new Error(`收据字段「${k}」须为非空字符串或 null`);
  return out;
}

// 从 claude -p --output-format json 的输出里取 total_cost_usd；整段不是 JSON 就逐行从后往前试；取不到返回 null。
function parseCost(output) {
  const pick = (s) => {
    try {
      const o = JSON.parse(s);
      const v = o && o.total_cost_usd;
      return typeof v === 'number' && Number.isFinite(v) ? v : null;
    } catch { return null; }
  };
  const text = String(output || '').trim();
  if (!text) return null;
  const whole = pick(text);
  if (whole !== null) return whole;
  const lines = text.split(/\r?\n/).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) { const v = pick(lines[i]); if (v !== null) return v; }
  return null;
}

function headOf(wd) {
  try { return gitOut(wd, ['rev-parse', 'HEAD']).trim() || null; } catch { return null; }
}

function nextReceiptNumber(dir, role) {
  let names;
  try { names = readdirSync(dir); } catch { return 1; }
  const re = new RegExp(`^${role}-\\d{3}\\.json$`);
  return names.filter((n) => re.test(n)).length + 1;
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
  // 派前检查（不起子进程）：needs 闭包悬空、三方模型族违规、本次模型与派卡登记不符，都在这里拒派。
  if (opts.needs) {
    let registry;
    try {
      registry = JSON.parse(readFileSync(join(HERE, '..', 'accept', 'entry-registry.json'), 'utf8'));
    } catch (e) {
      process.stderr.write(`读不到总登记表 tools/accept/entry-registry.json：${e.message}\n`);
      return 2;
    }
    const dangling = checkNeeds(registry, opts.needs);
    if (dangling.length) {
      process.stderr.write(`needs 闭包悬空：${dangling.join('、')}\n`);
      return 2;
    }
  }
  if (opts.archive) {
    let archiveText;
    try {
      archiveText = readFileSync(join(opts.archive, '派卡.md'), 'utf8');
    } catch {
      process.stderr.write(`派卡记录不存在: ${join(opts.archive, '派卡.md')}\n`);
      return 2;
    }
    const reasons = checkRoleModel(archiveText, opts.role, opts.model);
    if (reasons.length) {
      for (const r of reasons) process.stderr.write(`${r}\n`);
      return 2;
    }
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
  let prompt;
  try {
    prompt = composeCard(header, card);
    inv = buildInvocation({ ...opts, prompt }, process.env);
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    return 2;
  }
  const headBefore = opts.archive ? headOf(opts.wd) : null;
  const startedAt = new Date().toISOString();
  let output = '';
  const child = spawn(inv.command, inv.args, { cwd: opts.wd, env: inv.env, stdio: ['ignore', 'pipe', 'inherit'] });
  child.stdout.on('data', (chunk) => { output += chunk; process.stdout.write(chunk); });
  child.on('error', (e) => {
    process.stderr.write(`${e.message}\n`);
    process.exit(2);
  });
  child.on('exit', (code) => {
    const exitCode = code === null ? 1 : code;
    if (opts.archive) {
      let receipt;
      try {
        receipt = buildReceipt({
          role: opts.role,
          model: opts.model,
          family: modelFamilies(opts.model).join('、'),
          endpoint: opts.model === DEFAULT_CONFIG.deepseekModel ? 'deepseek' : 'anthropic',
          startedAt,
          endedAt: new Date().toISOString(),
          exitCode,
          totalCostUsd: parseCost(output),
          promptSha256: createHash('sha256').update(prompt, 'utf8').digest('hex'),
          headBefore,
          headAfter: headOf(opts.wd),
        });
      } catch (e) {
        process.stderr.write(`构造收据失败：${e.message}\n`);
        process.exit(2);
        return;
      }
      const dir = join(opts.archive, '收据');
      try {
        mkdirSync(dir, { recursive: true });
        const file = join(dir, `${opts.role}-${String(nextReceiptNumber(dir, opts.role)).padStart(3, '0')}.json`);
        writeFileSync(file, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
      } catch (e) {
        process.stderr.write(`写收据失败：${e.message}\n`);
        process.exit(2);
        return;
      }
    }
    process.exit(exitCode);
  });
  return null;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const code = main(process.argv.slice(2));
  if (code !== null) process.exit(code);
}
