// handles/keys.mjs 里的格式文法单项测试（原 patterns.test.mjs 搬入；卷二 S13 (b)、§2.8 表 kernel 行）。
// 期望值全写成字面量，不用被测函数算。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isModuleFile, isRuleTableFile, isLowerCamelCode,
  isDeclarableNode, isGeneratedNode, isAnyNode, isPathPattern,
  isHex64, snakeCaseKey, eventIdKeyText, instanceDigestKeyText,
} from '../../server-plugin/kernel/handles/keys.mjs';

test('模块路径与规则表路径', () => {
  assert.equal(isModuleFile('router/menu-entry.mjs'), true);
  assert.equal(isModuleFile('index.mjs'), true);
  assert.equal(isModuleFile('a.js'), false);
  assert.equal(isModuleFile('/abs/x.mjs'), false);
  assert.equal(isModuleFile('A/x.mjs'), false);
  assert.equal(isModuleFile(7), false);
  assert.equal(isRuleTableFile('tables/kernel-constants.json'), true);
  assert.equal(isRuleTableFile('registry.json'), true);
  assert.equal(isRuleTableFile('tables/x.mjs'), false);
  assert.equal(isRuleTableFile('tables/A.json'), false);
});

test('小驼峰代号：首字母小写，其余字母数字下划线，总长 1–48', () => {
  assert.equal(isLowerCamelCode('buildProjectView'), true);
  assert.equal(isLowerCamelCode('a'), true);
  assert.equal(isLowerCamelCode('a' + 'b'.repeat(47)), true);
  assert.equal(isLowerCamelCode('a' + 'b'.repeat(48)), false);
  assert.equal(isLowerCamelCode('Build'), false);
  assert.equal(isLowerCamelCode('a-b'), false);
});

test('依赖声明的节点名：可声明三类、机器生成两类、并集', () => {
  assert.equal(isDeclarableNode('view:statusView'), true);
  assert.equal(isDeclarableNode('relation:rel_part'), true);
  assert.equal(isDeclarableNode('scope:sc_main'), true);
  assert.equal(isDeclarableNode('dim:item'), false);
  assert.equal(isDeclarableNode('foo:x'), false);
  assert.equal(isGeneratedNode('dim:item'), true);
  assert.equal(isGeneratedNode('modified:person'), true);
  assert.equal(isGeneratedNode('dim:Item'), false);
  assert.equal(isAnyNode('modified:person'), true);
  assert.equal(isAnyNode('view:v'), true);
  assert.equal(isAnyNode('event:e'), false);
});

test('路径模式：点分小驼峰段', () => {
  assert.equal(isPathPattern('created.item.props.basis'), true);
  assert.equal(isPathPattern('due'), true);
  assert.equal(isPathPattern('Created.item'), false);
  assert.equal(isPathPattern('a..b'), false);
  assert.equal(isPathPattern(''), false);
});

test('64 位小写十六进制摘要', () => {
  assert.equal(isHex64('a'.repeat(64)), true);
  assert.equal(isHex64('a'.repeat(63)), false);
  assert.equal(isHex64('A'.repeat(64)), false);
  assert.equal(isHex64(42), false);
});

test('日志键代号形：驼峰转下划线小写', () => {
  assert.equal(snakeCaseKey('reactionDepthMax'), 'reaction_depth_max');
  assert.equal(snakeCaseKey('cadence'), 'cadence');
});

test('事件 id 与实例位次摘要的键文本：成分按卷文次序、竖线相连、时刻与序位按十进制' , () => {
  assert.equal(eventIdKeyText('w1', 'act_x', 'npc_a', 5, 'pos.commit'), 'w1|act_x|npc_a|5|pos.commit');
  // 实例位次（卷十 R10-12.1）：世界种子、位次代号、父 id、时刻、序位；序位在时刻之后。
  assert.equal(instanceDigestKeyText('w1', 'idslot_x', 'loc_a', 3, 90), 'w1|idslot_x|loc_a|90|3');
});
