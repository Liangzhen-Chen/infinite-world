// 服务端 textcore 的摘要（卷二 §2.7 groupApi :648–649；§2.9 第 0 条能力对象表 DigestCap :981、"摘要算法" :987；体检 K2-08）。
// 全仓库唯一 import node:crypto 的文件（§2.9 第 1 条全局对象白名单 textcore 行 :1013）；算法只有 sha256（卷二十七 R27-4.1 摘要只有一种）。
// kernel 不 import 本文件：装配文件 index.mjs 经 createDigestCap 取得能力对象后注入 kernel（kernel/save.mjs installDigestCap）。

import { createHash } from 'node:crypto';

/**
 * groupApi `digestHex(text)`（:648，调用者 output-gate/envelope-exit.mjs）：sha256(UTF-8(text)) 的 64 位小写十六进制（信封 digest，:911 第 3 条）。
 * @param {string} text
 * @returns {string}
 */
export function digestHex(text) {
  if (typeof text !== 'string') throw new TypeError('digestHex: text must be a string');
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * DigestCap 的结构类型（接收方按结构接收，不为取类型 import 本文件，:984）。
 * sha256Hex(data, encoding)：data 按 encoding 解成字节后算 sha256，返回 64 位小写十六进制。
 * encoding 只有两种：'utf8'（存档摘要、分片内容寻址）与 'base64'（Sealed 的 bytes 存档形态，读档重算 E-SEAL-DIGEST 用，:1128）。
 * @typedef {{sha256Hex: (data: string, encoding: 'utf8' | 'base64') => string}} DigestCap
 */

/**
 * groupApi `createDigestCap()`（:649，调用者只有装配文件 index.mjs）：返回冻结的 DigestCap。
 * @returns {DigestCap}
 */
export function createDigestCap() {
  return Object.freeze({
    sha256Hex(data, encoding) {
      if (typeof data !== 'string') throw new TypeError('DigestCap.sha256Hex: data must be a string');
      if (encoding !== 'utf8' && encoding !== 'base64') throw new TypeError('DigestCap.sha256Hex: encoding must be utf8 or base64');
      return createHash('sha256').update(data, encoding).digest('hex');
    },
  });
}
