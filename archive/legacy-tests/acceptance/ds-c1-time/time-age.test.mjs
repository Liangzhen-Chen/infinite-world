// 验收（出题方 sonnet-api-test-c1）：公共部件修理 C1「时间与年龄」。只经现有公开入口测行为，不测新入口名。
// 依据：卷二十:436（astroView 是 rules.astro 年长的唯一读者）、卷二十:217（yearDays 为有理数 {num,den}，天文年）、
//       卷四:214（ageYears = (clock.minute − birthMinute) ÷ 每年分钟数）、李白 Q-7（docs/审查/李白裁定-1117.md:1730，年龄一律天文年，只许 astroView 一处换算）。
// 测什么与修前状态：
//   1. 年龄按天文年（手算字面量；换出生地不变）——修前已绿，留作对照。
//   2. 17、120、10000 年往返误差 ≤ 1 个定点单位且为有限安全整数；改调 astroView(engine).yearsFixedOfElapsedMinute（卷二十:436 勘误 1124k170）。
//      修前红，原因：入口未建（astroView 上无 yearsFixedOfElapsedMinute）。
//   3. 单一读者（静态）：除 kernel/calendar.mjs 与 kernel/climate.mjs（相位份额，卷二十:644）外，server-plugin 下无文件读 yearMinutes——
//      修前 life.mjs:84、person.mjs:128 直接读，应红。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { buildPersonWorld, PLACE, SUB, MPY, personRow } from '../../kernel/person-world.mjs';
import { installDigestCap } from '../../../server-plugin/kernel/save.mjs';
import { runTransaction } from '../../../server-plugin/kernel/transaction.mjs';
import { useReportSink } from '../../../server-plugin/kernel/report.mjs';
import { instantiatePerson, birthMinuteOfAge } from '../../../server-plugin/person.mjs';
import { lifeFacts } from '../../../server-plugin/life.mjs';
import { fixedScale } from '../../../server-plugin/kernel/det-math.mjs';
import { astroView } from '../../../server-plugin/kernel/calendar.mjs';

useReportSink(() => {});
installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });

const { engine: BASE } = buildPersonWorld();
// 真实天文年 365.24219 日（卷二十:217 yearDays 有理数），一日 1440 分钟 → 一年 525949.2336 分钟。
const engineWith = (yearDays) => ({ ...BASE, rules: { ...BASE.rules, astro: { ...BASE.rules.astro, yearDays } } });
const ENG = engineWith({ num: 36524219, den: 100000 });
const NOW = 60 * MPY;
const state = () => ({ clock: { minute: NOW, seq: 0, dueNext: 0 }, created: {} });
const make = (eng, st, id, birthMinute, birthplace) => runTransaction(st, { node: 'test_c1', file: 'time-age.test.mjs' }, (s) => {
  instantiatePerson(eng, s, { instanceId: id, species: 'species_test_a', birthplace, birthMinute });
});

// 手算（卷四:214）：已过 788924 分钟 ÷ 525949.2336 = 1.50000028 → 截到 4 位小数 = 1.5。
test('1a ageYears 按天文年：已过 788924 分钟、yearDays 36524219/100000 → 1.5（卷四:214、卷二十:217）', () => {
  const st = state();
  assert.deepEqual(make(ENG, st, 'npc_c1_age_a', NOW - 788924, PLACE), { ok: true });
  assert.equal(lifeFacts(ENG, st, 'npc_c1_age_a').ageYears.value, 1.5);
});

// 手算：同一已过分钟，yearDays 365/1 → 年长 525600 分钟 → 788924 ÷ 525600 = 1.500997 → 1.5009（向零截断到 4 位）；证明年长取自 rules.astro 而非常量。
test('1b 年长取自 rules.astro：yearDays 365/1 时同一已过分钟得 1.5009（对照）', () => {
  const eng = engineWith({ num: 365, den: 1 });
  const st = state();
  assert.deepEqual(make(eng, st, 'npc_c1_age_b', NOW - 788924, PLACE), { ok: true });
  assert.equal(lifeFacts(eng, st, 'npc_c1_age_b').ageYears.value, 1.5009);
});

test('1c 同一出生分钟、不同出生地：年龄不变（天文年，不按当地历法；李白 Q-7）', () => {
  const st = state();
  assert.deepEqual(make(ENG, st, 'npc_p1', NOW - 788924, PLACE), { ok: true });
  assert.deepEqual(make(ENG, st, 'npc_p2', NOW - 788924, SUB), { ok: true });
  const a = lifeFacts(ENG, st, 'npc_p1').ageYears.value;
  const b = lifeFacts(ENG, st, 'npc_p2').ageYears.value;
  assert.equal(a, 1.5);
  assert.equal(b, 1.5);
});

// 往返：birthMinuteOfAge 后再算年龄，误差 ≤ 1 个定点单位（一分钟仅约 1.9e-6 年，远小于一个单位 1/fixedScale）。
for (const years of [17, 120, 10000]) {
  test(`2 往返 ${years} 年：误差 ≤ 1 个定点单位，结果为有限安全整数（卷四:214）`, () => {
    const now = 20000 * MPY;
    const st = { clock: { minute: now, seq: 0, dueNext: 0 }, created: {} };
    const birth = birthMinuteOfAge(ENG, st, years);
    assert.ok(Number.isSafeInteger(birth), `birthMinute ${birth}`);
    const back = astroView(ENG).yearsFixedOfElapsedMinute(now - birth);
    const want = BigInt(years) * fixedScale();
    const diff = back > want ? back - want : want - back;
    assert.ok(diff <= 1n, `diff ${diff}`);
    assert.ok(Number.isSafeInteger(Number(back)));
    // 手算：年数 × 525949.2336 分钟；与 astroView 给的年长一致（有限、正）。
    const y = astroView(ENG).yearMinutes;
    assert.ok(y.num > 0 && y.den >= 1);
  });
}

// 单一读者（卷二十:436、Q-7）：只有 calendar.mjs 与 climate.mjs（卷二十:644 相位份额）读 yearMinutes。
test('3 单一读者：server-plugin 下除 kernel/calendar.mjs、kernel/climate.mjs 外无文件读 yearMinutes（修前 life.mjs、person.mjs 应红）', () => {
  const root = new URL('../../../server-plugin/', import.meta.url);
  const dir = decodeURIComponent(root.pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  const files = readdirSync(dir, { recursive: true }).filter((f) => String(f).endsWith('.mjs')).map((f) => String(f).split(sep).join('/'));
  const allowed = new Set(['kernel/calendar.mjs', 'kernel/climate.mjs']);
  const offenders = files.filter((f) => !allowed.has(f) && /\byearMinutes\b/.test(readFileSync(join(dir, f), 'utf8')));
  assert.deepEqual(offenders, []);
  assert.ok(files.includes('kernel/calendar.mjs') && relative(dir, join(dir, 'life.mjs')) === 'life.mjs');
});
