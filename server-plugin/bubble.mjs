// 现场泡的展开与收起（卷二十七 R27-1.13 展开、R27-1.14 收起、R27-1.16 回场对账；格子迁移 G10 余下）。
// 本文件只做"算"：给定改变泡之前的泡，求这一笔事务该收起、该展开哪些区格，以及每个展开区格里每个个体的落点或可立足核对结果；不写任何状态
// （卷二十七 §3.2 :274 "展开落格调卷十七 placeSubject 与卷三乙批次写者，本卷不写位置"）。位置由写者 placeSubject（卷十七，G12，server-plugin/position.mjs）在同一笔事务里按本文件给的结果写。
//
// 已定（理由在后）：
// 1. 入口 bubbleTransition(engine, state, before)：调用方是改变泡的那一笔事务里的写者（玩家控制实体的位置写入、玩家控制登记的变动，R27-1.13 时机），
//    在写入前取 before = bubbleView(...)，写入后、事务结束前调本函数；after 由状态此刻算出（只经 sim-tiers.mjs 的 bubbleView，判"在不在泡里"不另实现）。读档、推进请求的切分都不是展开时机，本文件没有任何入口读档或推进时调用。
//    理由：泡只由状态算出（R27-1.4），"此前的泡"状态里没有，只有调用方在写入前才拿得到；不用模块级"上一次的泡"（那是跨调用状态，读档后会错）。
// 2. 次序：先收起、后展开（R27-1.14）；展开按区格序号字典序 (w, x, y)，区格内按个体 id 码点序（R27-1.13 第 2 步、R27-5.3）。
// 3. 收起在状态上无写：基底与区格缓存是投影，不在状态里（gridView 无跨调用缓存，grid 问题记 9）；差分原样留存；位置不降精度（个体 pos 保留到格，R27-1.14 ④）；
//    细格场值折算回地点级归卷二十 foldBubbleFields，随 G14（未落）。所以收起只给出区格列表，不改任何东西。
// 4. 展开第 1 步（基底）由 gridView 派生不落盘，本文件不预热也不存；有形存量由账户余额派生（卷五 §4.7 规则 12）——gridView 现无存量层（docs/问题.md G6 遗留 1），未落。
// 5. 展开第 2 步落格（已定：主会话 11-22，以卷十七 §3.3 :297–:304 与 C17-18 为准，理由：卷十七为已封现行卷，卷二十七 :317、卷五 :501 的"给地点、整足迹哈希"是 C17-18 未落的旧文；
//    两卷措辞对齐的勘误记 docs/问题.md 下批勘误清单，等李白批）：位置 coarse 为真且区格是 c 的个体，给位置（个体现有 pos）：目标格可立足即落它，否则取 landSearchRadiusCells 内
//    直线距离最近的可立足格，并列格序号字典序最小——与卷五挤出同一取法，直接复用 extrudeCell（内核 extrudeLanding），不另写、不用哈希、不用种子键。范围内没有可立足格、或读不到
//    （extrudeCell 的 buried、unknown）一律按未知：项里 outcome 为 unknown、to 为空。E-GRID-LAND-UNKNOWN 不在本文件记（已定：主会话 11-22，G12 对照表 #12 选甲，理由：卷十七 :302 与 :880
//    规定写者 placeSubject 落不下才记、且只记一次；本函数是"只算"的纯函数，由它再记就会与 placeSubject 重复）：展开写位置的 position.mjs 对每个 coarse 个体调 placeSubject，由 placeSubject 唯一记。
//    位置已在细格上的个体按卷五 §4.5 规则 6 经 settleCell 核一次：stay 不出项，其余原样给出（fall、extrude、buried、unknown、none）。
// 6. 个体枚举：个体表的全部行与 state.created 里的个体行，按 id 码点序，读 pos；位置读不出（没有 pos、未知）的个体不在任何区格里，跳过。全表一遍（每次泡变动一遍，不是每个区格一遍）；
//    G12 未建位置索引（问题.md G10 遗留 6 的性能项留给腾讯云块验收实测，测量点：本函数的 personIds 一遍枚举）。批次（物）落格归批次写者卡，卷三乙 spot 维度尚未登记：未落。
//    rebaseBubble（R27-1.16 日界重派生钩子）在 position.mjs，读泡内个体经本文件导出的 subjectsIn。

import { dim } from './kernel/dimensions.mjs';
import { kindOfEntity } from './kernel/vocab.mjs';
import { regionOf, extrudeCell, settleCell } from './kernel/place.mjs';
import { E } from './kernel/handles/generated.mjs';
import { bubbleView } from './sim-tiers.mjs';

const S = Object.freeze({ person: 'person', pos: 'pos' });
// 项里 outcome 的取值；stay 是 settleCell 返回的"可立足、不动"（同 kernel/grid-base.mjs SETTLE.stay，测试按字面比对两边一致）。
const OUTCOME = Object.freeze({ land: 'land', unknown: 'unknown', stay: 'stay' });

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const regionKey = (w, x, y) => `${w}:${x}:${y}`;
const flatten = (view) => view.flatMap((s) => s.regions.map((r) => ({ w: s.w, x: r.x, y: r.y })));

/**
 * 两个泡（bubbleView 的返回）之差：此前不在泡内、此刻在的区格（展开）；此前在、此刻不在的（收起）。各按 (w, x, y) 升序。纯函数。
 * @param {readonly {w: number, regions: readonly {x: number, y: number}[]}[]} before @param {readonly {w: number, regions: readonly {x: number, y: number}[]}[]} after
 * @returns {{collapse: {w: number, x: number, y: number}[], expand: {w: number, x: number, y: number}[]}}
 */
export function bubbleDelta(before, after) {
  const was = new Set(flatten(before).map((r) => regionKey(r.w, r.x, r.y)));
  const now = new Set(flatten(after).map((r) => regionKey(r.w, r.x, r.y)));
  const order = (a, b) => cmp(a.w, b.w) || cmp(a.x, b.x) || cmp(a.y, b.y);
  return {
    collapse: flatten(before).filter((r) => !now.has(regionKey(r.w, r.x, r.y))).sort(order),
    expand: flatten(after).filter((r) => !was.has(regionKey(r.w, r.x, r.y))).sort(order),
  };
}

/**
 * 全部个体 id：个体表的行与 state.created 里的个体行，码点序（perceive.mjs 的事件目击候选也读它：G13，同样没有位置索引，一遍全扫）。
 * @param {object} engine @param {object} state
 * @returns {string[]}
 */
export function personIds(engine, state) {
  const t = engine && engine.tables instanceof Map ? engine.tables.get(S.person) : undefined;
  const ids = new Set(t && t.flat && t.flat.rows instanceof Map ? t.flat.rows.keys() : []);
  const created = isObj(state) && isObj(state.created) ? state.created : {};
  for (const id of Object.keys(created)) {
    let kind = null;
    try { kind = kindOfEntity(state, id); } catch (e) { if (!(e && e.code === E.E_DIM_REF_MISSING)) throw e; }
    if (kind === S.person) ids.add(id);
  }
  return [...ids].sort(cmp);
}

/**
 * 区格集合里的个体：{region key → [{id, pos}]}，个体按 id 码点序。位置读不出的个体不在任何区格里。key 形如 `w:x:y`。
 * @param {object} engine @param {object} state @param {readonly object[]} regions 区格 {w, x, y} 的表
 * @returns {Map<string, object[]>} 区格键 → 个体项 {id, pos} 的表
 */
export function subjectsIn(engine, state, regions) {
  const want = new Set(regions.map((r) => regionKey(r.w, r.x, r.y)));
  const out = new Map();
  for (const id of personIds(engine, state)) {
    const f = dim(engine, state, S.person, id, S.pos);
    if (!f.known || !isObj(f.value)) continue;
    const r = regionOf(engine, f.value);
    const key = regionKey(f.value.w, r.x, r.y);
    if (!want.has(key)) continue;
    if (!out.has(key)) out.set(key, []);
    out.get(key).push({ id, pos: f.value });
  }
  return out;
}

/**
 * 改变泡的那一笔事务结束前调用（见文件头已定 1）。返回
 * `{collapse, expand, moves}`：collapse、expand 是区格表 [{w, x, y}]（(w, x, y) 升序）；moves 是展开区格里需要动位置或交接的个体项，按（区格序号、个体 id）序，
 * 每项 `{subject, w, region: {x, y}, from: pos, outcome, to, dropM?}`：
 * - outcome 'land'：coarse 位置落到可立足细格，to 是落点（coarse 假）；
 * - outcome 'unknown'（coarse 的个体范围内没有可立足格或读不到；或细格个体 settleCell 读不到）：位置不改，to 为 null（E-GRID-LAND-UNKNOWN 由 placeSubject 记，不在这里）；
 * - 细格个体的 settleCell 结果：'fall'（to、dropM）、'extrude'（to）、'buried'、'none'（to 为 null，交卷十三、卷四）；'stay' 不出项。
 * 调用方（position.mjs 的展开接线，G12）按本表逐项经 placeSubject 写位置，在同一笔事务里。本函数不写状态、没有任何副作用。
 * @param {object} engine @param {object} state
 * @param {readonly {w: number, regions: readonly {x: number, y: number}[]}[]} before 写入前的泡（bubbleView 的返回）
 */
export function bubbleTransition(engine, state, before) {
  const { collapse, expand } = bubbleDelta(before, bubbleView(engine, state));
  const byRegion = subjectsIn(engine, state, expand);
  const moves = [];
  for (const c of expand) {
    for (const { id, pos } of byRegion.get(regionKey(c.w, c.x, c.y)) || []) {
      const base = { subject: id, w: c.w, region: { x: c.x, y: c.y }, from: pos };
      if (pos.coarse === true) {
        const found = extrudeCell(engine, state, pos);
        if (found.kind !== OUTCOME.land) {
          moves.push({ ...base, outcome: OUTCOME.unknown, to: null });
        } else {
          moves.push({ ...base, outcome: OUTCOME.land, to: found.cell });
        }
        continue;
      }
      const s = settleCell(engine, state, pos);
      if (s.kind === OUTCOME.stay) continue;
      moves.push({ ...base, outcome: s.kind, to: s.cell === undefined ? null : s.cell, ...(s.dropM === undefined ? {} : { dropM: s.dropM }) });
    }
  }
  return { collapse, expand, moves };
}
