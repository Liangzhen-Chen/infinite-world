// 服务端 textcore 的摘要能力（卷二 §2.9 能力对象表 DigestCap :1054、:1060；卷二十七 R27-4.1 :542 摘要只有一种）。
// 全仓库唯一 import node:crypto 的文件；算法只有 sha256。kernel 不 import 本文件：装配文件 index.mjs 经 createDigestCap 取得能力对象后注入 kernel。

import { createHash } from 'node:crypto';

/**
 * DigestCap：sha256Hex(data, encoding) 把 data 按 encoding 解成字节后算 sha256，返回 64 位小写十六进制。
 * @typedef {{sha256Hex: (data: string, encoding: 'utf8' | 'base64') => string}} DigestCap
 */

/**
 * groupApi `createDigestCap()`（调用者只有装配文件 index.mjs）：返回冻结的 DigestCap。
 * @returns {DigestCap}
 */
export function createDigestCap() {
  return Object.freeze({
    /** @param {string} data @param {'utf8' | 'base64'} encoding */
    sha256Hex(data, encoding) {
      if (typeof data !== 'string') throw new TypeError('DigestCap.sha256Hex: data must be a string');
      if (encoding !== 'utf8' && encoding !== 'base64') throw new TypeError('DigestCap.sha256Hex: encoding must be utf8 or base64');
      return createHash('sha256').update(data, encoding).digest('hex');
    },
  });
}
