// 统一派卡入口（docs/gemini/rewrite-guide-1124.md:209）：只测参数解析、模型白名单、预算闸门、缺 paths 键报错、
// 构造出的子进程参数与环境。buildInvocation 是纯函数，测试用假值，不起子进程、不碰真密钥。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, buildInvocation, loadPaths, loadDispatchConfig, MODELS } from '../../tools/dispatch/dispatch.mjs';
import { budgetValue } from '../../tools/dispatch/budget-check.mjs';

const PATHS = { claudeExe: 'X:/tools/claude.exe', claudeConfigDir: 'X:/cfg-claude', deepseekConfigDir: 'X:/cfg-ds' };
const SAMPLING = { purposes: { code: { temperature: 0 }, quiet: { temperature: null } } };
const DS_ENV = { DEEPSEEK_API_KEY: 'fake-ds-key' };
const CL_ENV = { CLAUDE_API_KEY: 'fake-claude-key' };
const args = (extra) => ({ model: 'deepseek-flash', prompt: 'PROMPT', sampling: SAMPLING, paths: PATHS, ...extra });

test('参数解析：四个必填与三个可选，缺省 effort=medium、budget=0.65、purpose=code', () => {
  assert.deepEqual(parseArgs(['--model', 'claude-opus-5-5', '--wd', 'W', '--card', 'C']), {
    model: 'claude-opus-5-5', wd: 'W', card: 'C', effort: 'medium', budget: '0.65', purpose: 'code',
  });
  assert.equal(parseArgs(['--model', 'deepseek-flash', '--wd', 'W', '--card', 'C', '--effort', 'high', '--budget', '0.5', '--purpose', 'quiet']).effort, 'high');
});

test('参数解析：模型白名单、未知开关、缺值、缺必填都拒', () => {
  assert.deepEqual(MODELS, ['deepseek-flash', 'claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5']);
  assert.throws(() => parseArgs(['--model', 'deepseek-v4-pro', '--wd', 'W', '--card', 'C']), /模型不在白名单/);
  assert.throws(() => parseArgs(['--model', 'deepseek-flash', '--wd', 'W', '--card', 'C', '--fast']), /未知参数/);
  assert.throws(() => parseArgs(['--model', 'deepseek-flash', '--wd', 'W', '--card']), /--card 缺值/);
  assert.throws(() => parseArgs(['--wd', 'W', '--card', 'C']), /缺 --model/);
});

test('paths.json 缺键报错并点出键名', () => {
  assert.deepEqual(loadPaths(PATHS), PATHS);
  assert.throws(() => loadPaths({ ...PATHS, claudeExe: '' }), /缺键「claudeExe」/);
  assert.throws(() => loadPaths({ claudeExe: 'X', deepseekConfigDir: 'D' }), /缺键「claudeConfigDir」/);
});

test('dispatch-config.json 缺键报错并点出键名', () => {
  const CFG = { models: ['m'], deepseekModel: 'm', deepseekBaseUrl: 'https://x', clearDeepseek: ['A'], clearClaude: ['B'], allowedTools: ['Read'] };
  assert.deepEqual(loadDispatchConfig(CFG), CFG);
  assert.throws(() => loadDispatchConfig({ ...CFG, allowedTools: [] }), /缺键「allowedTools」/);
  assert.throws(() => loadDispatchConfig({ ...CFG, deepseekBaseUrl: undefined }), /缺键「deepseekBaseUrl」/);
});

test('deepseek-flash：命令、模型名、DeepSeek 环境变量与采样体', () => {
  const inv = buildInvocation(args({}), DS_ENV);
  assert.equal(inv.command, 'X:/tools/claude.exe');
  assert.deepEqual(inv.args.slice(0, 4), ['-p', 'PROMPT', '--model', 'deepseek-flash']);
  assert.ok(inv.args.includes('--output-format'));
  assert.equal(inv.env.ANTHROPIC_BASE_URL, 'https://api.deepseek.com/anthropic');
  assert.equal(inv.env.ANTHROPIC_AUTH_TOKEN, 'fake-ds-key');
  assert.equal(inv.env.CLAUDE_CONFIG_DIR, 'X:/cfg-ds');
  assert.equal(inv.env.CLAUDE_CODE_EXTRA_BODY, '{"temperature":0}');
  for (const k of ['ANTHROPIC_MODEL', 'ANTHROPIC_DEFAULT_OPUS_MODEL', 'ANTHROPIC_DEFAULT_SONNET_MODEL', 'ANTHROPIC_DEFAULT_HAIKU_MODEL', 'ANTHROPIC_SMALL_FAST_MODEL', 'CLAUDE_CODE_SUBAGENT_MODEL', 'ANTHROPIC_DEFAULT_MODEL', 'ANTHROPIC_DEFAULT_FABLE_MODEL', 'CLAUDE_CODE_AUTO_MODE_MODEL']) {
    assert.equal(inv.env[k], 'deepseek-flash', k);
  }
  assert.ok(!('ANTHROPIC_API_KEY' in inv.env));
  assert.ok(!('CLAUDE_API_KEY' in inv.env));
});

test('buildInvocation：卡文缺或为空串时报「卡文为空」', () => {
  const { prompt, ...noPrompt } = args({});
  assert.throws(() => buildInvocation(noPrompt, DS_ENV), /卡文为空/);
  assert.throws(() => buildInvocation(args({ prompt: '' }), DS_ENV), /卡文为空/);
});

test('deepseek-flash：null 采样档不注入，未知用途报错', () => {
  assert.ok(!('CLAUDE_CODE_EXTRA_BODY' in buildInvocation(args({ purpose: 'quiet' }), DS_ENV).env));
  assert.throws(() => buildInvocation(args({ purpose: 'zzz' }), DS_ENV), /用途不存在: zzz/);
  assert.throws(() => buildInvocation(args({}), {}), /DEEPSEEK_API_KEY 不存在/);
});

test('claude-*：密钥从 CLAUDE_API_KEY 回退，只传 ANTHROPIC_API_KEY，预算与 effort 进参数', () => {
  const inv = buildInvocation(args({ model: 'claude-opus-5-5' }), CL_ENV);
  assert.deepEqual(inv.args.slice(0, 8), ['-p', 'PROMPT', '--model', 'claude-opus-5-5', '--effort', 'medium', '--max-budget-usd', '0.65']);
  assert.equal(inv.env.ANTHROPIC_API_KEY, 'fake-claude-key');
  assert.equal(inv.env.CLAUDE_CONFIG_DIR, 'X:/cfg-claude');
  assert.ok(!('ANTHROPIC_AUTH_TOKEN' in inv.env));
});

test('claude-*：来源 env 的 OAuth/会员令牌键不进子进程，只留 ANTHROPIC_API_KEY', () => {
  const src = { ANTHROPIC_API_KEY: 'fake-a', ANTHROPIC_AUTH_TOKEN: 'oauth-a', CLAUDE_CODE_OAUTH_TOKEN: 'oauth-b', CLAUDE_API_KEY: 'fake-c' };
  const inv = buildInvocation(args({ model: 'claude-opus-5-5' }), src);
  assert.equal(inv.env.ANTHROPIC_API_KEY, 'fake-a');
  for (const k of ['ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_API_KEY']) assert.ok(!(k in inv.env), k);
});

test('claude-*：ANTHROPIC_API_KEY 优先，缺两种密钥报错', () => {
  const inv = buildInvocation(args({ model: 'claude-sonnet-5-5' }), { ANTHROPIC_API_KEY: 'fake-a', CLAUDE_API_KEY: 'fake-c' });
  assert.equal(inv.env.ANTHROPIC_API_KEY, 'fake-a');
  assert.throws(() => buildInvocation(args({ model: 'claude-sonnet-5-5' }), {}), /ANTHROPIC_API_KEY（或 CLAUDE_API_KEY）不存在/);
});

test('预算闸门：只许 0 < x <= 0.65', () => {
  assert.equal(budgetValue('0.65'), '0.65');
  assert.equal(budgetValue('0.01'), '0.01');
  for (const bad of ['0', '-1', '0.66', 'abc', '', undefined]) assert.throws(() => budgetValue(bad), /预算不合法/);
  assert.throws(() => buildInvocation(args({ model: 'claude-haiku-5-5', budget: '0.66' }), CL_ENV), /预算不合法/);
  assert.equal(buildInvocation(args({ model: 'claude-haiku-5-5', budget: '0.5' }), CL_ENV).args[7], '0.5');
});
