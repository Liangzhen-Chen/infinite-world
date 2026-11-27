// 位置写者（卷十七 §3.3 :288、:295–:305 placeSubject；卷九 :639 move 原语的写者；卷五 §4.1 规则 14 人只存 pos 与 facing；S2-P 草案 §3 第 6–10 行）。
// 人物 pos、facing 的唯一写入口（系统代号 position）：只经 kernel/storage.mjs#setEntityProp 写，所在地点由 zoneAt(pos) 派生，不另存。
// 本阶段现场泡未建（主会话 Q4 甲）：一律写泡外精度 coarse 为真；{settle} 与细格落位走未建数据门。几何只调 rules/place/zone.mjs，本文件不算格。
// 常数读 rules.grid、rules.travel；不认任何地点、个体或形制 id。换位置写入只改本文件。

import { KernelError } from '../../kernel/errors.mjs';
import { readPath, setEntityProp, kindOfEntity } from '../../kernel/storage.mjs';
import { clockMinute } from '../../kernel/scheduler.mjs';
import { dim } from '../../kernel/dimensions.mjs';
import { ruleValue } from '../load/registry.mjs';
import { registerPrimitiveWriter } from '../load/primitive-writers.mjs';
import { seedKeyHex } from '../gen/sample.mjs';
import { zoneAt, landCell, bearingView } from '../place/zone.mjs';

// 人物的两个位置维度（卷五 §4.1 规则 14；person.json pos、facing）；建筑行的朝向维度同名（卷五 §2.1 :100）。
const DIM = Object.freeze({ pos: 'pos', facing: 'facing' });
// 规则表代号与键（world/rules/tables/grid.json facingDirections；travel.json initialFacing）。
const GRID = 'grid';
const FACING_DIRECTIONS = 'facingDirections';
const TRAVEL = 'travel';
const INITIAL_FACING = 'initialFacing';
// placeSubject 的三种目标（卷十七 :297–:300）与 move 原语参数名（world/ontology/primitives.json move）。
const TARGET = Object.freeze({ pos: 'pos', place: 'place', settle: 'settle', seedKey: 'seedKey' });
const PARAM = Object.freeze({ subject: 'subject', to: 'to', facing: 'facing' });
const UNKNOWN_READ = 'E-DIM-UNKNOWN-READ';
const UNBUILT_SETTLE = '卷二十七现场泡卡（就地核立足、坠落与挤出只在泡内做，卷十七 :300、卷五 §4.5 规则 6）';

/** @typedef {import('../place/zone.mjs').Pos} Pos */
/** 本模块读的 engine 字段：zone.mjs 要的烘焙层与摘要能力、路径句柄 P、包含树的父节点表。 @typedef {import('../place/zone.mjs').ZoneEngine & {P: Readonly<Record<string, Function>>, bake: {placeTree: {parentOf: ReadonlyMap<string, string | null>}}} & Parameters<typeof kindOfEntity>[0]} PositionEngine */

/** 维度值，读不到即 undefined（初次落位没有旧位置）。 @param {PositionEngine} engine @param {object} state @param {string} kind @param {string} id @param {string} key @returns {unknown} */
function tryDim(engine, state, kind, id, key) {
  try { return dim(engine, state, kind, id, key).value; } catch (e) {
    if (e instanceof KernelError && e.code === UNKNOWN_READ) return undefined;
    throw e;
  }
}

/** 朝向须是 [0, facingDirections) 的整数，否则 E-EFF-PARAM。 @param {PositionEngine} engine @param {unknown} f @param {string} what @returns {number} */
function checkedFacing(engine, f, what) {
  const n = Number(ruleValue(engine.docData, GRID, FACING_DIRECTIONS));
  if (!Number.isSafeInteger(f) || Number(f) < 0 || Number(f) >= n) throw new KernelError('E-EFF-PARAM', {}, `${what}: facing ${JSON.stringify(f)} must be an integer in [0, ${n})`);
  return Number(f);
}

/**
 * 目标格（卷十七 :297–:300）：给位置即它（泡外原样写、coarse 置真，:302）；给地点即 landCell 落代表格，种子键五段（世界种子、travel、个体 id、事务时刻、抽取点），
 * 调用方随地点给了 seedKey 的照用；{settle} 只在现场泡内做，未建。
 * @returns {Pos}
 */
function targetCell(engine, state, subjectId, kind, target) {
  const t = Object(target);
  if (Object.hasOwn(t, TARGET.pos)) {
    const p = Object(t[TARGET.pos]);
    return { w: p.w, x: p.x, y: p.y, z: p.z, coarse: true };
  }
  if (Object.hasOwn(t, TARGET.place)) {
    const seedKey = Object.hasOwn(t, TARGET.seedKey) ? t[TARGET.seedKey]
      : seedKeyHex('travel', 'pos_land', engine, Number(readPath(state, engine.P.genesis_worldSeed())), subjectId, clockMinute(engine, state));
    return landCell(engine, state, { place: String(t[TARGET.place]), kind, seedKey, coarse: true });
  }
  if (Object.hasOwn(t, TARGET.settle)) throw new KernelError('E-ACT-WRITER-NOT-READY', {}, `placeSubject ${subjectId} settle: not built yet, wait for ${UNBUILT_SETTLE}`);
  throw new KernelError('E-EFF-PARAM', {}, `placeSubject ${subjectId}: target must give one of ${TARGET.pos}, ${TARGET.place}, ${TARGET.settle}`);
}

/**
 * 写入后的朝向（卷十七 :304）：facing 非空即它；为空时，有旧位置且新旧平面不重合即「面朝走来的方向」：
 * floor((方位角 + 半档) ÷ 档宽) mod facingDirections，档宽 = 整圈 ÷ facingDirections（整数比算，不写 22.5、45）；平面重合即不变（返回 undefined 不写）。
 * 初次落位（没有旧位置，主会话 Q7 甲）：取新位置所在地点行的 facing 维度，没有即 rules.travel.initialFacing。
 * @returns {number | undefined}
 */
function nextFacing(engine, state, facing, oldPos, newPos) {
  if (facing !== null && facing !== undefined) return checkedFacing(engine, facing, 'placeSubject');
  const n = BigInt(Number(ruleValue(engine.docData, GRID, FACING_DIRECTIONS)));
  if (oldPos !== undefined) {
    const { turn } = bearingView(engine, state, oldPos, newPos, null);
    if (turn === null) return undefined;
    // floor((θ + 半档) ÷ 档宽) 即就近折档：θ ÷ 档宽 = θ·n ÷ 整圈，经公共取整 Math.round（rules.detNumeric.mathAllow，卷二十七 :167）；θ ∈ [0, 整圈)，不为负。
    return Math.round(Number(turn.num * n) / Number(turn.den)) % Number(n);
  }
  const here = zoneAt(engine, state, newPos);
  const own = here === null ? undefined : tryDim(engine, state, engine.bake.placeTree.kind, here, DIM.facing);
  return checkedFacing(engine, own !== undefined ? own : ruleValue(engine.docData, TRAVEL, INITIAL_FACING), 'initial facing');
}

/**
 * kernelApi placeSubject（卷十七 §3.3 :288 位置写入单点定义）：先定目标格，再定精度（本阶段一律泡外 coarse，Q4 甲），最后在同一事务里写 pos 与 facing（:305）。
 * 个体不存在即 E-DIM-REF-MISSING（kindOfEntity）；已终止即 E-TERM-RESIDUE（writePath 拒写）；地点不是建筑走未建数据门（landCell）。都整笔回滚。
 * cause 是安置原因代号（卷十七 :288）；跨存量单元事件 verb_subject_tract_changed 未建（动词未登记、存量单元未建，草案 §3 第 11 行），本卡不读它。
 * @param {PositionEngine} engine @param {object} state @param {string} subjectId @param {{pos?: Pos, place?: string, seedKey?: string, settle?: boolean}} target
 * @param {number | null} facing @param {string | null} cause @param {unknown} tx
 */
export function placeSubject(engine, state, subjectId, target, facing, cause, tx) {
  const kind = kindOfEntity(engine, state, subjectId);
  const oldPos = tryDim(engine, state, kind, subjectId, DIM.pos);
  const newPos = targetCell(engine, state, subjectId, kind, target);
  const f = nextFacing(engine, state, facing, oldPos, newPos);
  setEntityProp(state, subjectId, DIM.pos, newPos, tx);
  if (f !== undefined) setEntityProp(state, subjectId, DIM.facing, f, tx);
}

/**
 * move 原语的写者（卷九 :639；S2-L 草案 §3 R0，经 state-owners systems.position.primitiveWriter 登记、内核 resolve 回落调用）：
 * subject 必填（主会话 Q6 甲：提案不带行动者，缺省取行动者要等提案带行动者；卷九 :639 勘误），缺即 E-EFF-PARAM；
 * to 须是地点行，否则 E-DIM-REF-MISSING。个体存在与否、是否已终止到写入阶段才核（同一提案前面的 create 要到写入阶段才落地）。
 * @param {PositionEngine} engine @param {object} state @param {Record<string, unknown>} effect
 */
export function moveWriter(engine, state, effect) {
  if (!Object.hasOwn(effect, PARAM.subject)) throw new KernelError('E-EFF-PARAM', {}, `move: ${PARAM.subject} is required (defaulting to the actor waits for proposals that carry an actor)`);
  const to = String(effect[PARAM.to]);
  if (!engine.bake.placeTree.parentOf.has(to)) throw new KernelError('E-DIM-REF-MISSING', {}, `move.${PARAM.to} ${JSON.stringify(to)}: not a ${engine.bake.placeTree.kind} row`);
  const facing = Object.hasOwn(effect, PARAM.facing) && effect[PARAM.facing] !== null ? checkedFacing(engine, effect[PARAM.facing], 'move') : null;
  return { write: (/** @type {unknown} */ tx) => placeSubject(engine, state, String(effect[PARAM.subject]), { place: to }, facing, null, tx) };
}

/** move 原语写者的登记项（systems.position.primitiveWriter；travel 域 manifest 收齐）。 */
export const MOVE_WRITER = registerPrimitiveWriter('rules/travel/position.mjs#moveWriter', moveWriter);
