// kernelApi `clone`（卷二 §2.7 kernelApi :599）：全仓库唯一可用 structuredClone 的文件（§2.9 第 1 条"专用项"、全局对象白名单 kernel 行；B2-14）。
// 别的文件要深拷贝一律调本函数。

/**
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function clone(value) {
  return structuredClone(value);
}
