// 内核挂接（卷二 §2.9 第 0 条"装配文件"：kernelApi `kernel/mount.mjs#mountKernel`，只对 index.mjs 开放；卷二 :974 封闭清单；体检 K6-80、块 5 遗留 2、3）。
// 装配时调一次，做内核自己的四件事，不做任何判定、不碰 state：
// ① 摘要能力对象交入存档层（installDigestCap；DigestCap 由装配文件从 textcore 取来，kernel 不 import node:crypto）。
// ② 读世界（统一加载器 loadWorld：维度表、规则表、声明表、原语目录，任一失败即启动失败，不带伤上路），组成 engine，交持有写者（installHoldingEngine，块 5 遗留 2）。
// ③ 到期订阅分发（卷二十 §4.1.3 第 5 条 :507）：到期事件 verb_due_elapsed 由调度器 due 段自己发（kernel/scheduler.mjs），
//    subscribers 把事件投递给订阅者；内核自己订阅的是复生窗口期满（expireReviveWindow，块 5 遗留 3，它自己认窗口项、别的项原样忽略）。
//    规则层的订阅者（卷九 activity.mjs 的前提失效通知等，6-13）经 kernelApi registerSubscriber 交入，装配核对每个订阅的动词都是词表里的 verb 行。
// ④ 钟：不在这里启动。墙钟能力对象只保存，等"推进"动作处理函数（规则表 rules.host.heartbeatMs 与 heartbeatStepMinutes 登记后）取用；本卡不读墙钟、不开定时器。
// 战役种子（template.seed）不在世界文件里，随"新开局"（卷十 R10-12 的开局）或"读档"（清单里记的世界种子）才有：engine.template.seed 开始为空，
// 经返回值 bindCampaignSeed(seed) 设入；种子未设之前 emit 取事件 id 会 E-SEED-COMPONENT 拒（kernel/events.mjs deriveEventId），不静默用缺省值。

import { loadWorld, repoRoot } from './load/world.mjs';
import { installDigestCap } from './save.mjs';
import { installHoldingEngine } from './holdings.mjs';
import { expireReviveWindow } from './terminate.mjs';
import { registerSubscriber, checkSubscribers } from './subscribers.mjs';
import { isSeedTemplate } from './sample.mjs';
import { KernelError } from './errors.mjs';

const DUE_VERB = 'verb_due_elapsed';
const CODE_SEED = 'E-SEED-COMPONENT';
const CODE_STRUCT = 'E-DIM-STRUCT-FIELD';
// 内核订阅复生窗口期满：订阅者所在文件是它的实现文件（stateKeys 写者登记同写法，相对 server-plugin/）。
const WINDOW_SUBSCRIBER_FILE = 'kernel/terminate.mjs';

/**
 * 内核自己的订阅：复生窗口期满。到期事件（由调度器 due 段自己发）的载荷 {kind, owner} 就是 expireReviveWindow 要的到期项（它自己认窗口项，别的项原样忽略）。
 * mountKernel 调一次；kernel 组内用，不在 kernelApi（测试拿同一条路径跑到期分发）。
 * @returns {void}
 */
export function installKernelSubscribers() {
  registerSubscriber(DUE_VERB, WINDOW_SUBSCRIBER_FILE, (eng, state, event) => expireReviveWindow(eng, state, event.payload));
}

/**
 * kernelApi `mountKernel(options)`（只对 index.mjs 开放）。
 * 仓库根由内核自己的位置推出（repoRoot），没有别的来路。
 * @param {{digestCap: {sha256Hex: Function}, wallTimer: object}} options
 * @returns {Readonly<{
 *  root: string, engine: any, world: any, primitives: unknown, wallTimer: object,
 *  bindCampaignSeed: (seed: string) => void
 * }>}
 */
export function mountKernel(options) {
  const { digestCap, wallTimer } = options || {};
  if (!digestCap || typeof digestCap.sha256Hex !== 'function') throw new KernelError(CODE_STRUCT, {}, 'mountKernel: digestCap required');
  if (!wallTimer || typeof wallTimer.heartbeat !== 'function' || typeof wallTimer.deadline !== 'function') throw new KernelError(CODE_STRUCT, {}, 'mountKernel: wallTimer required');
  installDigestCap(digestCap);
  const root = repoRoot();
  const world = loadWorld(root);
  if (!world.ok) throw new Error(`world failed to load:\n${world.text}`);
  const template = { seed: undefined };
  const engine = { vocab: world.vocab, rules: world.rules, units: world.env.units, tables: world.tables, template };
  installHoldingEngine(engine);
  installKernelSubscribers();
  const bad = checkSubscribers(engine);
  if (bad.length) throw new KernelError(CODE_STRUCT, {}, `subscriptions: ${bad.join('; ')}`);
  return Object.freeze({
    root,
    engine,
    world,
    primitives: world.primitives,
    wallTimer,
    bindCampaignSeed(seed) {
      if (!isSeedTemplate(seed)) throw new KernelError(CODE_SEED, {}, 'campaign seed must match ^[A-Za-z0-9_-]{1,64}$');
      template.seed = seed;
    },
  });
}
