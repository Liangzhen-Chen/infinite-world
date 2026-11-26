// 时间推进（S1-1 卡 B1；卷二十七 :190 heartbeatStepMinutes、卷二十七 :742 推进请求入输入序列、卷二 :1014 clockMinute）。
// 推进在事务外调用：外来推进请求（advanceRequest）按效果原语 time 走 processInput，提交后由 advance 按步长分步，每步一个事务；时钟只经存储层 writePath 写，路径来自 engine.P（卷二 :536）。

import { KernelError } from './errors.mjs';
import { readPath, writePath } from './storage.mjs';
import { processInput, runTransaction } from './transaction.mjs';

/** 时钟分钟（卷二 :1014）。 @param {any} engine @param {any} state @returns {number} */
export function clockMinute(engine, state) {
  const { P } = engine;
  return readPath(state, P.clock_minute());
}

/**
 * 初始化时钟（登记写者 scheduler.mjs；在世界创建事务里、state.genesis.genesisMinute 写入之后调）：时钟取第 0 日时刻（卷十 R10-1.2、R10-12.5，不取代码常量）。
 * genesisMinute 未写或不是整数即 E-DIM-UNKNOWN-READ。 @param {any} engine @param {any} state @param {any} tx
 */
export function initClock(engine, state, tx) {
  const { P } = engine;
  const genesis = readPath(state, P.genesis_genesisMinute());
  if (!Number.isInteger(genesis)) throw new KernelError('E-DIM-UNKNOWN-READ', {}, 'initClock: state.genesis.genesisMinute is not written');
  writePath(state, P.clock_minute(), genesis, tx);
}

/** 分钟数与步长核对：minutes 须正整数；步长非正整数即抛（卷二十七 :190 取值域 ≥1；装配期已核，这里防 engine 被别处构造）。 */
function checkAdvance(engine, minutes) {
  if (!Number.isInteger(minutes) || minutes <= 0) throw new KernelError('E-EFF-PARAM', {}, 'advance minutes must be a positive integer');
  const stepMax = engine.host.heartbeatStepMinutes;
  if (!Number.isInteger(stepMax) || stepMax < 1) throw new KernelError('E-DIM-DOMAIN-RANGE', {}, 'heartbeatStepMinutes must be an integer >= 1');
  return stepMax;
}

/**
 * 纯推进 minutes 分钟，不记输入（提交后推进调它；外来推进请求走 advanceRequest）：按 engine.host.heartbeatStepMinutes 分步（最后一步取余数）。
 * 某步被拒则该步整步作废，时钟停在上一步，返回 {ok:false, code, advancedMinutes}。
 * @param {any} engine @param {any} state @param {import('./save.mjs').LogBook} book 日志簿（纯推进不写它，签名与 advanceRequest 一致） @param {number} minutes
 * @returns {{ok: boolean, advancedMinutes: number, code?: any}}
 */
export function advance(engine, state, book, minutes) {
  const stepMax = checkAdvance(engine, minutes);
  const { P } = engine;
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

/**
 * 外来推进请求（玩家等待、心跳；卷二十七 :742–:743）：minutes 不合即抛、不记条目；合则按效果原语 time 记成输入条目
 * {kind:'advance', proposal:{effects:[{op:'time', minutes}]}}，走与玩家指令同一条处理管线 transaction.mjs#processInput。
 * @param {any} engine @param {any} state @param {import('./save.mjs').LogBook} book @param {number} minutes
 * @returns {{ok: boolean, code?: string, seq: number, advancedMinutes: number}}
 */
export function advanceRequest(engine, state, book, minutes) {
  checkAdvance(engine, minutes);
  return processInput(engine, state, book, { kind: 'advance', proposal: { effects: [{ op: 'time', minutes }] } });
}
