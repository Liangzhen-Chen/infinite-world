// 效果族求值入口（卷二 §3.9 :1528–:1530；S1-3a，S1-3 接口草案 §2.2）：effects(engine, state, familyId, ctx) 纯函数，返回输出清单。
// 照族的 outputs 声明逐条返回、顺序同声明：kind、op 原样，paramsRX 求出的值与 idParams 取出的明文合成 params（键可带点表示嵌套，如 facts.<维度>）。
// 本阶段只实现 primitive 输出（加载期已核）。不认任何族或原语代号。

import { KernelError } from '../../kernel/errors.mjs';
import { evaluateRX } from '../../kernel/rx.mjs';
import { nsReadsFor } from './catalog.mjs';

const PATH_SEP = '.';
// id 型参数的明文来源（卷二 :1530）：target 即 targetSelector 选出的目标，ctx.<字段> 即调用方 ctx 里的字段。
const ID_TARGET = 'target';
const CTX_ROOT = 'ctx';

/** 按点分路径写进嵌套对象。 @param obj 目标对象 @param {string} path @param {unknown} value */
function setPath(obj, path, value) {
  const segs = path.split(PATH_SEP);
  let cur = obj;
  for (const s of segs.slice(0, -1)) {
    if (cur[s] === undefined) cur[s] = {};
    cur = cur[s];
  }
  cur[segs[segs.length - 1]] = value;
}

/** 取 ctx 里点分路径的字串值；缺即 E-EFF-PARAM。 @param {object} ctx @param {string} src @returns {string} */
function fromCtx(ctx, src) {
  const segs = src.split(PATH_SEP);
  if (segs[0] !== CTX_ROOT) throw new KernelError('E-EFF-PARAM', {}, `idParams source ${src}`);
  let cur = ctx;
  for (const s of segs.slice(1)) cur = cur !== null && typeof cur === 'object' && Object.hasOwn(cur, s) ? cur[s] : undefined;
  if (typeof cur !== 'string') throw new KernelError('E-EFF-PARAM', {}, `idParams source ${src} has no value`);
  return cur;
}

/**
 * @param {string} familyId
 * @param {{actor: string | null, target: string | null, slot: Record<string, string | number>, slotTable: Record<string, string>}} ctx
 *   本次动作的行动者、目标（targetSelector 选出）、槽位值（code 槽为 id，number 槽为整数）与各 code 槽所指数据表
 * @returns {ReadonlyArray<{kind: string, op: string, params: Record<string, unknown>}>}
 */
export function effects(engine, state, familyId, ctx) {
  const fam = engine.actions ? engine.actions.families.get(familyId) : undefined;
  if (!fam) throw new KernelError('E-EFF-FAMILY-UNKNOWN', {}, `effect family ${JSON.stringify(familyId)}`);
  const reads = nsReadsFor(engine, state, { actor: ctx.actor, slots: ctx.slot });
  return Object.freeze(fam.outputs.map((out) => {
    const params = {};
    for (const [p, src] of Object.entries(out.idParams)) setPath(params, p, src === ID_TARGET ? ctx.target : fromCtx(ctx, String(src)));
    for (const [p, tree] of Object.entries(out.paramsRX)) {
      try { setPath(params, p, evaluateRX(tree, {}, reads)); } catch (e) {
        if (e instanceof KernelError) throw e;
        throw new KernelError('E-EFF-RX', {}, `${familyId}.${p}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return Object.freeze({ kind: out.kind, op: out.op, params });
  }));
}
