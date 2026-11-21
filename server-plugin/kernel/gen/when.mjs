// 生成规则行的 whenRX 求值（卷十 §2.3 `rules.gen.water.fill.rows`、`rules.gen.bldfill.rows` 的 whenRX，R10-2.17、R10-7.12）：RX 只读代号与数值（R10-1.3）。
// 表达式文本在加载期已按 env.rxScope 过过 L2 核对（kernel/validate/types.mjs 的 rx 类型）；这里再按同一个 scope 编一次拿到树，求值只读被求值的那一行的维度
// （绑定 = 该行维度值；读到的维度这一行没有即未知，按未命中，卷二 §1.12）。编译结果按文本缓存在世界对象上。纯函数，不读 state、墙钟。
// 未落：读父行维度、读形制条目数值字段（R10-2.17 "父行维度"、R10-7.12 "所挂形制条目的数值字段"）要卷二登记 rx 命名空间读入口，现有 RX 只能读本行维度，见回报。

import { compileRXInScope, evaluateRX, rxChildren, splitDimKey, RxError } from '../rx.mjs';
import { T } from '../handles/markers.mjs';

const cache = new WeakMap();

/**
 * @param {{env: {rxScope: any}}} world 加载结果
 * @returns {(text: string, dims: Record<string, any>) => boolean} 求值函数：text 是规则行的 whenRX 文本，dims 是被求值的行的维度值
 */
export function makeWhen(world) {
  if (!cache.has(world)) cache.set(world, new Map());
  const byText = cache.get(world);
  return (text, dims) => {
    if (!byText.has(text)) byText.set(text, compileRXInScope(text, 'data', world.env.rxScope).tree);
    const tree = byText.get(text);
    const bound = {};
    const walk = (n) => {
      if (n === null || typeof n !== 'object') return;
      if (n.op === T.rx_op.dim) {
        const v = dims[splitDimKey(n.key).dim];
        if (v !== undefined && v !== null) bound[n.key] = v;
      }
      rxChildren(n).forEach(walk);
    };
    walk(tree);
    try { return evaluateRX(tree, { dim: bound, clock: {} }, {}) === true; } catch (e) {
      if (e instanceof RxError && e.key !== undefined) return false; // 读数未知按未命中
      throw e;
    }
  };
}
