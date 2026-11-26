// 试玩地区人物载入卡（李白 11-24「家户两问1122」H-4）：旧人物作者数据（world/people/baseline.json、residents.json）里试玩地区的人，
// 转成开局人物名册 world/people/opening-roster-hw.json（只含代号与数值：id、物种、性别、年龄、出生地、所属家户组织行 id 或 null），
// 由 server-plugin/opening-people.mjs 在世界创建事务里经 instantiatePerson 建人行、写家户成员边与户主边。
// 用法：node tools/convert-people-hw.mjs          按旧数据重转并改写名册（重跑结果恒同）
//       node tools/convert-people-hw.mjs --check  只比对，有差异退出码 1，不写盘
// 来源与规矩：卷四 §4.10 P-4 :984（手写的具名个体也走 instantiatePerson，物种、出生时刻、出生地必给，其余取值采样）；卷四 §2.3（sex 是物种 sexes 的键）；
// 旧数据里的 sex 是"男""女"两个固定标记，下面的映射表键是旧标记，不是人物 id；性别映射到性别词表代号只在本工具里做一次，规则层不读旧标记。
// 旧数据没有的值一律不写、不编：culture 旧数据有但文化表（卷七）未前移，不转；baseline 的 birth 年月日要世界历法与文化历法才能折成分钟（卷二十 §4.2.3、历法年从 1 起），
// 不转，年龄统一取旧数据的整数 age；物种旧数据没有 species 键的就是人（只有怪物行写 species），写了 species 键的行本工具转不了，直接报错。
// 出生地旧数据没有，按卷四 :997 迁移示例（西陲个体 birthplace 写 loc_hw）取所属地域 scope，是迁移取值、不是作者给的出生事实，登问题.md。
// 家户从户籍索引 world/people/households.json 取（家户组织行 id = "org_" + 索引 id，开局持有卡 H-1 的物化规则）；人物只属于一户，索引里没有的明确写 household: null。
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { repoRoot, safeSegment } from './path-segment.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const OUT_DIR = 'world/people';
const OUT_FILE = 'opening-roster-hw.json';
const OUT = `${OUT_DIR}/${OUT_FILE}`;
// 试玩地区（河湾村）：开局持有卡的 22 户家户行就是户籍索引里 settlement 为它的那些户。
export const TRIAL_SCOPE = 'loc_hw';
// 旧性别标记 → 性别词表代号（物种 sexes 的键，卷四 §2.3）。
export const SEX_OF = Object.freeze({ 男: 'sex_male', 女: 'sex_female' });
// 旧数据没写 species 的人物按人转（人类物种行 species_human，李白 11-22 P-1）。
export const SPECIES_UNMARKED = 'species_human';
const HOUSEHOLD_ORG_PREFIX = 'org_';

const json = (p) => JSON.parse(readFileSync(join(REPO, p), 'utf8'));
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** 从旧作者数据求名册。@returns {{persons: Array<{id: string, species: string, sex: string, ageYears: number, birthplace: string, household: string | null}>}} */
export function buildRoster() {
  const households = json('world/people/households.json').filter((h) => h.settlement === TRIAL_SCOPE);
  const householdOf = new Map();
  for (const h of households) for (const m of h.members) {
    if (householdOf.has(m)) throw new Error(`${m} is a member of two households`);
    householdOf.set(m, `${HOUSEHOLD_ORG_PREFIX}${h.id}`);
  }
  const old = [...json('world/people/baseline.json'), ...json('world/people/residents.json')];
  const seen = new Set();
  const persons = [];
  for (const r of old) {
    if (r.scope !== TRIAL_SCOPE) continue;
    if (seen.has(r.id)) throw new Error(`${r.id} is in the old data twice`);
    seen.add(r.id);
    if (r.species !== undefined) throw new Error(`${r.id}: the old row has a species key (${r.species}), this tool only converts people`);
    if (!Object.hasOwn(SEX_OF, r.sex)) throw new Error(`${r.id}: sex ${JSON.stringify(r.sex)} has no mapping`);
    if (!Number.isInteger(r.age) || r.age < 0) throw new Error(`${r.id}: age ${JSON.stringify(r.age)} is not a non-negative integer`);
    persons.push({ id: r.id, species: SPECIES_UNMARKED, sex: SEX_OF[r.sex], ageYears: r.age, birthplace: r.scope, household: householdOf.get(r.id) ?? null });
  }
  for (const m of householdOf.keys()) if (!seen.has(m)) throw new Error(`household member ${m} has no row in the old people data of ${TRIAL_SCOPE}`);
  persons.sort((a, b) => cmp(a.id, b.id));
  return { persons };
}

function main() {
  const next = `${JSON.stringify(buildRoster(), null, 1)}\n`;
  const check = process.argv.includes('--check');
  let now = '';
  try { now = readFileSync(join(REPO, OUT), 'utf8').replace(/\r\n/g, '\n'); } catch { now = ''; }
  const same = now === next;
  if (!same && !check) writeFileSync(join(repoRoot(), OUT_DIR, safeSegment(OUT_FILE)), next);
  process.stdout.write(same ? 'opening roster unchanged\n' : check ? 'opening roster differs\n' : 'opening roster written\n');
  if (check) process.exit(same ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
