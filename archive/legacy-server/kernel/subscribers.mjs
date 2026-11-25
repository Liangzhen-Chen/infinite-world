// 事件订阅的登记与分发（卷九 R9-1.12 "前提失效通知"：订阅只走事件写通道，按动词与载荷里的 id 匹配，订阅者在事件投递那一刻被调；
// 卷二十 §4.1.3 第 5 条 :507：到期事件 verb_due_elapsed 由拥有者的订阅者处理后果，调度器不知道后果是什么；
// 卷二十四表 B `parent` :160：订阅上位词即收到全部下位词；卷二 :517 写只有三条路之"事件（world-events 订阅者改状态）"；体检 K6-62）。
// 本文件只做两件事：① 规则层与内核各部件在模块加载或装配时交入订阅（与 registerAdvanceHook 同一做法，内核不 import 规则层）；
// ② emit 写下一条事件后，把它投递给订阅了它的动词或其上位词的全部订阅者。不认任何具体动词、实体 id 或订阅者。
// 投递在写下事件的那一笔事务内（订阅者的写入与事件同进退）；订阅者里再发的事件排在队尾，等当前这一代投递完再投递下一代
// （卷二十 :500 反应项"先处理完上一代全部反应，再处理下一代"的同一口径），所以投递不嵌套。
// 订阅者的先后：按动词链（本动词先，再上位词）、同一动词按订阅者所在文件路径升序；全序只由登记决定。

import { KernelError } from './errors.mjs';
import { CODE_RE } from './handles/vocab-handle.mjs';
import { isModuleFile } from './handles/keys.mjs';

const TYPE = Object.freeze({ function: 'function', object: 'object' });
const NAME = Object.freeze({ verbFamily: 'verb' });
const CODE = Object.freeze({ id: 'E-DIM-ID-FORMAT', field: 'E-DIM-STRUCT-FIELD', dup: 'E-WRITER-DUPLICATE', verb: 'E-EVT-VERB' });

/**
 * @typedef {(engine: any, state: any, event: any) => void} Subscriber
 * 订阅者：在投递那一刻被调一次；event 是日志里那条冻结的事件记录（卷二十四表 A）。
 */

/** @type {Map<string, Map<string, Subscriber>>} 动词 → (订阅者文件 → 函数) */
const registry = new Map();
let delivering = false;
/** @type {{engine: any, state: any, event: any}[]} */
let queue = [];

/**
 * kernelApi `registerSubscriber(verb, file, handler)`：订阅一个动词（及其全部下位词）。同一 (动词, 文件) 交两次即 E-WRITER-DUPLICATE。
 * 动词是否 verb 族条目在装配后由 checkSubscribers 对照词表核对（词表装入前订阅就要登记，与终止清理的登记同一时序）。
 * @param {string} verb verb 句柄 @param {string} file 订阅者所在文件（相对 server-plugin/，与 stateKeys.writers 同写法） @param {Subscriber} handler
 * @returns {void}
 */
export function registerSubscriber(verb, file, handler) {
  if (typeof verb !== 'string' || !CODE_RE.test(verb)) throw new KernelError(CODE.id, {}, `registerSubscriber: ${JSON.stringify(verb)} is not a verb handle`);
  if (!isModuleFile(file)) throw new KernelError(CODE.field, {}, `registerSubscriber ${verb}: file must be a module path relative to server-plugin/`);
  if (typeof handler !== TYPE.function) throw new KernelError(CODE.field, {}, `registerSubscriber ${verb}: handler must be a function`);
  const byFile = registry.get(verb) || new Map();
  if (byFile.has(file)) throw new KernelError(CODE.dup, {}, `registerSubscriber: ${verb} already subscribed by ${file}`);
  byFile.set(file, handler);
  registry.set(verb, byFile);
}

/** 已登记的订阅（动词升序，文件升序），装配核对与测试用；kernel 组内。 @returns {{verb: string, file: string}[]} */
export function subscriptions() {
  const out = [];
  for (const verb of [...registry.keys()].sort()) for (const file of [...registry.get(verb).keys()].sort()) out.push({ verb, file });
  return out;
}

/**
 * 装配期核对：每个被订阅的动词都是词表里的 verb 族条目（订阅一个不存在的动词永远收不到事件，等于静默失效，按 E-EVT-VERB 拒）。
 * @param {{vocab: any}} engine
 * @returns {string[]} 错误行（空即通过）
 */
export function checkSubscribers(engine) {
  const idx = engine && engine.vocab ? engine.vocab.index : undefined;
  const errors = [];
  for (const { verb, file } of subscriptions()) {
    const rec = idx && typeof idx.get === TYPE.function ? idx.get(verb) : undefined;
    if (!rec || rec.family !== NAME.verbFamily) errors.push(`${CODE.verb} ${file}: subscribes ${verb}, which is not a registered verb row`);
  }
  return errors;
}

// 动词链：本动词，再沿表 B `parent` 向上（无环由加载期核对保证；这里仍用已见集合防环，不无限循环）。
function verbChain(engine, verb) {
  const idx = engine && engine.vocab ? engine.vocab.index : undefined;
  const chain = [];
  const seen = new Set();
  let cur = verb;
  while (typeof cur === 'string' && !seen.has(cur)) {
    seen.add(cur);
    chain.push(cur);
    const rec = idx && typeof idx.get === TYPE.function ? idx.get(cur) : undefined;
    cur = rec && rec.entry && typeof rec.entry === TYPE.object ? rec.entry.parent : null;
  }
  return chain;
}

function deliverOne(engine, state, event) {
  for (const verb of verbChain(engine, event.verb)) {
    const byFile = registry.get(verb);
    if (!byFile) continue;
    for (const file of [...byFile.keys()].sort()) byFile.get(file)(engine, state, event);
  }
}

/**
 * emit 写下事件后调（kernel/events.mjs；kernel 组内用，不在 kernelApi）：投递给订阅者。订阅者里再发的事件入队，由最外层这次调用按先进先出投递；
 * 任一订阅者抛错即清空队列并把错误原样往上抛（事务整笔回滚，事件与订阅者的写入一起撤销）。
 * @param {any} engine @param {any} state @param {any} event
 * @returns {void}
 */
export function dispatchEvent(engine, state, event) {
  queue.push({ engine, state, event });
  if (delivering) return;
  delivering = true;
  try {
    while (queue.length) {
      const next = queue.shift();
      deliverOne(next.engine, next.state, next.event);
    }
  } finally {
    delivering = false;
    queue = [];
  }
}

/** 测试与重新挂接用：清掉全部订阅与投递队列（kernel 组内用）。 */
export function resetSubscribers() {
  registry.clear();
  queue = [];
  delivering = false;
}
