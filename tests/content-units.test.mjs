import test from 'node:test';
import assert from 'node:assert/strict';
import {unitIssues} from '../tools/content-units.mjs';
import {numeralIssues} from '../tools/content-numerals.mjs';

const ctx = names => ({materials: names.map((name, i) => ({item: `item_${i}`, amount: 1, facts: {name}}))});

test('材料名以束计，正文写一根：判错', () => {
  const issues = unitIssues({id: 'x', process: '取干直芦管束一根，截断。'}, null, ctx(['干直芦管束']));
  assert.equal(issues.length, 1);
  assert.match(issues[0], /干直芦管束一根/);
});
test('数词在前的反向写法也判错', () => {
  assert.equal(unitIssues({id: 'x', process: '取一根干直芦管束截断。'}, null, ctx(['干直芦管束'])).length, 1);
});
test('numeralIssues 共用入口会带出单位冲突', () => {
  assert.equal(numeralIssues({id: 'x', process: '取干直芦管束一根。'}, null, ctx(['干直芦管束'])).length, 1);
});
test('反例：同单位、简称、材料名不以单位结尾、无引用材料均不判', () => {
  assert.deepEqual(unitIssues({id: 'x', process: '取干直芦管束一束。'}, null, ctx(['干直芦管束'])), []);
  assert.deepEqual(unitIssues({id: 'x', process: '取芦管一根。'}, null, ctx(['干直芦管束'])), []);
  assert.deepEqual(unitIssues({id: 'x', process: '黄瓜一根切片。'}, null, ctx(['黄瓜'])), []);
  assert.deepEqual(unitIssues({id: 'x', process: '取干直芦管束一根。'}, null, null), []);
  assert.deepEqual(unitIssues({id: 'x', process: '取干直芦管束一根。'}, null, {materials: []}), []);
});
