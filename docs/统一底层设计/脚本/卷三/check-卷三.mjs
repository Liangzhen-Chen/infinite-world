// 卷三甲、卷三乙自检脚本（写卷须知"交稿前"第 1 条；由 check-卷三.mjs 按拆卷改为两卷各跑一遍）。只读文档，不改任何文件。
// 用法：node F:/dnd/docs/统一底层设计/脚本/卷三/check-卷三.mjs 甲|乙      （不带参数则两卷都跑）
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { registeredFamilies } from '../全书/vocab-families.mjs';
import { runReaderCheck } from './check-卷三-读取者.mjs';

const DIR = 'F:/dnd/docs/统一底层设计/';
export const MARK = '<!--CHECK-OUTPUT-->';
const SUB_TITLES = ['维度', '统一入口', '规则', '交互', '数据实例', '验收断言'];
// 第五版：植物部位词表的单点定义在卷二十五 §2.4，本脚本从那里读已登记的代号
const V25 = DIR + '卷二十五-农牧渔猎与食物链.md';

// 实体前缀（卷二 §1.9）；词表族前缀不在其内
const ENTITY_PREFIX = ['item', 'mat', 'species', 'flora', 'body', 'npc', 'creature', 'loc', 'bld', 'fac', 'recipe',
  'org', 'office', 'polity', 'law', 'deity', 'faith', 'culture', 'profession', 'skill', 'lore', 'offense', 'status',
  'etype', 'eff', 'mod'];
// 不是实体 id 的固定词（表名、词表族名）
const NOT_ID = new Set(['body_plan', 'body_part', 'law_code', 'status_family', 'status_target', 'status_tick']);

// 台账第五节判给卷三的 15 个概念 → 必须写全的小节与关键代号。拆卷后"材料属性"一条分两半：数值字段在甲，派生量在乙；其余 14 条全在乙。
const CFG = {
  甲: {
    doc: DIR + '卷三甲-物质本源.md', subsystems: 5, labelFrom: '### 2.1 ', labelTo: '### 2.2 ', migMin: 5, apiMin: 0,
    ledger: [
      ['材料属性·数值字段（含打捞比例维度）', [1, 2, 3, 4], ['density', 'strength', 'sharpnessMax', 'ignitePoint', 'meltPoint', 'boilPoint', 'heatDamagePoint', 'rotRate', 'nutrients', 'salvageFraction', 'valueMult', 'substance', 'volatility', 'malleability']],
      ['材料数据全集', [5], ['MATERIAL-DATA-BEGIN', 'REACT-BEGIN']],
    ],
    folded: [],
  },
  乙: {
    doc: DIR + '卷三乙-物态类别与物品.md', subsystems: 19, labelFrom: '### 2.1 ', labelTo: '### 2.3 ', migMin: 20, apiMin: 10,
    ledger: [
      ['材料属性·派生量与归类', [1], ['hardness', 'toughness', 'charYield', 'producedBy', 'hydration', 'rules.materials.matcatRules', 'rules.items.aggregation', 'salvageFraction']],
      ['物态两种读法', [11], ['matterStateOf', 'possibleMatterStates', 'T-12', 'T-13']],
      ['物品通用字段', [2], ['massKg', 'material', 'volumeL', 'sizeClass', 'classes', 'acceptsMaterial']],
      ['类别与用度类九维', [3], ['sourceMode', 'usageClass', 'necessityTier', 'substitutePool', 'fragility', 'produceSeason', 'selfMakeRecipe', 'wearResistance', 'transportMode', 'shortage']],
      ['容器与批次元数据', [4], ['volumeCapacity', 'maxLoadKg', 'sealed', 'taint', 'purports', 'lotsView']],
      ['品质档', [5], ['qualityTier', 'rules.quality.tiers', 'rules.quality.thresholds']],
      ['工具能力 ability', [6], ['abilities', 'abilityLevel', 'abilityIndex']],
      ['需求块的内容与用法', [7], ['requirementCheck', 'requirementPlan', 'matcats', 'consumed', 'times']],
      ['配方通用规则（继承、产率、递归）', [8], ['materialFrom', 'reactionYield', 'yield', '递归', 'craftOutcome', 'matDiff', 'mastery', '质量链', '件数链']],
      ['热属性与燃烧', [11], ['ignitePoint', 'heatValue', 'burnRate', 'deflagEnergy', 'thermalStep', 'burnOutcome']],
      ['腐坏', [12], ['rotRate', 'spoilage', 'shelfLifeDays', 'rotStep']],
      ['服装与护甲物性', [13], ['layer', 'covers', 'warmth', 'protection', 'wornProfile']],
      ['书与文书物性', [15], ['language', 'teaches', 'docKind', 'copyOf', 'documentStanding']],
      ['估值公式与稀缺度派生', [16], ['valueBase', 'valuation', 'scarcity', 'conditionCurve']],
      ['可替代折算', [17], ['substitutePool', 'fuelEnergyMJ', 'satietyTotal', 'substituteQty']],
      ['运法与货值密度', [18], ['transportMode', 'valueDensity', 'shipmentProfile']],
    ],
    folded: [9, 10, 14, 19],
  },
};

export function runCheck(which) {
  const cfg = CFG[which];
  const out = [];
  let fail = 0;
  const say = (ok, msg) => { out.push((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fail += 1; };

  const raw = readFileSync(cfg.doc, 'utf8').replace(/\r\n/g, '\n');
  const cut = raw.indexOf('\n## 附录 ');
  const body = cut >= 0 ? raw.slice(0, cut) : raw;
  const lines = body.split('\n');

  // ---------- 1. §0–§8 与术语表齐全 ----------
  const top = [];
  lines.forEach((l, i) => { if (/^## /.test(l)) top.push({ i, l }); });
  for (let n = 0; n <= 8; n += 1) say(top.some((t) => new RegExp('^## §' + n + ' ').test(t.l)), '章节 §' + n + ' 存在');
  say(top.some((t) => /^## 附 术语与代号表/.test(t.l)), '附 术语与代号表 存在');
  // 第三版改锚点：版本号加一，标题随之改；断言内容（标题带现行版本号）不变。
  // 第四版改锚点：版本号加一，标题随之改；断言内容（标题带现行版本号）不变。
  // 第五版改锚点：版本号加一，标题随之改；断言内容（标题带现行版本号）不变。
  // 第六版改锚点：版本号加一，标题随之改；断言内容（标题带现行版本号）不变。
  say(/^# 卷三[甲乙] .*（第七版）$/.test(lines[0]), '标题为现行版本（第七版）');

  const topIndex = (re) => { const t = top.find((x) => re.test(x.l)); return t ? t.i : -1; };
  const topEnd = (start) => { const nx = top.find((x) => x.i > start); return nx ? nx.i : lines.length; };
  const zoneOfTop = (re) => { const s = topIndex(re); return s < 0 ? null : [s, topEnd(s)]; };

  // ---------- 2. 子系统与六小节 ----------
  const subBlocks = {};
  const h3 = []; lines.forEach((l, i) => { if (/^### /.test(l) || /^## /.test(l)) h3.push(i); });
  for (let n = 1; n <= cfg.subsystems; n += 1) {
    const s = lines.findIndex((l) => new RegExp('^### 4\\.' + n + ' ').test(l));
    if (s < 0) { say(false, '子系统 4.' + n + ' 标题缺失'); continue; }
    const e = h3.find((i) => i > s) ?? lines.length;
    const parts = {};
    let okAll = true; let last = s;
    SUB_TITLES.forEach((title, k) => {
      const idx = lines.findIndex((l, i) => i > s && i < e && l.startsWith('#### 4.' + n + '.' + (k + 1) + ' ' + title));
      if (idx < 0 || idx < last) okAll = false; else { parts[k] = idx; last = idx; }
    });
    const bounds = {};
    SUB_TITLES.forEach((_, k) => {
      if (parts[k] === undefined) return;
      const nexts = Object.values(parts).filter((v) => v > parts[k]);
      bounds[k] = [parts[k], nexts.length ? Math.min(...nexts) : e];
    });
    subBlocks[n] = { start: s, end: e, bounds };
    say(okAll, '子系统 4.' + n + ' 六小节齐全且顺序正确');
    if (!okAll) continue;
    const inst = lines.slice(bounds[4][0], bounds[4][1]);
    const rows = inst.filter((l) => /^- 例 \d+/.test(l));
    const txt = inst.join('\n');
    const okInst = rows.length >= 3 && txt.includes('【非西陲】') && (txt.includes('【非人类】') || txt.includes('【超自然】'));
    say(okInst, '子系统 4.' + n + ' 数据实例 ' + rows.length + ' 条（需≥3，含非西陲、含非人类或超自然）');
    const acc = lines.slice(bounds[5][0], bounds[5][1]).join('\n');
    say(acc.includes('扫描式') && acc.includes('不变量式') && acc.includes('扩展性式'), '子系统 4.' + n + ' 验收断言含扫描式、不变量式、扩展性式');
  }
  const extraSub = lines.filter((l) => new RegExp('^### 4\\.' + (cfg.subsystems + 1) + ' ').test(l)).length;
  say(extraSub === 0, '子系统数恰为 ' + cfg.subsystems);

  // ---------- 3. 具体 id 字面量（规则正文不得出现） ----------
  const allowed = [];
  for (const re of [/^## §1 /, /^## §6 /, /^## §7 /]) { const z = zoneOfTop(re); if (z) allowed.push(z); }
  for (const n of Object.keys(subBlocks)) { const b = subBlocks[n].bounds[4]; if (b) allowed.push(b); }
  const inAllowed = (i) => allowed.some(([a, b]) => i >= a && i < b);
  const idRe = new RegExp('(?<![A-Za-z0-9_])(?:' + ENTITY_PREFIX.join('|') + ')_[a-z0-9][a-z0-9_]*', 'g');
  // 已登记的词表族名（如卷二十一的 body_need）不是实体 id：按全书族登记表豁免（vocab-families.mjs，与 check-卷四 同口径），不逐个手加
  const FAMS = registeredFamilies(undefined, { [cfg.doc.replace(/^.*\//, '').replace(/-.*$/, '-')]: raw });
  const idHits = [];
  lines.forEach((l, i) => {
    if (inAllowed(i)) return;
    for (const m of l.matchAll(idRe)) { if (!NOT_ID.has(m[0]) && !FAMS.has(m[0])) idHits.push((i + 1) + ': ' + m[0]); }
  });
  say(idHits.length === 0, '规则正文无具体实体 id 字面量（命中 ' + idHits.length + ' 处）');
  idHits.slice(0, 20).forEach((h) => out.push('     ' + h));

  // ---------- 4. 用于判断的自然语言文本 ----------
  const nlAllowed = [];
  for (const re of [/^## §1 /, /^## §7 /]) { const z = zoneOfTop(re); if (z) nlAllowed.push(z); }
  const inNl = (i) => nlAllowed.some(([a, b]) => i >= a && i < b);
  const CJK = '[\\u3400-\\u9fff]';
  const nlRes = [
    [/\b(includes|startsWith|endsWith|indexOf|match|test|search)\s*\(/, '字符串匹配调用'],
    [/new RegExp|\/[^/\s]*[\u3400-\u9fff][^/\s]*\/[gimsuy]*/, '正则'],
    [new RegExp('[=!]==?\\s*[\'"][^\'"]*' + CJK), '与中文字面量比较'],
    [new RegExp('(where|when|filter|weightRX|failureRX|valueRX)\\s*:\\s*"[^"]*' + CJK), 'RX 文本含中文'],
    [new RegExp('(stage|scope|target|layer|usageClass|docKind|reaction|qualityTier)\\s*:\\s*"?' + CJK), '代号位置出现中文值'],
  ];
  const nlHits = [];
  lines.forEach((l, i) => {
    if (inNl(i)) return;
    for (const [re, name] of nlRes) if (re.test(l)) nlHits.push((i + 1) + ': ' + name);
  });
  say(nlHits.length === 0, '正文无用于判断的中文或英文描述性文本（命中 ' + nlHits.length + ' 处）');
  nlHits.slice(0, 20).forEach((h) => out.push('     ' + h));
  const rxIdHits = [];
  lines.forEach((l, i) => {
    for (const m of l.matchAll(/(?:where|when|filter|weightRX)\s*:\s*"([^"]*)"/g)) {
      if (idRe.test(m[1])) rxIdHits.push((i + 1) + ': ' + m[1]);
      idRe.lastIndex = 0;
    }
  });
  say(rxIdHits.length === 0, '全部 RX 条件文本不含实体 id（命中 ' + rxIdHits.length + ' 处）');

  // ---------- 5. 台账判给本卷的概念写全 ----------
  for (const [name, secs, tokens] of cfg.ledger) {
    const text = secs.map((n) => (subBlocks[n] ? lines.slice(subBlocks[n].start, subBlocks[n].end).join('\n') : '')).join('\n');
    const miss = tokens.filter((t) => !text.includes(t));
    say(miss.length === 0, '台账概念「' + name + '」在 §4.' + secs.join('/§4.') + ' 写全' + (miss.length ? '（缺 ' + miss.join('、') + '）' : ''));
  }
  for (const n of cfg.folded) say(Boolean(subBlocks[n]), '台账折叠小节 §4.' + n + ' 存在');

  // ---------- 6. 维度表 labels、迁移清单、扩展性测试、开放问题 ----------
  const z2 = zoneOfTop(/^## §2 /);
  if (z2) {
    const dimRows = lines.slice(z2[0], z2[1]).filter((l) => /^\| `[a-zA-Z]/.test(l));
    const a = lines.findIndex((l) => l.startsWith(cfg.labelFrom));
    const b = lines.findIndex((l) => l.startsWith(cfg.labelTo));
    const fieldRows = lines.slice(a, b).filter((l) => /^\| `[a-zA-Z]/.test(l));
    const noLabel = fieldRows.filter((l) => !/ \/ [^|]*\|\s*$/.test(l));
    say(fieldRows.length > 0 && noLabel.length === 0, cfg.labelFrom.trim() + ' 至 ' + cfg.labelTo.trim() + ' 之前的字段行都带中英 labels（' + fieldRows.length + ' 行，缺 ' + noLabel.length + '）');
    noLabel.slice(0, 10).forEach((l) => out.push('     ' + l.slice(0, 60)));
    const cjkKey = dimRows.filter((l) => new RegExp('^\\| `[^`]*' + CJK).test(l));
    say(cjkKey.length === 0, '§2 字段键全部为 ASCII 代号（' + dimRows.length + ' 行）');
  }
  const z7 = zoneOfTop(/^## §7 /);
  // 迁移行按表头“原行号”列取数（首列加 M3a-n/M3b-n 编号列与否都能数）；该列值须为数字或 A-数字
  let migRows = 0;
  if (z7) {
    const s7 = lines.slice(z7[0], z7[1]); let col = -1;
    const cells = (l) => l.split('|').slice(1, -1).map((c) => c.trim());
    s7.forEach((l, i) => {
      if (!l.startsWith('|')) { col = -1; return; }
      if (/^\|[\s|:-]+\|$/.test(s7[i + 1] || '')) { col = cells(l).indexOf('原行号'); return; }
      if (/^\|[\s|:-]+\|$/.test(l) || col < 0) return;
      if (/^(\d+|A-\d+)(（|$)/.test(cells(l)[col] || '')) migRows++;
    });
  }
  say(migRows >= cfg.migMin, '§7 迁移与退役清单 ' + migRows + ' 行');
  const z6 = zoneOfTop(/^## §6 /);
  const extRows = z6 ? lines.slice(z6[0], z6[1]).filter((l) => /^\| EA?-\d+/.test(l)).length : 0;
  say(extRows >= 3, '§6 扩展性测试 ' + extRows + ' 条');
  const z8 = zoneOfTop(/^## §8 /);
  const qRows = z8 ? lines.slice(z8[0], z8[1]).filter((l) => /^\| Q-[A\d]/.test(l)).length : 0;
  say(qRows >= 1, '§8 开放问题 ' + qRows + ' 条');
  const z5 = zoneOfTop(/^## §5 /);
  const s52 = lines.findIndex((l) => l.startsWith('### 5.2 ')); const s53 = lines.findIndex((l) => l.startsWith('### 5.3 '));
  const apiRows = z5 ? lines.slice(s52, s53).filter((l) => /^\| `[a-zA-Z]+`? ?[/|(]/.test(l) || /^\| `[a-zA-Z]+` /.test(l)).length : 0;
  const all = lines.join('\n');

  // ---------- 7. 拆卷专项 ----------
  if (which === '甲') {
    say(lines.slice(s52, s53).join('\n').includes('无。函数入口全部在卷三乙'), '§5.2 声明本卷不提供函数入口');
    const a = lines.findIndex((l) => l.startsWith('### 2.1 ')); const b = lines.findIndex((l) => l.startsWith('### 2.2 '));
    const f21 = lines.slice(a, b).filter((l) => /^\| `[a-zA-Z]/.test(l));
    const derived = f21.filter((l) => /derived/.test(l)).length;
    const ruleKeys = f21.filter((l) => /rules\./.test(l)).length;
    say(derived === 0, '§2.1 没有派生字段（命中 ' + derived + ' 行）');
    say(ruleKeys === 0, '§2.1 字段行的取值域、必填条件不引用任何规则表键（命中 ' + ruleKeys + ' 行）');
    const six = ['hardness', 'toughness', 'charYield', 'hydration', 'producedBy', 'categories'].filter((k) => f21.some((l) => l.startsWith('| `' + k + '`')));
    say(six.length === 0, '六个派生量不在本卷字段表里（命中 ' + six.length + '）');
    const stateField = f21.filter((l) => /^\| `(matterState|possibleMatterStates|bulkForm)`/.test(l)).length;
    say(stateField === 0, '材料表没有物态字段、没有聚集形态字段（命中 ' + stateField + '）');
    const ambient = lines.map((l, i) => (/常温/.test(l) ? i + 1 : 0)).filter(Boolean);
    say(ambient.length === 0, '全卷不出现"常温"（挥发度等定义不靠默认温度；命中 ' + ambient.length + ' 处' + (ambient.length ? '：' + ambient.join(',') : '') + '）');
    const vRow = f21.find((l) => l.startsWith('| `volatility`')) || '';
    say(vRow.includes('per_day_volatile') && !/\d+ ?(℃|celsius|摄氏)/.test(vRow), '挥发度的定义行不含温度数值，标定条件在单位定义里');
    // 第二版：标定条件由三个增为四个（加易燃度的换算与标定气氛），原三个照查。
    say(all.includes('`rotAnchor`') && all.includes('per_day_rot') && all.includes('volatilityAnchor') && all.includes('gasDensityAnchor') && all.includes('flammabilityAnchor') && all.includes('flam_index'), '§2.3 单位定义带四个标定条件（腐坏、挥发、气体密度、易燃度）');
    // 第二版改锚点：卷二 §1.4 的标定句由"1 MJ/kg 干重"改为"每千克干重的总能 1 兆焦"（李白 11-13 裁定），本卷照引新句；旧句不得再出现。
    say(!/^\| `?satiety`? \|/m.test(all) && all.includes('1 satiety = 每千克干重的总能 1 兆焦') && !all.includes('1 satiety = 1 MJ/kg 干重') && all.includes('卷二 §1.4'), '饱腹单位不在本卷登记，只引卷二 §1.4（总能口径）');
    // 第二版新增（一审第 1、7、8 条的可机判部分）
    const fRow = (k) => f21.find((l) => l.startsWith('| `' + k + '`')) || '';
    say(/自燃点/.test(fRow('ignitePoint')) && /不是闪点/.test(fRow('ignitePoint')) && /闪点/.test(fRow('flashPoint')), '`ignitePoint` 写明是自燃点，另有 `flashPoint` 一栏');
    say(fRow('flammability').includes('flam_index') && /极限氧/.test(fRow('flammability')), '易燃度有可测定义（由极限氧浓度换算）');
    const badRef = lines.map((l, i) => (/卷四 §4\.5(?!\d)[^|]{0,12}(diet|T-4)|卷四 §4\.5 T-4|卷十九 §4\.3[^|]{0,30}(thermalConductivity|soundAttenuation)/.test(l) || /\| 卷四 §4\.5[ /|]/.test(l) || /卷十九 §4\.3[/、]/.test(l) ? i + 1 : 0)).filter(Boolean);
    say(badRef.length === 0, '不再把 diet 族、T-4 引到卷四 §4.5，不再把导热与隔声引到卷十九 §4.3（命中 ' + badRef.length + ' 处' + (badRef.length ? '：' + badRef.join(',') : '') + '）');
    say(!/借记草本|暂归/.test(all.replace(/不再借记草本/g, '')) && all.includes('本源成分不得借记'), '本源成分不得借记：表里没有"借记""暂归"的行');
    say(all.includes('本卷不设规则表') && !lines.some((l) => /^\| `rules\./.test(l)), '本卷不设规则表（没有以规则表键开头的表行）');
    const ruleRows = lines.filter((l) => /^\| M-\d+ \|/.test(l));
    say(ruleRows.length > 0 && ruleRows.every((l) => /^\| M-\d+ \| 校验 \|/.test(l)), '规则小节 ' + ruleRows.length + ' 条全部是校验，没有派生、反应、时钟、动作');
    say(all.includes('byDigestible') && all.includes('M-16') && all.includes('可消化成分集'), '营养维度的必填条件按可消化成分写（卷四余项 N-2）');
    say(/十二项/.test(all) && all.includes('subst_water') && all.includes('subst_animal_product'), '本源成分词表十二项（含水、动物产物）');
    // 第五版新增（植物部位、易燃度出处区间、加载警告清单的可机判部分；李白 11-13 裁定）。只加不放宽，上面各条照查。
    const mRow = (id) => lines.find((l) => l.startsWith('| ' + id + ' | 校验 |')) || '';
    const ppRow = fRow('plantPart');
    say(ppRow.includes('ref vocab plant_part') && ppRow.includes('bySubstance:subst_plant,subst_wood') && ppRow.includes('M-17') && ppRow.includes('卷二十五 §2.4') && /\| gap \|/.test(ppRow) && ppRow.includes('加载警告清单'),
      '`plantPart` 引卷二十五 §2.4 的 plant_part 词表；只对草本植物质、木质两项的行必填（bySubstance）；缺了按 gap 记缺口、进加载警告清单');
    say(all.includes('`bySubstance:<代号>,…`') && lines.some((l) => /^\| AP-6 \|/.test(l) && l.includes('`plant_part`')), '必填条件 bySubstance 有定义；AP-6 禁止另立植物部位词表');
    const m17 = mRow('M-17');
    say(['`plant_part`', '卷二十五 §2.4', '`bySubstance`', '`gap`', '加载警告清单', '不适用', '写了即加载报错', '不得借记'].every((k) => m17.includes(k)),
      'M-17 校验存在：部位须在卷二十五 plant_part 族、植物质行必填而缺了只记缺口进警告、别的行不适用写了报错、不得借记');
    const frRow = fRow('flammabilityRange');
    const m18 = mRow('M-18');
    say(frRow.includes('flam_index') && frRow.includes('M-18') && frRow.includes('不是成堆值') && m18.includes('`flammabilityRange`') && m18.includes('`min ≤ flammability ≤ max`') && m18.includes('两栏同有同无') && m18.includes('`flammability` 为 0 的行不得填'),
      '`flammabilityRange` 是出处区间（不是成堆值），M-18 校验存在（min ≤ 点值 ≤ max、两栏同有同无、不可燃行不得填）');
    const warnPara = lines.find((l) => l.startsWith('**加载警告清单（第五版')) || '';
    say(warnPara.includes('缺 `plantPart`') && warnPara.includes('山羊毛、毡的极限氧') && warnPara.includes('`reliefMax`'), '§3.5 加载警告清单列三类：植物质行缺部位、依据"未核"的值（含山羊毛、毡的极限氧）、规则表里的假设常数 reliefMax');
    const flamUnit = lines.find((l) => l.startsWith('| `flam_index` |')) || '';
    say(flamUnit.includes('向下、最难方向'), '§2.3 易燃度的测法写明火向下、最难方向（卷三乙燃料判定读这个单件值）');
    // 部位短表（§4.5.5 例 6）：行集合恰是本源成分为草本植物质或木质的行；代号都在卷二十五 plant_part 族；留空的行列出（进警告）
    const blkRows = (b, e) => {
      const s = lines.findIndex((l) => l.startsWith(b)); const t = lines.findIndex((l, i) => i > s && l.startsWith(e));
      return s < 0 || t < 0 ? null : lines.slice(s + 1, t).filter((l) => /^\| mat_/.test(l)).map((l) => l.split('|').slice(1, -1).map((c) => c.trim().replace(/`/g, '')));
    };
    const dataRows = blkRows('<!--MATERIAL-DATA-BEGIN-->', '<!--MATERIAL-DATA-END-->') || [];
    const ppRows = blkRows('<!--PLANTPART-DATA-BEGIN-->', '<!--PLANTPART-DATA-END-->');
    const v25Row = readFileSync(V25, 'utf8').replace(/\r\n/g, '\n').split('\n').find((l) => l.startsWith('| `plant_part` |')) || '';
    const ppVocab = new Set([...v25Row.matchAll(/`(ppart_[a-z_]+)`/g)].map((x) => x[1]));
    const PLANT = ['subst_plant', 'subst_wood'];
    const plantIds = dataRows.filter((c) => PLANT.includes(c[3])).map((c) => c[0]).sort();
    const ppIds = (ppRows || []).map((c) => c[0]).sort();
    const ppBadSubst = (ppRows || []).filter((c) => { const d = dataRows.find((x) => x[0] === c[0]); return !d || d[3] !== c[2] || !PLANT.includes(c[2]); }).map((c) => c[0]);
    const ppBadCode = (ppRows || []).filter((c) => c[3] !== '—' && !ppVocab.has(c[3])).map((c) => c[0] + '=' + c[3]);
    const ppBlank = (ppRows || []).filter((c) => c[3] === '—').map((c) => c[0]);
    say(ppRows !== null && ppVocab.size > 0 && plantIds.join(' ') === ppIds.join(' ') && ppBadSubst.length === 0 && ppBadCode.length === 0,
      '§4.5.5 例 6 部位表的行集合恰是草本植物质、木质的 ' + plantIds.length + ' 行（表内 ' + ppIds.length + ' 行；本源成分不符 ' + ppBadSubst.length + '，代号不在卷二十五 plant_part 族 ' + ppBadCode.length + (ppBadCode.length ? '：' + ppBadCode.join('、') : '') + '）');
    out.push('     部位留空、进加载警告清单的行 ' + ppBlank.length + '：' + ppBlank.join('、'));
    const frRows = blkRows('<!--FLAMRANGE-DATA-BEGIN-->', '<!--FLAMRANGE-DATA-END-->');
    say(frRows !== null && frRows.length > 0, '§4.5.5 例 7 易燃度出处区间表存在（' + (frRows ? frRows.length : 0) + ' 行；逐行 M-18 数值核对在 check-卷三-全集.mjs）');
    // 第六版新增（植物科闭集维度、干基碳水、成堆燃烧直接证据；李白 11-13 裁定）。只加不放宽，上面各条照查。
    // 植物科：§2.2 闭集登记制词表、§2.1 字段行、M-20、§4.5.5 例 9 短表（行集合恰是植物质行、代号在族里、逐行带出处、未知行列出进警告）
    const pfVocabRow = lines.find((l) => l.startsWith('| plant_family → `pfam_`')) || '';
    const pfVocab = new Set([...pfVocabRow.matchAll(/`(pfam_[a-z_]+)`/g)].map((x) => x[1]));
    const pfUnknown = (pfVocabRow.match(/未知 `(pfam_[a-z_]+)`/) || [])[1] || null;
    say(pfVocab.size > 0 && pfUnknown !== null && pfVocabRow.includes('闭集') && pfVocabRow.includes('登记制') && pfVocabRow.includes('只在材料行的 `plantFamily` 上填') && pfVocabRow.includes('须带科名的出处') && pfVocabRow.includes('规则只读代号'),
      '§2.2 plant_family 族是闭集、登记制，只在材料行 plantFamily 上填，有表示未知的一项（' + pfUnknown + '），新条目须带科名出处，规则只读代号（族内 ' + pfVocab.size + ' 项）');
    const pfField = fRow('plantFamily');
    say(pfField.includes('ref vocab plant_family') && pfField.includes('bySubstance:subst_plant,subst_wood') && pfField.includes('M-20') && /\| gap \|/.test(pfField) && pfField.includes('加载警告清单') && pfField.includes('M-9：不算谷物') && pfField.includes('§4.5.5 例 9'),
      '`plantFamily` 引本卷 plant_family 族；只对草本植物质、木质行登记（bySubstance）；留空按 gap 记缺口；未知与留空都进警告、按非谷物处理；逐行出处在例 9');
    const m20 = mRow('M-20');
    say(['`plant_family`', '`bySubstance`', '`gap`', '加载警告清单', '不适用', '写了即加载报错', '不得借记', '填未知一项'].every((k) => m20.includes(k)),
      'M-20 校验存在：科须在 plant_family 族、只对植物质行必填、缺了记缺口、未知一项进警告、别的行写了报错、不得借记');
    const pfRows = blkRows('<!--PLANTFAMILY-DATA-BEGIN-->', '<!--PLANTFAMILY-DATA-END-->');
    const pfIds = (pfRows || []).map((c) => c[0]).sort();
    const pfBadCode = (pfRows || []).filter((c) => c[3] !== '—' && !pfVocab.has(c[3])).map((c) => c[0] + '=' + c[3]);
    const pfNoSrc = (pfRows || []).filter((c) => !c[4] || c[4] === '—').map((c) => c[0]);
    const pfWarn = (pfRows || []).filter((c) => c[3] === '—' || c[3] === pfUnknown).map((c) => c[0]);
    say(pfRows !== null && pfRows.length > 0 && plantIds.join(' ') === pfIds.join(' ') && pfBadCode.length === 0 && pfNoSrc.length === 0,
      '§4.5.5 例 9 植物科表只登记植物质行：行集合恰是草本植物质、木质的 ' + plantIds.length + ' 行（表内 ' + pfIds.length + ' 行；代号不在 plant_family 族 ' + pfBadCode.length + (pfBadCode.length ? '：' + pfBadCode.join('、') : '') + '；没带出处 ' + pfNoSrc.length + (pfNoSrc.length ? '：' + pfNoSrc.join('、') : '') + '）');
    out.push('     植物科记未知或留空、按非谷物处理并进加载警告清单的行 ' + pfWarn.length + '：' + pfWarn.join('、'));
    // 干基碳水：§2.1 字段行、M-19、§4.5.5 例 8 短表（行集合同例 5、逐行注依据代号与出处、未核到的留空不填数、值在 [0,1] 且不小于纤维）
    const cbField = fRow('carbContent');
    say(cbField.includes('| number | fraction | [0,1] |') && cbField.includes('byDigestible') && cbField.includes('byClass:comp_edible') && cbField.includes('M-19') && /\| gap \|/.test(cbField) && cbField.includes('差减法') && cbField.includes('没核到出处的行不填数') && cbField.includes('加载警告清单'),
      '`carbContent` 是 [0,1] 的质量比例（差减法总碳水），必填范围同营养（byDigestible 或可食），没核到出处的不填数、按 gap 记缺口进警告');
    const m19 = mRow('M-19');
    say(['`gap`', '加载警告清单', '`carbContent` 不小于 `fiberContent`', '不拿印象里的数、同类的数顶替', 'M-9：不算谷物'].every((k) => m19.includes(k)),
      'M-19 校验存在：值在 [0,1]、不小于纤维含量、缺了记缺口进警告、不拿同类的数顶替、未知行不算谷物');
    const fbRows = blkRows('<!--FIBER-DATA-BEGIN-->', '<!--FIBER-DATA-END-->');
    const cbRows = blkRows('<!--CARB-DATA-BEGIN-->', '<!--CARB-DATA-END-->');
    const fbIds = (fbRows || []).map((c) => c[0]).sort();
    const cbIds = (cbRows || []).map((c) => c[0]).sort();
    const fbVal = Object.fromEntries((fbRows || []).map((c) => [c[0], c[2] === '—' ? null : Number(c[2])]));
    const cbBad = [];
    const cbUnknown = [];
    for (const c of cbRows || []) {
      const [id, , v, basis, note] = c;
      // 第七版：依据代号撤销"碳:推"（同类推定是借记，M-19 不拿同类的数顶替），不再是合法代号。
      if (!/^碳:(食|饲|定|未核)$/.test(basis)) cbBad.push(id + '（依据代号 ' + basis + '）');
      if ((v === '—') !== (basis === '碳:未核')) cbBad.push(id + '（留空与"碳:未核"不对应）');
      if (!note || note === '—') cbBad.push(id + '（没注出处）');
      if (v === '—') { cbUnknown.push(id); continue; }
      const x = Number(v);
      if (!(Number.isFinite(x) && x >= 0 && x <= 1)) cbBad.push(id + '（值 ' + v + ' 出 [0,1]）');
      else if (fbVal[id] !== null && fbVal[id] !== undefined && x < fbVal[id]) cbBad.push(id + '（碳水 ' + x + ' 小于纤维 ' + fbVal[id] + '）');
    }
    say(cbRows !== null && cbRows.length > 0 && fbRows !== null && fbIds.join(' ') === cbIds.join(' ') && cbBad.length === 0,
      '§4.5.5 例 8 碳水表：行集合同例 5 纤维表（' + fbIds.length + ' 对 ' + cbIds.length + ' 行），逐行注依据代号与出处，"碳:未核"的行留空不填数，值都在 [0,1] 且不小于同行纤维（不符 ' + cbBad.length + (cbBad.length ? '：' + cbBad.join('、') : '') + '）');
    out.push('     干基碳水未核到、按未知记缺口进加载警告清单的行 ' + cbUnknown.length + '：' + cbUnknown.join('、'));
    // 第七版新增（主会话 11-13）：例 8 的依据代号定义段不登记"碳:推"，数据行里"碳:推"计数为 0。只加不放宽。
    const cbDefLine = lines.find((l) => /^- 例 8/.test(l) && l.includes('`carbContent`')) || '';
    const cbTuiRows = (cbRows || []).filter((c) => c[3] === '碳:推').map((c) => c[0]);
    const cbTuiAny = lines.filter((l) => /^\| mat_/.test(l) && l.includes('碳:推')).length;
    say(cbDefLine !== '' && !cbDefLine.includes('碳:推') && cbTuiRows.length === 0 && cbTuiAny === 0,
      '§4.5.5 例 8 依据代号表没有"碳:推"，数据行里"碳:推"计数为 0（代号表' + (cbDefLine === '' ? '没读到' : (cbDefLine.includes('碳:推') ? '仍登记' : '已撤')) + '；碳水表命中 ' + cbTuiRows.length + (cbTuiRows.length ? '：' + cbTuiRows.join('、') : '') + '；全卷 mat_ 行命中 ' + cbTuiAny + '）');
    // 第七版新增（主会话 11-13）：扫描式——本卷 §2.1 中类型为 number、map、struct、分态的字段，卷三乙 rules.items.aggregation 聚合口径表全部覆盖，缺即 FAIL。
    // 只认聚合表"材料维度"一栏里反引号括起的键（承担组栏里的附带说明不算覆盖）。
    const aggNeed = f21.map((l) => l.split('|').map((c) => c.trim())).filter((c) => /^`[a-zA-Z]+`$/.test(c[1]) && (/^number\b/.test(c[2]) || /\bmap</.test(c[2]) || /\bstruct\b/.test(c[2]) || /byState/.test(c[2]))).map((c) => c[1].replace(/`/g, ''));
    const yiLines = readFileSync(CFG.乙.doc, 'utf8').replace(/\r\n/g, '\n').split('\n');
    const aggHead = yiLines.findIndex((l) => /^\| 材料维度 \| 口径 \|/.test(l));
    const aggKeys = new Set();
    if (aggHead >= 0) {
      for (let i = aggHead + 2; i < yiLines.length && yiLines[i].startsWith('|'); i += 1) {
        const col = yiLines[i].split('|')[1] || '';
        for (const m of col.matchAll(/`([a-zA-Z]+)(?:@[a-zA-Z_]+)?`/g)) aggKeys.add(m[1]);
      }
    }
    const aggMiss = aggNeed.filter((k) => !aggKeys.has(k));
    say(aggHead >= 0 && aggNeed.length > 0 && aggMiss.length === 0,
      '扫描式：§2.1 类型为 number、map、struct、分态的 ' + aggNeed.length + ' 个字段，卷三乙 rules.items.aggregation 聚合口径表全部覆盖（' + (aggHead < 0 ? '没读到聚合表' : '缺 ' + aggMiss.length + (aggMiss.length ? '：' + aggMiss.join('、') : '')) + '）');
    // 成堆燃烧直接证据：§2.2 burn_evidence 词表、§2.1 字段行、M-21、AP-7、§4.5.5 例 10 短表（代号已登记、只在可燃行、不在继承行、带出处）
    const bevVocabRow = lines.find((l) => l.startsWith('| burn_evidence → `bev_`')) || '';
    const bevVocab = new Set([...bevVocabRow.matchAll(/`(bev_[a-z_]+)`/g)].map((x) => x[1]));
    say(bevVocab.size > 0 && bevVocabRow.includes('crib_test') && bevVocabRow.includes('fuel_record') && bevVocabRow.includes('规则层不读') && bevVocabRow.includes('只有检索摘录、没有读到原文的不登记'),
      '§2.2 burn_evidence 族登记了成堆燃烧直接证据的出处代号（' + bevVocab.size + ' 项），分木垛实验与长期作燃料记载两类；出处文字规则层不读；只有摘录的不登记');
    const evField = fRow('pileBurnEvidence');
    say(evField.includes('ref vocab burn_evidence') && evField.includes('M-21') && evField.includes('同属、同类料的证据不算') && evField.includes('留空表示没有登记这样的证据，不表示烧不住') && evField.includes('卷三乙 T-15'),
      '`pileBurnEvidence` 引 burn_evidence 族；同类料的证据不算；留空不表示烧不住；用法在卷三乙 T-15');
    const m21 = mRow('M-21');
    say(['`burn_evidence`', '`comp_burnable`', '**同类证据不算**', '**不随继承带下来**', '不读条目的出处文字'].every((k) => m21.includes(k)),
      'M-21 校验存在：代号须已登记、只在可燃行、同类证据不算、不随继承带下来、不读出处文字');
    const ap7 = lines.find((l) => /^\| AP-7 \|/.test(l)) || '';
    say(ap7.includes('`burn_evidence`') && ap7.includes('`plant_family`') && ap7.includes('按材料 id 认"哪种料是柴""哪种料是粮"'), 'AP-7 禁止规则层读证据与科名的文字、禁止按材料 id 认柴认粮');
    const peRows = blkRows('<!--PILE-EVIDENCE-DATA-BEGIN-->', '<!--PILE-EVIDENCE-DATA-END-->');
    const peBad = [];
    for (const c of peRows || []) {
      const d = dataRows.find((x) => x[0] === c[0]);
      if (!d) { peBad.push(c[0] + '（大表没有）'); continue; }
      if (!bevVocab.has(c[2])) peBad.push(c[0] + '（代号 ' + c[2] + ' 未登记）');
      if (!(d[4] || '').split(/\s+/).includes('B')) peBad.push(c[0] + '（不可燃）');
      if (/展平继承/.test(d[d.length - 1] || '')) peBad.push(c[0] + '（继承行）');
      if (!c[3] || c[3] === '—') peBad.push(c[0] + '（没带出处）');
    }
    say(peRows !== null && peRows.length > 0 && peBad.length === 0,
      '§4.5.5 例 10 直接证据表 ' + (peRows ? peRows.length : 0) + ' 行：代号都在 burn_evidence 族、都挂可燃组件类、没有继承行、逐行带出处（不符 ' + peBad.length + (peBad.length ? '：' + peBad.join('、') : '') + '）');
  } else {
    say(apiRows >= cfg.apiMin, '§5 本卷入口登记 ' + apiRows + ' 行');
    say(all.includes('### 5.5 旧节号到新卷节号对照表'), '§5 末附旧节号到新卷节号对照表');
    const mapForm = lines.filter((l) => /material:\{/.test(l)).length;
    say(mapForm === 0, '数据实例里没有 map 形态的 material（命中 ' + mapForm + ' 处）');
    const listForm = lines.filter((l) => /material:\[\{group:/.test(l)).length;
    say(listForm >= 10, '数据实例使用多组列表形态的 material（' + listForm + ' 行）');
    const z7b = zoneOfTop(/^## §7 /); const z8b = zoneOfTop(/^## §8 /);
    const inZone = (i, z) => z && i >= z[0] && i < z[1];
    const inhBad = [];
    lines.forEach((l, i) => {
      if (!l.includes('inheritMaterialFrom')) return;
      if (inZone(i, z7b) || inZone(i, z8b)) return;
      if (/删除|出现 0 次/.test(l)) return;
      inhBad.push(i + 1);
    });
    say(inhBad.length === 0, 'inheritMaterialFrom 不再作为有效字段出现（命中 ' + inhBad.length + ' 处' + (inhBad.length ? '：' + inhBad.join(',') : '') + '）');
    const cfBad = [];
    lines.forEach((l, i) => {
      if (!l.includes('closedForm')) return;
      if (inZone(i, z8b)) return;
      if (/不再|不声明|删/.test(l)) return;
      cfBad.push(i + 1);
    });
    say(cfBad.length === 0, '不再声明跳时用的 closedForm（命中 ' + cfBad.length + ' 处' + (cfBad.length ? '：' + cfBad.join(',') : '') + '）');
    const noPer = [];
    lines.forEach((l, i) => {
      for (const m of l.matchAll(/\{(?:classes|matcats|items):\[[^{}]*?qty:[^{}]*?\}/g)) {
        if (!/per:"(piece|kg|pool)"/.test(m[0])) noPer.push(i + 1);
      }
    });
    say(noPer.length === 0, '数据实例里计量的需求块候选项都写了 per（缺 ' + noPer.length + ' 处' + (noPer.length ? '：' + noPer.join(',') : '') + '）');
    const z47 = subBlocks[7] ? lines.slice(subBlocks[7].start, subBlocks[7].end).join('\n') : '';
    say(!/由各自卷扩展/.test(z47) && z47.includes('选择器是封闭集合'), '§4.7 不再授权别卷自行扩展选择器');
    const z43 = subBlocks[3] ? lines.slice(subBlocks[3].start, subBlocks[3].end).join('\n') : '';
    const devField = lines.filter((l) => /^\| `[A-Za-z]*Deviation`/.test(l) || /Deviation"?\s*:\s*[{[]/.test(l)).length;
    say(z43.includes('C-8') && z43.includes('rules.items.classRules') && z43.includes('没有例外通道') && z43.includes('P-11') && devField === 0,
      '§4.3 类别一律派生、没有显式指定的通道（偏离字段 ' + devField + ' 处）');
    const z7txt = z7b ? lines.slice(z7b[0], z7b[1]).join('\n') : '';
    say(['works.mjs:30', 'basePrice', '旧用途标签对照表', 'ability_dig'].every((t) => z7txt.includes(t)), '§7 含 works.mjs、旧价去向、旧用途标签对照表');
    say(all.includes('不适用') && all.includes('rules.items.aggregation') && all.includes('partial'), '聚合区分"不适用"与"未知"');
    say(all.includes('推进方式无关') && all.includes('rotAnchorDay') && all.includes('wearAnchorDay'), '腐坏与劣化为锚点式并带推进方式无关的验收测试');
    // 拆卷裁定的可机判部分
    const z411 = subBlocks[11] ? lines.slice(subBlocks[11].start, subBlocks[11].end).join('\n') : '';
    const defState = lines.filter((l) => l.includes('**当时物态（全书唯一定义）**')).length;
    const defPoss = lines.filter((l) => l.includes('**可能物态集（全书唯一定义）**')).length;
    say(defState === 1 && defPoss === 1 && z411.includes('**当时物态（全书唯一定义）**') && z411.includes('**可能物态集（全书唯一定义）**'), '物态两种读法各只在 §4.11 定义一次（当时物态 ' + defState + ' 处，可能物态集 ' + defPoss + ' 处）');
    say(!all.includes('class_' + 'solid') && !all.includes('class_' + 'liquid') && !lines.some((l) => /^\| `rules\.materials\.classRules`/.test(l)), '没有固态类、液态类两个类别代号，规则表里没有材料类别规则表');
    const s25 = lines.findIndex((l) => l.startsWith('### 2.5 ')); const s26 = lines.findIndex((l) => l.startsWith('### 2.6 '));
    const rt = lines.slice(s25, s26).join('\n');
    say(!rt.includes('refTemp'), '规则表（§2.5）里没有任何参考温度键');
    const ambient = lines.map((l, i) => (/常温/.test(l) ? i + 1 : 0)).filter(Boolean);
    say(ambient.length === 0, '全卷不出现"常温"（命中 ' + ambient.length + ' 处' + (ambient.length ? '：' + ambient.join(',') : '') + '）');
    say(all.includes('matcat_volatile_fuel') && all.includes('rules.materials.volatileMin') && all.includes('rules.items.fuelFlammabilityMin') && all.includes('forgeMalleabilityMin') && !all.includes('forgeToughnessMin'),
      '挥发可燃物大类、燃料易燃度下限、锻料按延展性三处已写入');
    say(z411.includes('T-12') && z411.includes('越阈日') && z411.includes('卷二十 §4.6'), '被动物品跨变态点登记到期事件；水体冰份额只引卷二十 §4.6');
    const z8txt = z8b ? lines.slice(z8b[0], z8b[1]).join('\n') : '';
    say(z8txt.includes('水中病原不作材料行') && z8txt.includes('蜜按液态近似'), '§8 记了病原改为水的污染属性、蜜按液态近似');
    // 本卷不抄卷三甲的材料数值：例 5 的应得结果表没有数值列
    const eb = lines.findIndex((l) => l.startsWith('<!--EXPECT-BEGIN-->')); const ee = lines.findIndex((l) => l.startsWith('<!--EXPECT-END-->'));
    const numCells = lines.slice(eb, ee).filter((l) => /^\| mat_/.test(l) && /\| -?\d+(\.\d+)? \|/.test(l)).length;
    say(eb > 0 && numCells === 0, '应得结果表不含任何数值格（材料数值只在卷三甲；命中 ' + numCells + ' 行）');
    // 第二版新增（一审第 6 条）：§4 全部数据实例逐例扫描。一例（"- 例 n"连同它下面缩进的子项）里只要出现"材料字段名后面跟着数"，
    // 这一例就必须写明读卷三甲哪里，或写明是假设的演算值。
    const MATNUM = /(workDifficulty|sharpnessMax|wearResistance|corrosionRate|rotRate|reactionYield|noiseFactor|salvageFraction|heatValue|deflagEnergy|energyDensity|ignitePoint|flashPoint|meltPoint)`?\s*[:=]?\s*`?\d|(热值|含水|耐磨|加工难度|锋利上限|打捞比例|密度)[^，。；（）]{0,6}\d|density\s*≈/;
    const exBad = [];
    for (const n of Object.keys(subBlocks)) {
      const b5 = subBlocks[n].bounds[4]; if (!b5) continue;
      let cur = null;
      const flush = () => { if (cur && cur.text.some((t) => MATNUM.test(t)) && !cur.text.some((t) => /卷三甲|假设/.test(t))) exBad.push(cur.at); };
      for (let i = b5[0] + 1; i < b5[1]; i += 1) {
        if (/^- 例 \d+/.test(lines[i])) { flush(); cur = { at: i + 1, text: [lines[i]] }; } else if (cur && /^\s+\S/.test(lines[i])) cur.text.push(lines[i]); else if (cur && lines[i].startsWith('|')) cur.text.push('');
      }
      flush();
    }
    say(exBad.length === 0, '§4 各数据实例里出现的材料数值都写明读卷三甲或标明是假设的演算值（未写明 ' + exBad.length + ' 例' + (exBad.length ? '：行 ' + exBad.join(',') : '') + '）');
    // 第二版新增（一审第 3、4、5、7、9 条与李白裁定的可机判部分）
    const row = (id) => lines.find((l) => l.startsWith('| ' + id + ' |')) || '';
    say(row('M-12').includes('`mounted`') && row('M-12').includes('卷二 §3.3') && !all.includes('materialModifiers'), 'M-12 走卷二的唯一修正管线（`mounted` 作用域），全卷没有 materialModifiers 的写法');
    say(['T-9', '卷十三', '卷十九', '卷二十一', '卷四 T-4', '`where`', '`acceptsMaterial`', 'M-9', 'T-2', 'T-13'].every((k) => row('M-12').includes(k)), 'M-12 一处列全读者类别（选料与身份读修正前的值；过程、折算与炉温读有效值）');
    const matBase = lines.map((l, i) => (/手填基值|只读卷三甲的基值|候选物的基值|基础热值/.test(l) ? i + 1 : 0)).filter(Boolean);
    say(matBase.length === 0, '材料的数不再称"基值"（命中 ' + matBase.length + ' 处' + (matBase.length ? '：' + matBase.join(',') : '') + '）');
    say(/求出物态代号/.test(row('P-13')) && !/自己拿温度同熔点、沸点比较/.test(all), 'P-13 第三款只禁"由温度求出物态代号"');
    say(lines.filter((l) => l.includes('**静态读法（全书唯一定义）**')).length === 1 && all.includes('rules.items.staticStateOrder') && !lines.some((l) => /^\| `matterState` \|/.test(l) && lines.indexOf(l) < lines.findIndex((x) => x.startsWith('### 2.3 '))), '静态读法只在 T-14 定义一次；当时物态不在模板字段表里');
    say(lines.some((l) => /^\| `density` \| `hmean` \|/.test(l)) && !lines.some((l) => /^\| `density`、/.test(l)), '密度按调和平均聚合，不在 sum 一行');
    say(/`heatDamagePoint` 与 `coldDamagePoint`/.test(row('T-12')) && /入账或建实例/.test(row('T-12')) && row('T-3').includes('leakAnchorDay') && !all.includes('整批流失'), 'T-12 覆盖冻损、热损等温度点并在入账时登记；流失为锚点式，没有"整批流失"');
    say(/自燃/.test(row('T-5')) && row('T-5').includes('`flashPoint`') && row('T-5').includes('`ignitePoint`'), 'T-5 分自燃（读自燃点）与引燃（过闪点）两条路');
    say(all.includes('saltPerKg = ') && all.includes('rules.items.saltNutrient') && row('`class_salt`').includes('saltPerKg'), '盐类条件读单点定义的折算量 saltPerKg');
    say(row('M-10').includes('`none`') && lines.some((l) => /^\| `salvageFraction`、.*\| `none` \|/.test(l)), 'M-10 写明范围，逐份使用的维度给 none 口径');
    say(/① 化开之前/.test(row('E-9 同物异态（李白 11-13 拆卷裁定）')) && /② 越阈那天/.test(row('E-9 同物异态（李白 11-13 拆卷裁定）')), 'E-9 拆成化开之前与越阈那天两条');
    say(all.includes('rules.climate.envTempDomain') && /不拿可能物态集当跳过登记的理由/.test(row('T-12')), '环境温度域引卷二十的规则表键；T-12 不以可能物态集跳过登记');
    // 第五版新增（谷物部位条件、成堆规则只启用 reliefMax、方向迁移假设警告、碰线通则；李白 11-13 裁定）。只加不放宽，上面各条照查。
    const grainRow = lines.find((l) => /^\| 谷物 \| `substance` 是草本植物质/.test(l)) || '';
    const grainCond = grainRow.split('|')[2] || '';
    say(grainCond.includes('`plantPart` 等于 `rules.materials.grainPart`') && ['`substance`', '`comp_edible`', 'rules.materials.grainMoistureMax', 'rules.materials.grainEnergyMin'].every((k) => grainCond.includes(k)) && !/fiberContent|纤维/.test(grainCond) && grainRow.includes('`fiberContent` 不是本条的条件'),
      '谷物条件含"部位为种子"（plantPart 等于 rules.materials.grainPart），原四条照在，条件栏不含纤维含量');
    say(lines.some((l) => /^\| `rules\.materials\.grainPart` \| ppart_seed \|/.test(l)) && lines.some((l) => l.startsWith('| `rules.materials.grainMoistureMax` / `grainEnergyMin` / `grainPart` |')) && lines.some((l) => l.startsWith('| 只引代号 |') && l.includes('`plant_part`') && l.includes('卷二十五 §2.4')),
      '谷物的部位代号经规则表键 grainPart 读卷二十五 plant_part 族的种子一项，本卷不写死、不另立词表');
    const t15 = row('T-15');
    say(['`rules.thermal.pile.reliefMax`', '成堆时 G 取 1，不成堆取 0', '`gapCurve`', '`countCurve`', '`pileVoid`', '`grainMm`', '待标定、不生效', '不得把成堆的效应拆成'].every((k) => t15.includes(k)) && !t15.includes('件数系数取 1'),
      'T-15 只启用 reliefMax（成堆 G 取 1、不成堆取 0）；间距、层数、堆密各曲线待标定、不生效，不拆成两个系数相乘');
    say(t15.includes('**方向迁移假设（待标定，加载出警告）**') && t15.includes('加载警告清单') && t15.includes('火向下烧'),
      'T-15 写明 reliefMax 套到火向下单件值上是方向迁移假设、待标定，加载出警告');
    say(t15.includes('**碰线通则') && t15.includes('`flammabilityRange` 的 `min`、`max`') && t15.includes('低端高于门槛，过线；高端低于门槛，不过线') && row('`class_fuel`').includes('碰线通则'),
      'T-15 读卷三甲 flammabilityRange 算出处区间，碰线通则写明；C-8 燃料类按碰线通则比');
    const pileKeyRow = lines.find((l) => l.startsWith('| `rules.thermal.pile.reliefMax` / `gapCurve` / `countCurve` |')) || '';
    say(pileKeyRow.includes('只有 `reliefMax` 生效') && pileKeyRow.includes('"假设、待标定"') && pileKeyRow.includes('`gapCurve`、`countCurve` 标"待标定、不生效"') && pileKeyRow.includes('`rules.thermal.pile.minCount`') && lines.some((l) => /^\| `rules\.thermal\.pile\.minCount` \| \d+ \|/.test(l)),
      '§2.5 成堆各键：只有 reliefMax 生效且带"假设、待标定"标记；两条曲线待标定不生效；minCount 有核对值');
    const bfRow = lines.find((l) => l.startsWith('| bulkform → ')) || '';
    say(bfRow.includes('**第五版：这两个字段标"待标定、不生效"**') && bfRow.includes('T-15 只读 `bearsLoad`'), '聚集形态的 pileVoid、grainMm 待标定、不生效，T-15 只读 bearsLoad');
    // 第六版新增（谷物七条件、读谷物类别的规则改读维度、成堆燃烧直接证据优先于推算；李白 11-13 裁定）。只加不放宽，上面各条照查。
    say(grainCond.includes('`carbContent ≥ rules.materials.grainCarbMin`') && grainCond.includes('`plantFamily` 等于 `rules.materials.grainFamily`') && grainRow.includes('`carbContent` 未知') && grainRow.includes('`plantFamily` 留空或是词表里表示未知的那一项') && grainRow.includes('不进候选'),
      '谷物条件七条：第五版五条之外加干基碳水不低于 grainCarbMin、植物科等于 grainFamily；碳水未知、科留空或未知的行不进候选');
    const jiaLines = readFileSync(CFG.甲.doc, 'utf8').replace(/\r\n/g, '\n').split('\n');
    const pfVocabJ = new Set([...(jiaLines.find((l) => l.startsWith('| plant_family → `pfam_`')) || '').matchAll(/`(pfam_[a-z_]+)`/g)].map((x) => x[1]));
    const famKey = (lines.find((l) => /^\| `rules\.materials\.grainFamily` \| pfam_[a-z_]+ \|/.test(l)) || '').match(/\| (pfam_[a-z_]+) \|/);
    const grainKeyRow = lines.find((l) => l.startsWith('| `rules.materials.grainMoistureMax` / `grainEnergyMin` / `grainPart` |')) || '';
    say(lines.some((l) => /^\| `rules\.materials\.grainCarbMin` \| 0?\.\d+ \|/.test(l)) && famKey !== null && pfVocabJ.has(famKey[1]) && grainKeyRow.includes('`rules.materials.grainCarbMin`') && grainKeyRow.includes('`rules.materials.grainFamily`') && grainKeyRow.includes('规则里不写死科的代号'),
      '谷物的碳水下限与科经规则表键 grainCarbMin、grainFamily 给出，有核对值；grainFamily 指向卷三甲 plant_family 族里登记过的代号（' + (famKey ? famKey[1] : '没读到') + '），规则里不写死科');
    // 读谷物类别的规则改读实际维度：本卷与卷二十五的选择器、accepts、where 里不再出现谷物大类或谷物类别
    const v25Lines = readFileSync(V25, 'utf8').replace(/\r\n/g, '\n').split('\n');
    const GRAIN_SEL = /(?:classes|matcats|accepts)\+?\s*:\s*\[[^\]]*(?:class_grain|matcat_grain)|(?:where|when|filter)\s*:\s*"[^"]*(?:class_grain|matcat_grain)/;
    const selHits = lines.map((l, i) => (GRAIN_SEL.test(l) ? '乙 ' + (i + 1) : '')).filter(Boolean).concat(v25Lines.map((l, i) => (GRAIN_SEL.test(l) ? '卷二十五 ' + (i + 1) : '')).filter(Boolean));
    const jar = lines.find((l) => l.startsWith('- 例 1【西陲】`item_glazed_jar`')) || '';
    const stapleLine = v25Lines.find((l) => l.includes('"主食类"读什么在这里写明')) || '';
    const mashLine = v25Lines.find((l) => l.includes('"含淀粉类"读什么在这里写明')) || '';
    say(selHits.length === 0 && jar.includes('`accepts` 里原先列的谷物大类撤掉') && !/accepts:\[[^\]]*grain/.test(jar) && row('Q-37').includes('读谷物类别的规则一律改读实际维度')
      && stapleLine.includes('不再读谷物类别') && stapleLine.includes('`carbContent ≥') && mashLine.includes('不再读谷物类别') && mashLine.includes('`carbContent ≥'),
      'class_grain 的读者改读维度：陶瓮 accepts 撤掉谷物大类；卷二十五主食、含淀粉两组改读可食、干基碳水等维度；本卷与卷二十五的选择器里没有谷物大类或类别（命中 ' + selHits.length + (selHits.length ? '：' + selHits.join('、') : '') + '）');
    const glossGrain = lines.find((l) => l.startsWith('| 谷物的碳水与科条件 |')) || '';
    say(glossGrain.includes('`rules.materials.grainCarbMin`') && glossGrain.includes('`rules.materials.grainFamily`') && glossGrain.includes('`plant_family`'), '术语表登记谷物的碳水与科条件');
    // 燃料：直接证据代号登记（术语表、§2.5、§4.11.1）与"直接证据优先于推算"（T-15 第 ⑤ 款、C-8 燃料类、V3-4.11-I、§4.1.5）
    say(t15.includes('⑤ **直接证据优先（第六版') && t15.includes('`pileBurnEvidence`') && t15.includes('每一份可燃材料') && t15.includes('优先于第 ② 至 ④ 款的推算') && t15.includes('不依赖 `reliefMax`')
      && t15.includes('有任何一份可燃材料没有登记，或这一堆不成堆 → 直接证据不适用') && t15.includes('不改 `pileFlammability` 的数值') && t15.includes('也不让单件变成燃料') && t15.includes('不读出处的任何文字'),
      'T-15 第 ⑤ 款：成堆且各份可燃材料都登记了直接证据的判烧得住，直接证据优先于推算、不依赖 reliefMax；缺一份或不成堆退回推算；不改 pileFlammability 数值、不让单件成燃料、不读出处文字');
    say(row('`class_fuel`').includes('T-15 第 ⑤ 款') && row('`class_fuel`').includes('直接证据优先') && row('`class_fuel`').includes('判不出的照上面的比法'), 'C-8 燃料类：第 ⑤ 款判出成堆烧得住的直接成立，判不出的照碰线通则比');
    say(pileKeyRow.includes('有成堆燃烧直接证据的料不走这个键（T-15 第 ⑤ 款）'), '§2.5 reliefMax 一行写明有直接证据的料不走这个键');
    const glossEv = lines.find((l) => l.startsWith('| 成堆燃烧直接证据 |')) || '';
    say(glossEv.includes('`pileBurnEvidence`') && glossEv.includes('`burn_evidence`') && glossEv.includes('T-15 第 ⑤ 款') && glossEv.includes('同类料的证据不算') && glossEv.includes('程序只看有没有登记过的代号'),
      '术语表登记成堆燃烧直接证据代号（卷三甲 pileBurnEvidence、burn_evidence 族），程序只看有没有登记过的代号');
    say(z411.includes('T-15 第 ⑤ 款另读卷三甲的 `pileBurnEvidence`'), '§4.11.1 维度写明 T-15 第 ⑤ 款读卷三甲 pileBurnEvidence');
    const v411 = lines.find((l) => l.startsWith('- **不变量式** V3-4.11-I')) || '';
    say(v411.includes('依据来源（直接证据、推算、未知）') && v411.includes('把 `reliefMax` 改成 0 再算，参考堆的燃料结论不变') && v411.includes('结论恒等于第 ② 至 ④ 款推算的结论') && v411.includes('任何行的单件结论不因登记了直接证据而改变'),
      'V3-4.11-I 第六版断言：逐行依据来源三者之一；直接证据行 reliefMax 归 0 结论不变；未登记行等于推算；单件结论不受证据影响');
    say(all.includes('成堆判定的依据来源分三种') && all.includes('**直接证据**') && all.includes('**推算**') && all.includes('**未知**（推算碰线的行'), '§4.1.5 写明成堆判定的依据来源分三种（直接证据、推算、未知）');
  }

  out.push('----');
  out.push('正文行数（不含附录输出）：' + lines.length);
  out.push('子系统数：' + Object.keys(subBlocks).length + '；开放问题：' + qRows + '；扩展性测试：' + extRows + '；迁移行：' + migRows);
  out.push('结果：' + (fail === 0 ? '全部通过' : '未通过 ' + fail + ' 项'));
  return { out, fail, lineCount: lines.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = process.argv[2];
  const todo = arg ? [arg] : ['甲', '乙'];
  let bad = 0;
  for (const w of todo) {
    if (!CFG[w]) { console.error('参数只能是 甲 或 乙'); process.exit(2); }
    const r = runCheck(w);
    if (todo.length > 1) console.log('== 卷三' + w + ' ==');
    console.log(r.out.join('\n'));
    bad += r.fail;
    if (w === '甲') { // 串联：§2.6 物性格读取登记表派生必填（李白 11-14 21:53）
      const rr = runReaderCheck(CFG.甲.doc);
      console.log('-- 卷三甲 §2.6 读取者派生必填 --\n' + rr.out.join('\n'));
      bad += rr.fail;
    }
  }
  process.exitCode = bad === 0 ? 0 : 1;
}
