// 时间推进（S1-1 卡 B1；卷二十七 :190 heartbeatStepMinutes、卷二十七 :742 推进请求入输入序列、卷二 :1014 clockMinute）。
// 推进在事务外调用：先记推进请求，再按步长分步，每步一个事务；时钟只经存储层 writePath 写，路径来自 engine.P（卷二 :536）。

import { KernelError } from './errors.mjs';
import { readPath, writePath } from './storage.mjs';
import { recordInput, runTransaction } from './transaction.mjs';

/** 时钟分钟（卷二 :1014）。 @param {any} engine @param {any} state @returns {number} */
export function clockMinute(engine, state) {
  const { P } = engine;
  return readPath(state, P.clock_minute());
}

/** 初始化时钟（登记写者 scheduler.mjs；在装配层的事务里调）。 @param {any} engine @param {any} state @param {any} tx */
export function initClock(engine, state, tx) {
  const { P } = engine;
  writePath(state, P.clock_minute(), 0, tx);
}

/**
 * 推进 minutes 分钟：minutes 须正整数，否则抛；按 engine.host.heartbeatStepMinutes 分步（最后一步取余数）。
 * 某步被拒则该步整步作废，时钟停在上一步，返回 {ok:false, code, advancedMinutes}。
 * @param {any} engine @param {any} state @param {number} minutes
 * @returns {{ok: boolean, advancedMinutes: number, code?: any}}
 */
export function advance(engine, state, minutes) {
  if (!Number.isInteger(minutes) || minutes <= 0) throw new KernelError('E-EFF-PARAM', {}, 'advance minutes must be a positive integer');
  const { P } = engine;
  const stepMax = engine.host.heartbeatStepMinutes;
  recordInput(engine, state, { kind: 'advance', minutes });
  let done = 0;
  while (done < minutes) {
    const step = Math.min(stepMax, minutes - done);
    const r = runTransaction(engine, state, (tx) => {
      for (const hook of engine.advanceHooks) hook(engine, state, tx, step);
      writePath(state, P.clock_minute(), readPath(state, P.clock_minute()) + step, tx);
    });
    if (!r.ok) return { ok: false, code: r.code, advancedMinutes: done };
    done += step;
  }
  return { ok: true, advancedMinutes: done };
}
