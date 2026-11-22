// G13（6-8）感知：perceive、withinReach、perceiveEvent、perceivesEntity、sourceLevelsOf 与 sense 族、perception.json 的加载期校验。
// 卷五 §4.2 规则 1–11、A5-2.1 至 A5-2.3；对照表 docs/迁移体检/格子G12-G16-规矩检查对照.md #23–#37、#89；卷九 R9-2.10。
// propagate（卷二十，G14 落）、envAt 位置层（G16 落）现在不存在，用例经 registerPropagate、registerEnvAt 交入"测试替身"：到达量与能见距离是测试给的数，判定式的其余部分走真实代码、真实夹具世界（perceive-world.mjs）。
// 夹具数：物种 species_test_a 感官阈值 听 0.2、视 0.2、嗅 0.3、灵觉 0.1、震 0.1，源强 听 40、视 20、嗅 10、灵觉 30、震 5；身体图头部对各感官能力贡献 1（盲物种没有视觉）；rules.perception.marginBase 全 0。
// 期望值按判定式 margin = 到达强度 × 感官能力值 − 阈值 − marginBase 手算成字面量（推算写在用例里）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { ENGINE, pos, fresh, withRules } from './perceive-world.mjs';
import { perceive, perceiveEvent, withinReach, perceivesEntity, sourceLevelsOf, registerPropagate, registerEnvAt, resetPerceptionPorts } from '../../server-plugin/perceive.mjs';
import { checkSenseTables } from '../../server-plugin/kernel/validate/sense-tables.mjs';
import { useReportSink } from '../../server-plugin/kernel/report.mjs';

useReportSink(() => {});
const clone = (v) => structuredClone(v);

// 交入测试替身：arrival 是到达量（数或 (channel, level) => 数）、env 是能见距离（数或 (pos, key) => 数）；返回 propagate 的调用记录。
function ports({ arrival = 0.5, env = 100 } = {}) {
  resetPerceptionPorts();
  const calls = [];
  registerPropagate((eng, st, channel, src, obs, level) => { calls.push({ channel, src, obs, level }); return typeof arrival === 'function' ? arrival(channel, level) : arrival; });
  registerEnvAt((eng, st, p, key) => (typeof env === 'function' ? env(p, key) : env));
  return calls;
}
const SIGHT = 'sense_sight';
const HEAR = 'sense_hearing';
const SMELL = 'sense_smell';
const AURA = 'sense_test_aura';
const VIB = 'sense_vibration';

// 观察者 npc_obs 在小屋里 (22,117,1)，声源 (22,122,1) 在南墙外，直线距离 5 m。
const SRC = pos(22, 122);
const state = (extra = {}) => fresh({ npc_obs: { pos: pos(22, 117), species: 'species_test_a' }, npc_src: { pos: SRC, species: 'species_test_a' }, ...extra });
const see = (st, channel = SIGHT, level = null, who = 'npc_obs', eng = ENGINE) => perceive(eng, st, who, { channel, sourcePos: SRC, sourceLevel: level });

test('#24 判定式：margin = 到达强度 × 能力值 − 阈值 − marginBase；到达 0.5、能力 1、视觉阈值 0.2、marginBase 0 → 0.3 感知到；到达 0.2 → margin 恰为 0 仍感知到（≥ 0）；到达 0.1 → −0.1 感知不到', () => {
  const s = state();
  ports({ arrival: 0.5 });
  assert.deepEqual(see(s), { perceived: true, channel: SIGHT, margin: 0.3, rangeShortfallM: null });
  ports({ arrival: 0.2 });
  assert.deepEqual(see(s), { perceived: true, channel: SIGHT, margin: 0, rangeShortfallM: null });
  ports({ arrival: 0.1 });
  assert.deepEqual(see(s), { perceived: false, channel: SIGHT, margin: -0.1, rangeShortfallM: null });
});

test('#24 感官能力值读 bodyView：盲物种视觉能力 0，0.5 × 0 − 0.2 = −0.2 感知不到，听觉照常 0.5 × 1 − 0.2 = 0.3；marginBase 0.05 时听觉 0.5 − 0.2 − 0.05 = 0.25', () => {
  const s = state({ npc_blind: { pos: pos(22, 118), species: 'species_test_blind' } });
  ports({ arrival: 0.5 });
  assert.deepEqual(see(s, SIGHT, null, 'npc_blind'), { perceived: false, channel: SIGHT, margin: -0.2, rangeShortfallM: null });
  assert.deepEqual(see(s, HEAR, null, 'npc_blind'), { perceived: true, channel: HEAR, margin: 0.3, rangeShortfallM: null });
  const base = withRules(ENGINE, { perception: { ...ENGINE.rules.perception, marginBase: { ...ENGINE.rules.perception.marginBase, [HEAR]: 0.05 } } });
  assert.equal(see(s, HEAR, null, 'npc_obs', base).margin, 0.25);
});

test('#24 清醒：观察者 awake 为真或该通道 perceivedAsleep 为真才可能感知到——把清醒线 awakeMin 提到 2（意识 1 达不到，睡着）：视觉（睡着不可感知）判为感知不到但 margin 照算 0.3，听觉与嗅觉（睡着可感知）照常', () => {
  const s = state();
  ports({ arrival: 0.5 });
  const asleep = withRules(ENGINE, { capacity: { ...ENGINE.rules.capacity, awakeMin: 2 } });
  assert.deepEqual(see(s, SIGHT, null, 'npc_obs', asleep), { perceived: false, channel: SIGHT, margin: 0.3, rangeShortfallM: null });
  assert.deepEqual(see(s, HEAR, null, 'npc_obs', asleep), { perceived: true, channel: HEAR, margin: 0.3, rangeShortfallM: null });
  assert.equal(see(s, SIGHT).perceived, true, '清醒（意识 1 ≥ 0.5）视觉感知到');
});

test('#24 未知的通则：到达强度、感官能力值、阈值、marginBase、可及距离的环境维度、直线距离任一缺数据，margin 为 null、perceived 假、rangeShortfallM 为空，不拿别的量顶替、也不跳过那一步', () => {
  const unknown = { perceived: false, channel: SIGHT, margin: null, rangeShortfallM: null };
  const s = state({ npc_ns: { pos: pos(22, 119), species: 'species_test_noscent' }, npc_nopos: { species: 'species_test_a' } });
  // 到达强度：propagate 返回 null；没交入 propagate 同样。
  ports({ arrival: null });
  assert.deepEqual(see(s), unknown);
  resetPerceptionPorts(); registerEnvAt(() => 100);
  assert.deepEqual(see(s), unknown);
  // 感官能力值：rules.body 把 integrity.lostBelow 登为未建，部位完好度未知，bodyView 的视觉能力读不出。
  ports({ arrival: 0.5 });
  const nobody = withRules(ENGINE, { body: { ...ENGINE.rules.body, unbuilt: ['integrity.lostBelow', 'metabolism'], integrity: undefined } });
  assert.deepEqual(see(s, SIGHT, null, 'npc_obs', nobody), unknown);
  // 阈值：物种没有嗅觉（senses 的嗅觉键为 null）。
  assert.deepEqual(see(s, SMELL, null, 'npc_ns'), { ...unknown, channel: SMELL });
  // marginBase：规则表没有该通道的键。
  const nobase = withRules(ENGINE, { perception: { ...ENGINE.rules.perception, marginBase: {} } });
  assert.deepEqual(see(s, SIGHT, null, 'npc_obs', nobase), unknown);
  // 可及距离的环境维度：没有 envAt 读数；直线距离：来源在另一个格空间。均不调 propagate。
  const calls = ports({ arrival: 0.5, env: null });
  assert.deepEqual(see(s), unknown);
  ports({ arrival: 0.5, env: 100 });
  const far = perceive(ENGINE, s, 'npc_obs', { channel: SIGHT, sourcePos: pos(22, 122, 1, 1), sourceLevel: null });
  assert.deepEqual(far, unknown);
  assert.equal(calls.length, 0, '可及距离读不到时不调 propagate');
  // 观察者没有位置：无从取距离与来源位置，同样未知。
  ports({ arrival: 0.5 });
  assert.deepEqual(see(s, SIGHT, null, 'npc_nopos'), unknown);
  // 反方向不成立：margin 未知必 perceived 假（上面各行），margin 非未知时 perceived 另看清醒（上一条）。
});

test('#25 可及距离：视觉 rangeDim 指能见距离，来源距观察者 5 m；能见距离 4 m → 不调 propagate、perceived 假、margin 未知、rangeShortfallM = 5 − 4 = 1；恰 5 m 不算超出（距离不大于）；听觉没有 rangeDim，不受能见距离限制', () => {
  const s = state();
  let calls = ports({ arrival: 0.5, env: 4 });
  assert.deepEqual(see(s), { perceived: false, channel: SIGHT, margin: null, rangeShortfallM: 1 });
  assert.equal(calls.length, 0);
  assert.deepEqual(see(s, HEAR), { perceived: true, channel: HEAR, margin: 0.3, rangeShortfallM: null });
  assert.equal(calls.length, 1, '无 rangeDim 的通道照常调 propagate');
  calls = ports({ arrival: 0.5, env: 5 });
  assert.deepEqual(see(s), { perceived: true, channel: SIGHT, margin: 0.3, rangeShortfallM: null });
  assert.equal(calls.length, 1);
  // 读的是观察者位置层的维度：envAt 收到观察者的位置与 rangeDim 所指的键。
  const seen = [];
  ports({ arrival: 0.5, env: (p, key) => { seen.push([p, key]); return 100; } });
  see(s);
  assert.deepEqual(seen, [[pos(22, 117), 'env.sightM']]);
});

test('#89 到达量原样用作到达强度：同一组输入下 margin = propagate 返回值 − 0.2，没有任何距离、开敞、时间的折算；增大到达量 margin 不减；sourcePos、sourceLevel 原样传给 propagate', () => {
  const s = state();
  let prev = -Infinity;
  for (const a of [0, 0.1, 0.2, 0.5, 0.75, 1.5]) {
    const calls = ports({ arrival: a });
    const r = see(s, HEAR, 12.5);
    // 手算：到达 a × 能力 1 − 阈值 0.2 − marginBase 0（四位小数内精确）。
    assert.equal(r.margin, Math.round((a - 0.2) * 10000) / 10000, `a=${a}`);
    assert.ok(r.margin >= prev, '到达强度增大则 margin 不减');
    prev = r.margin;
    assert.deepEqual(calls, [{ channel: HEAR, src: SRC, obs: pos(22, 117), level: 12.5 }]);
  }
});

test('#23 perceive 纯读：调用前后状态序列化逐位相同；同输入两次相同；没有写调用', () => {
  const s = state();
  ports({ arrival: 0.5 });
  const before = JSON.stringify(s);
  const a = see(s, SIGHT, 3);
  const b = see(s, SIGHT, 3);
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(s), before);
});

test('入参核对：通道不是 sense 族条目 E-DIM-REF-MISSING；sourcePos 不是 struct:pos、sourceLevel 非数 E-DIM-STRUCT-FIELD', () => {
  const s = state();
  ports();
  assert.throws(() => see(s, 'cap_sight'), /E-DIM-REF-MISSING/);
  assert.throws(() => perceive(ENGINE, s, 'npc_obs', { channel: SIGHT, sourcePos: { x: 1 } }), /E-DIM-STRUCT-FIELD/);
  assert.throws(() => perceive(ENGINE, s, 'npc_obs', { channel: SIGHT, sourcePos: SRC, sourceLevel: 'loud' }), /E-DIM-STRUCT-FIELD/);
});

test('#29 加一种通道只加数据：夹具里新增的第五个通道 sense_test_aura（条目、物种阈值、perception.json 键都是数据）perceive 照常判定：到达 0.5 × 能力 1 − 灵觉阈值 0.1 = 0.4；判定式没有任何 sense_ 字面量（扫描由门禁 vol5.A5-2.1 一支守，见 perceive.mjs）', () => {
  ports({ arrival: 0.5 });
  assert.deepEqual(see(state(), AURA), { perceived: true, channel: AURA, margin: 0.4, rangeShortfallM: null });
});

// ---------- #36 withinReach ----------

test('#36 withinReach：距离不大于观察者位置层该通道可及距离为真、大于为假、任一未知为 null；恰等于为真；与 perceive 的规则 8 同一个距离同一个可及距离', () => {
  const s = state({ npc_nopos: { species: 'species_test_a' } });
  ports({ env: 5 });
  assert.equal(withinReach(ENGINE, s, 'npc_obs', 'npc_src', SIGHT), true);
  ports({ env: 4 });
  assert.equal(withinReach(ENGINE, s, 'npc_obs', 'npc_src', SIGHT), false);
  assert.equal(see(s).rangeShortfallM, 1, '与 perceive 同一个距离：5 − 4');
  assert.equal(withinReach(ENGINE, s, 'npc_obs', 'npc_nopos', SIGHT), null, '对方没有位置');
  assert.equal(withinReach(ENGINE, s, 'npc_nopos', 'npc_src', SIGHT), null, '观察者没有位置');
  ports({ env: null });
  assert.equal(withinReach(ENGINE, s, 'npc_obs', 'npc_src', SIGHT), null, '可及距离读不到');
  const calls = ports({ env: 100 });
  assert.equal(withinReach(ENGINE, s, 'npc_obs', 'npc_src', SIGHT), true);
  assert.equal(calls.length, 0, '不调 propagate、不看清醒与阈值');
});

test('#36 withinReach 的范围代号只限 rangeDim 非空的 sense：听觉（rangeDim 为 null）作范围代号即抛 E-DIM-DOMAIN-RANGE；不是 sense 条目抛 E-DIM-REF-MISSING', () => {
  const s = state();
  ports();
  assert.throws(() => withinReach(ENGINE, s, 'npc_obs', 'npc_src', HEAR), /E-DIM-DOMAIN-RANGE/);
  assert.throws(() => withinReach(ENGINE, s, 'npc_obs', 'npc_src', 'cap_sight'), /E-DIM-REF-MISSING/);
});

// ---------- #31–#35 perceiveEvent ----------

const VERB = { parent: null, payloadShape: {}, kindFrom: null, kindOnly: false, worthSlots: { destroyed: [], moved: [], stake: [] }, headSlot: null, sigBase: 0, tallies: [], perceivable: true, senses: [SIGHT, HEAR], visibilityAllowed: ['private', 'public', 'witnessed'], scandal: false, calendarBound: false };
const withVerbs = (rows) => ({ ...ENGINE, vocab: { ...ENGINE.vocab, index: new Map([...ENGINE.vocab.index, ...Object.entries(rows).map(([code, entry]) => [code, { family: 'verb', prefix: 'verb_', entry }])]) } });
const EV = withVerbs({
  verb_test_loud: VERB,
  verb_test_other: { ...VERB },
  verb_test_quiet: { ...VERB, perceivable: false, senses: [] },
  verb_test_reversed: { ...VERB, senses: [HEAR, SIGHT] },
  verb_test_aura: { ...VERB, senses: [AURA] },
});
// 事件发生在 (22,122,1) 南墙外。npc_act 行为人；npc_in 在屋里 (22,119,1)，隔着南墙相距 3 m；npc_blind 在 (24,121,1) 距 √5 m（盲）；
// npc_mid 在 (22,160,1) 距 38 m；npc_far 在 (22,290,1) 距 168 m；npc_nopos 没有位置。听觉候选半径 40 m、灵觉 60 m、能见距离（替身）100 m。
const PEOPLE = {
  npc_act: { pos: SRC, species: 'species_test_a' },
  npc_in: { pos: pos(22, 119), species: 'species_test_a' },
  npc_blind: { pos: pos(24, 121), species: 'species_test_blind' },
  npc_mid: { pos: pos(22, 160), species: 'species_test_a' },
  npc_far: { pos: pos(22, 290), species: 'species_test_a' },
  npc_nopos: { species: 'species_test_a' },
};
const ev = (extra = {}) => ({ verb: 'verb_test_loud', visibility: 'public', actor: 'npc_act', targets: [], place: 'loc_a', pos: SRC, sourceLevels: {}, ...extra });
const names = (list) => list.map((w) => [w.observer, w.senses.map((x) => [x.sense, x.margin])]);

test('#35 判定与形状：到达 0.5、能力 1、阈值 0.2 → 听视各 0.3；盲者没有视觉能力（0.5 × 0 − 0.2 < 0）只有听觉；行为人 npc_act 不进名单；168 m 外的 npc_far、没有位置的 npc_nopos 不在名单；按 observer id 序、senses 按感官代号序', () => {
  ports({ arrival: 0.5 });
  const s = fresh(PEOPLE);
  assert.deepEqual(names(perceiveEvent(EV, s, ev())), [
    ['npc_blind', [[HEAR, 0.3]]],
    ['npc_in', [[HEAR, 0.3], [SIGHT, 0.3]]],
    ['npc_mid', [[HEAR, 0.3], [SIGHT, 0.3]]],
  ]);
});

test('#34 候选：隔实墙相距 3 m 的 npc_in 是听觉候选（候选半径 40 m 远大于 3 m，隔墙不挡候选，A5-2.2）；rangeDim 非空的视觉候选读同一个可及距离——能见距离 2 m 时没有人在视觉候选里（npc_blind 2.24 m、npc_in 3 m），听觉照旧', () => {
  const s = fresh(PEOPLE);
  ports({ arrival: 0.5, env: 2 });
  assert.deepEqual(names(perceiveEvent(EV, s, ev())), [['npc_blind', [[HEAR, 0.3]]], ['npc_in', [[HEAR, 0.3]]], ['npc_mid', [[HEAR, 0.3]]]]);
  ports({ arrival: 0.5, env: null });
  assert.deepEqual(names(perceiveEvent(EV, s, ev())), [['npc_blind', [[HEAR, 0.3]]], ['npc_in', [[HEAR, 0.3]]], ['npc_mid', [[HEAR, 0.3]]]], '可及距离读不到：视觉没有候选');
  ports({ arrival: 0.5 });
  // npc_mid 距 38 m，候选半径 40 m 之内；把听觉候选半径收到 30 m，它就出局（半径只读 rules.perception.candidateRadiusM）。
  const tight = withRules(EV, { perception: { ...EV.rules.perception, candidateRadiusM: { ...EV.rules.perception.candidateRadiusM, [HEAR]: 30 } } });
  assert.deepEqual(names(perceiveEvent(tight, s, ev())), [['npc_blind', [[HEAR, 0.3]]], ['npc_in', [[HEAR, 0.3], [SIGHT, 0.3]]], ['npc_mid', [[SIGHT, 0.3]]]]);
});

test('#33 visibility 三档：private 空表；witnessed、public 同样求目击；动词行 perceivable 为假、发生地点为空都是空表；targets 与旁人一样经判定（判不到不在名单）', () => {
  ports({ arrival: 0.5 });
  const s = fresh(PEOPLE);
  const all = names(perceiveEvent(EV, s, ev()));
  assert.equal(all.length, 3);
  assert.deepEqual(perceiveEvent(EV, s, ev({ visibility: 'private' })), []);
  assert.deepEqual(names(perceiveEvent(EV, s, ev({ visibility: 'witnessed' }))), all);
  assert.deepEqual(perceiveEvent(EV, s, ev({ verb: 'verb_test_quiet' })), []);
  assert.deepEqual(perceiveEvent(EV, s, ev({ place: null })), []);
  // targets：npc_in 在名单里，npc_far（判不到）不在；行为人不在名单里，纵然写进 targets 也只经判定（自知域不进本判定）。
  assert.deepEqual(names(perceiveEvent(EV, s, ev({ targets: ['npc_in', 'npc_far'] }))), all);
  assert.throws(() => perceiveEvent(EV, s, ev({ visibility: 'loud' })), /E-DIM-DOMAIN-RANGE/);
  assert.throws(() => perceiveEvent(EV, s, ev({ verb: 'sense_sight' })), /E-DIM-REF-MISSING/);
});

test('#32 发生位置：事件给了 pos 用它；pos 为空取行为人的 pos；仍没有可用位置则目击名单为空表（不落代表格冒充）', () => {
  ports({ arrival: 0.5 });
  const all = names(perceiveEvent(EV, fresh(PEOPLE), ev()));
  // 行为人在别处 (22,290)，事件 pos 给定 (22,122)：以事件 pos 为准，名单同上（行为人仍不进名单，远处的 npc_far 仍不在）。
  const away = fresh({ ...PEOPLE, npc_act: { pos: pos(22, 290), species: 'species_test_a' } });
  assert.deepEqual(names(perceiveEvent(EV, away, ev())), all);
  // pos 为空取行为人 pos：行为人在 (22,122)，与给定 pos 同。
  assert.deepEqual(names(perceiveEvent(EV, fresh(PEOPLE), ev({ pos: null }))), all);
  // 行为人没有位置、事件也没有 pos：空表；没有行为人同。
  assert.deepEqual(perceiveEvent(EV, fresh({ ...PEOPLE, npc_act: { species: 'species_test_a' } }), ev({ pos: null })), []);
  assert.deepEqual(perceiveEvent(EV, fresh(PEOPLE), ev({ pos: null, actor: null })), []);
});

test('#35 次序无关与重跑：动词行 senses 倒序、个体建档次序倒序，结果逐位相同；同一状态重跑逐位相同；换一个动词代号（同字段）结果相同（不按动词分支）；调用前后状态不变', () => {
  ports({ arrival: 0.5 });
  const s = fresh(PEOPLE);
  const before = JSON.stringify(s);
  const base = perceiveEvent(EV, s, ev());
  assert.deepEqual(perceiveEvent(EV, s, ev({ verb: 'verb_test_reversed' })), base);
  assert.deepEqual(perceiveEvent(EV, s, ev({ verb: 'verb_test_other' })), base);
  const flipped = fresh(Object.fromEntries(Object.entries(PEOPLE).reverse()));
  assert.deepEqual(perceiveEvent(EV, flipped, ev()), base);
  assert.equal(JSON.stringify(perceiveEvent(EV, s, ev())), JSON.stringify(base));
  assert.equal(JSON.stringify(s), before);
});

test('#35 margin 只在同一感官内比较：睡着时（awakeMin 提到 2）视觉不再感知，名单里只剩听觉；新通道灵觉 sense_test_aura 只加数据即进名单：候选半径 60 m，到达 0.5 − 阈值 0.1 = 0.4，npc_mid（38 m）在内、npc_far（168 m）不在', () => {
  ports({ arrival: 0.5 });
  const s = fresh(PEOPLE);
  const asleep = withRules(EV, { capacity: { ...EV.rules.capacity, awakeMin: 2 } });
  assert.deepEqual(names(perceiveEvent(asleep, s, ev())), [['npc_blind', [[HEAR, 0.3]]], ['npc_in', [[HEAR, 0.3]]], ['npc_mid', [[HEAR, 0.3]]]]);
  assert.deepEqual(names(perceiveEvent(EV, s, ev({ verb: 'verb_test_aura' }))), [['npc_blind', [[AURA, 0.4]]], ['npc_in', [[AURA, 0.4]]], ['npc_mid', [[AURA, 0.4]]]]);
});

test('#31 sourceLevels 原样传给 propagate：事件传入 {sense_hearing: 12} 时听觉判定的 sourceLevel 是 12，没键的感官按空（null）传', () => {
  const calls = ports({ arrival: 0.5 });
  perceiveEvent(EV, fresh({ npc_act: PEOPLE.npc_act, npc_in: PEOPLE.npc_in }), ev({ sourceLevels: { [HEAR]: 12 } }));
  assert.deepEqual(calls.map((c) => [c.channel, c.level]), [[HEAR, 12], [SIGHT, null]]);
});

// ---------- #26、#37 一次性源强与感知一个实体 ----------

test('#26 一次性源强：以行为人为主体，基值取其物种行 sourceStrength（键覆盖 sense 全族）；非个体、没有物种的行为人各感官为 null（所在表没有该列或读不到，不拿别的量顶替）', () => {
  const s = fresh({ ...PEOPLE, npc_nosp: { pos: pos(1, 1) } });
  assert.deepEqual(sourceLevelsOf(ENGINE, s, 'npc_act'), { [HEAR]: 40, [SIGHT]: 20, [SMELL]: 10, [AURA]: 30, [VIB]: 5 });
  assert.deepEqual(sourceLevelsOf(ENGINE, s, 'npc_nosp'), { [HEAR]: null, [SIGHT]: null, [SMELL]: null, [AURA]: null, [VIB]: null });
  assert.deepEqual(sourceLevelsOf(ENGINE, s, 'loc_a'), { [HEAR]: null, [SIGHT]: null, [SMELL]: null, [AURA]: null, [VIB]: null });
});

test('#37 感知一个实体：存在感官 s 使 perceive(X, {s, E 的位置, E 的 s 源强}) 为真才算。到达量替身取 源强 ÷ 100：听 0.4、视 0.2、嗅 0.1、灵觉 0.3、震 0.05；观察者阈值 听 0.2、视 0.2、嗅 0.3、灵觉 0.1、震 0.1 → margin 听 0.2、视 0（恰 0 算感知到）、嗅 −0.2、灵觉 0.2、震 −0.05；感知到的是 听、视、灵觉', () => {
  ports({ arrival: (channel, level) => level / 100 });
  const s = fresh({ ...PEOPLE, item_test_bench: {} });
  assert.deepEqual(perceivesEntity(ENGINE, s, 'npc_in', 'npc_act'), { perceived: true, senses: [{ sense: HEAR, margin: 0.2 }, { sense: SIGHT, margin: 0 }, { sense: AURA, margin: 0.2 }] });
});

test('#37 位置未知、没有源强列、位置要批次 spot 一律判没有感知到：个体没有位置；物品（批次 spot 字段未登记）；地点行（place 表没有 sourceStrength 列）', () => {
  ports({ arrival: 5 });
  const s = fresh({ ...PEOPLE, item_test_bench: {} });
  const none = { perceived: false, senses: [] };
  assert.deepEqual(perceivesEntity(ENGINE, s, 'npc_in', 'npc_nopos'), none);
  assert.deepEqual(perceivesEntity(ENGINE, s, 'npc_in', 'item_test_bench'), none);
  assert.deepEqual(perceivesEntity(ENGINE, s, 'npc_in', 'loc_a'), none);
});

// ---------- #27、#28、#36 加载期校验 ----------

const view = (mutate = () => {}) => {
  const families = new Map([...ENGINE.vocab.families].map(([k, v]) => [k, { ...v, entries: clone(v.entries) }]));
  const rules = clone({ perception: ENGINE.rules.perception });
  mutate({ senses: families.get('sense').entries, rules });
  return { vocab: { families }, rules };
};
const codes = (v) => checkSenseTables(v).map((e) => `${e.code} ${e.row || e.table} ${e.dim}`);

test('#27/#28 夹具世界（真实 sense 四条目加夹具灵觉条目、perception.json 键集）通过 checkSenseTables，错误为 0', () => {
  assert.deepEqual(checkSenseTables(view()), []);
});

test('#27 sense 族条目三项每条必写：缺 rangeDim（无限制要显式写 null，不设缺省）E-DIM-REQUIRED-MISSING；capability 不是能力族条目 E-DIM-REF-MISSING；perceivedAsleep 非布尔、rangeDim 非串非 null E-DIM-STRUCT-FIELD', () => {
  assert.deepEqual(codes(view(({ senses }) => { delete senses.sense_hearing.rangeDim; })), ['E-DIM-REQUIRED-MISSING sense_hearing rangeDim']);
  assert.deepEqual(codes(view(({ senses }) => { senses.sense_smell.capability = 'cap_nope'; })), ['E-DIM-REF-MISSING sense_smell capability']);
  assert.deepEqual(codes(view(({ senses }) => { senses.sense_vibration.perceivedAsleep = 'yes'; })), ['E-DIM-STRUCT-FIELD sense_vibration perceivedAsleep']);
  assert.deepEqual(codes(view(({ senses }) => { senses.sense_sight.rangeDim = 7; })), ['E-DIM-STRUCT-FIELD sense_sight rangeDim']);
});

test('#28 perception.json：marginBase 键集须覆盖 sense 全族（缺键 E-DIM-REQUIRED-MISSING、多键 E-DIM-REF-MISSING、非数 E-DIM-DOMAIN-RANGE）；candidateRadiusM 键集恰为 rangeDim 为空的通道（缺 E-DIM-REQUIRED-MISSING，给了有 rangeDim 的视觉 E-DIM-DOMAIN-RANGE，负数 E-DIM-DOMAIN-RANGE）', () => {
  assert.deepEqual(codes(view(({ rules }) => { delete rules.perception.marginBase[HEAR]; })), ['E-DIM-REQUIRED-MISSING perception marginBase']);
  assert.deepEqual(codes(view(({ rules }) => { rules.perception.marginBase.sense_nope = 0; })), ['E-DIM-REF-MISSING perception marginBase']);
  assert.deepEqual(codes(view(({ rules }) => { rules.perception.marginBase[SIGHT] = 'x'; })), ['E-DIM-DOMAIN-RANGE perception marginBase']);
  assert.deepEqual(codes(view(({ rules }) => { delete rules.perception.candidateRadiusM[SMELL]; })), ['E-DIM-REQUIRED-MISSING perception candidateRadiusM']);
  assert.deepEqual(codes(view(({ rules }) => { rules.perception.candidateRadiusM[SIGHT] = 50; })), ['E-DIM-DOMAIN-RANGE perception candidateRadiusM']);
  assert.deepEqual(codes(view(({ rules }) => { rules.perception.candidateRadiusM[HEAR] = -1; })), ['E-DIM-DOMAIN-RANGE perception candidateRadiusM']);
});

test('#36 卷十三 rules.combat.deterrence.groupRadius 取值须是 rangeDim 非空的 sense 代号（视觉可，听觉与不存在的代号不可）；该规则表未登记时不核', () => {
  const withRadius = (g) => view(({ rules }) => { rules.combat = { deterrence: { groupRadius: g } }; });
  assert.deepEqual(checkSenseTables(withRadius(SIGHT)), []);
  assert.deepEqual(codes(withRadius(HEAR)), ['E-DIM-DOMAIN-RANGE combat.deterrence groupRadius']);
  assert.deepEqual(codes(withRadius('sense_nope')), ['E-DIM-DOMAIN-RANGE combat.deterrence groupRadius']);
});
