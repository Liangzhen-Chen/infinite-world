// 乙-1/乙-4 补卡 1115y8b：chk-1115-y6 的 ③④ 两项小项（李白 11-15 17:28 第 2 条）。只改卷十四 M14-82 子行、卷二 M2-10a/10b/12b 理由栏与待补清单。
// ③ M14-82 旧键里没写去向的字段补去向：名单与数据行写"转世界内容数据，不进规则表"；参数类写"退役，由卷十四某规则覆盖"并点名，点不出写待补并补进 乙7-卷十四待补清单；experience 的覆盖规则补 GR-1（与 GR-2 并列）。
// ④ 卷二 M2-10a、M2-10b、M2-12b 的理由栏由"列待裁"改写成已裁结论（李白 17:0x 第一条）。
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const OUT = `${HERE}/../../审查/脚本输出`.replace(/\\/g, '/');
const DIR = 'F:/dnd/docs/统一底层设计';
const edit = (file, fn) => { const p = `${DIR}/${file}`; const L = readFileSync(p, 'utf8').split('\n'); fn(L); writeFileSync(p, L.join('\n')); };
const rowIdx = (L, id) => L.findIndex(l => l.startsWith(`| ${id} |`));
const log = [];

// ---- ③ ----
const REP = [
  ['M14-82b', 'experience → 退役，由卷十四 §4.12 GR-2（levelThresholds 冻结成表）覆盖；initial → 待补', 'experience → 退役，由卷十四 §4.12 GR-1、GR-2（经验只来自技能增长、levelThresholds 冻结成表）覆盖；noviceUntil → 待补；initial → 待补'],
  ['M14-82c', 'examinations → 转世界内容数据，不进规则表；minimumAge', 'version → 退役，由卷二十七 R27-7.1（删版本标记）覆盖；examinations → 转世界内容数据，不进规则表；minimumAge'],
  ['M14-82f', 'vocations → 转世界内容数据，不进规则表；maximumGain', 'vocations、institutionTeachersStay → 转世界内容数据，不进规则表；uncertifiedMaximumProficiency、qualificationRule → 待补；maximumGain'],
];
edit('卷十四-职业技能与学艺.md', L => { for (const [id, a, b] of REP) { const i = rowIdx(L, id); if (i < 0 || !L[i].includes(a)) throw new Error(id + ' 找不到'); L[i] = L[i].replace(a, b); log.push(`${id}：补旧字段去向`); } });
// 待补清单补三行并改行数
{ const p = `${OUT}/乙7-卷十四待补清单.md`; let s = readFileSync(p, 'utf8');
  s = s.replace('| M14-82b | initial | levels |', '| M14-82b | noviceUntil | levels |\n| M14-82b | initial | levels |')
    .replace('| M14-82f | maximumGain、maximumProficiency、minimumPractice、switchCooldownDays、teach、work | npcGrowth |', '| M14-82f | uncertifiedMaximumProficiency | npcGrowth |\n| M14-82f | qualificationRule | npcGrowth |\n| M14-82f | maximumGain、maximumProficiency、minimumPractice、switchCooldownDays、teach、work | npcGrowth |')
    .replace('共 7 行。', '共 10 行（1115y8b 补 noviceUntil、uncertifiedMaximumProficiency、qualificationRule 三行）。');
  writeFileSync(p, s); log.push('乙7-卷十四待补清单：补三行，共 10 行'); }
{ const p = `${OUT}/乙5-rules待裁清单.md`; let s = readFileSync(p, 'utf8');
  s = s.replace('| M14-82b | experience |', '| M14-82b | noviceUntil | 待补 |\n| M14-82b | experience |')
    .replace('| M14-82c | examinations |', '| M14-82c | version | 退役，由卷二十七 R27-7.1（删版本标记）覆盖 |\n| M14-82c | examinations |')
    .replace('| M14-82f | vocations |', '| M14-82f | institutionTeachersStay | 转世界内容数据，不进规则表 |\n| M14-82f | uncertifiedMaximumProficiency、qualificationRule | 待补 |\n| M14-82f | vocations |');
  writeFileSync(p, s); log.push('乙5-rules待裁清单：M14-82 去向表补行'); }

// ---- ④ ----
const WHY = {
  'M2-10a': '汇总行，不单独计数；已裁（李白 11-15 17:0x 第一条）：拆 a1 至 a3 三个子行',
  'M2-10a1': '据点储量与再生规划归卷五，取 sys.place（李白 11-15 17:0x 第一条）',
  'M2-10a2': '拜师需求归卷十四，取 sys.profession（李白 11-15 17:0x 第一条）',
  'M2-10a3': '价格底线归卷六，旧价已由卷六 M6-29、M6-30 删除，取被删内容所属的 sys.economy（李白 11-15 17:0x 第一条）',
  'M2-10b': '居留与公民资格归卷八，取 sys.org；不新登 rules.civic，卷八封卷时确需独立规则表键，走卷八封卷后勘误单独提（李白 11-15 17:0x 第一条）',
  'M2-12b': '繁简转换是离线处理内容文本的脚本，算内容构建脚本，取离线模块组键 content-scripts（卷二 §2.7；李白 11-15 17:0x 第一条）',
};
edit('卷二-维度表规范与统一入口.md', L => {
  for (const [id, why] of Object.entries(WHY)) { const i = rowIdx(L, id); if (i < 0) throw new Error(id + ' 找不到'); const cs = L[i].split(/(?<!\\)\|/); cs[cs.length - 2] = ' ' + why + ' '; L[i] = cs.join('|'); log.push(`${id}：理由栏改已裁结论`); }
  const j = L.findIndex(l => l.includes('对象写不出的（M2-10a、M2-10b、M2-12b）写"待裁"，列给李白。'));
  if (j >= 0) L[j] = L[j].replace('对象写不出的（M2-10a、M2-10b、M2-12b）写"待裁"，列给李白。', 'M2-10a、M2-10b、M2-12b 原写"待裁"，李白 11-15 17:0x 已裁：M2-10a 拆 a1 至 a3，M2-10b 取 sys.org，M2-12b 取 content-scripts。');
});
writeFileSync(`${OUT}/乙8b-改写记录.md`, ['# 乙-1/乙-4 补 1115y8b 改写记录（脚本生成，勿手改）', '', '依据：李白 11-15 17:28 第 2 条、chk-1115-y6；脚本 脚本/卷十一/apply-1115y8b.mjs。', '', ...log.map(x => '- ' + x), ''].join('\n'));
console.log(log.join('\n'));
