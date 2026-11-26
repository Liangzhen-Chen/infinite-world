// 状态谓词单点（卷二 §2.5 :540）：S2-0a 只建已终止谓词 terminated（别名 dead）。
// 全书判断"实体是否已终止"只调它；终止标记 state.terminated 与族条目的 terminal 字段，读者只有本文件（卷二 :540、:585）。
// 实现里不出现任何族 id、状态行 id、词表族名或实体 kind：族条目所在的词表族取状态表 family 维度的声明。

import { readPath } from '../../kernel/storage.mjs';
import { statusView, statusFamilyOf } from '../status/status.mjs';

/** @typedef {import('../lifecycle/records.mjs').LifeEngine} LifeEngine */

// 状态族条目的「终止类」字段名（卷二 §1.11 族条目字段 terminal）。
const TERMINAL_FIELD = 'terminal';

/**
 * 已终止谓词（卷二 §2.5 :540）：有终止标记 → {ok:true, reason: 标记里的 cause}；
 * 尚无标记但身上有 terminal 族的状态实例（身死与终止之间的那一段）→ {ok:true, reason: 该实例的状态行}；否则 {ok:false, reason:null}。
 * @param {LifeEngine} engine @param {unknown} state @param {string} subject
 * @returns {Readonly<{ok: boolean, reason: string | null}>}
 */
export function terminated(engine, state, subject) {
  const { P } = engine;
  const mark = readPath(state, P.terminated(subject));
  if (mark !== undefined) return Object.freeze({ ok: true, reason: String(Object(mark).cause) });
  const families = Object(Object(engine.vocab).families);
  const hit = statusView(engine, state, subject).find((s) => {
    const entries = Object(Object(families[statusFamilyOf(engine, state, s.status).vocab]).entries);
    return Object.hasOwn(entries, s.family) && Object(entries[s.family])[TERMINAL_FIELD] === true;
  });
  return Object.freeze(hit === undefined ? { ok: false, reason: null } : { ok: true, reason: hit.status });
}

/** `dead` 与 `terminated` 是同一个函数的两个导出名（卷二 :540）。 */
export const dead = terminated;
