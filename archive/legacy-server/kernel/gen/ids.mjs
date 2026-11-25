// 实例位次导出（卷十 R10-12.1 :937；卷二十七 R27-8.9 的实体 id 派生）：`instanceIdOf(slot, parentId, ordinal, minute)` 的五样成分一一对上——
// 世界种子；产生它的规则代号（取位次代号）；主体 id（取父 id）；世界时刻（clocked 为假的位次恒取 genesisMinute）；固定位次（取序位，须是世界内在的非负整数）。
// 位次条目 `idslot` 族（卷十 §2.1 :116）：kind 为空的位次导出的 id 只作抽取对象、不建实体；parentKinds 非空时父的实体类须在其内（本模块不查父的类，调用方给 parentKindOf）。
// 键里没有计数、没有版本成分（R10-12.3 :939）。纯函数，不读 state、墙钟。

import { KernelError } from '../errors.mjs';
import { CODE_RE } from '../handles/vocab-handle.mjs';
import { isSeedTemplate } from '../sample.mjs';
import { genIdKey } from './draw.mjs';

const FAMILY = 'idslot';
const isInt = (v) => Number.isSafeInteger(v) && v >= 0;

/** 位次条目。@param {any} vocab @param {string} slot @returns {any} */
export function idslotEntry(vocab, slot) {
  const fam = vocab && vocab.families && typeof vocab.families.get === 'function' ? vocab.families.get(FAMILY) : undefined;
  if (!fam || !Object.hasOwn(fam.entries, slot)) throw new KernelError('E-GEN-STAGE-UNKNOWN', {}, `idslot ${JSON.stringify(slot)}: not an entry of vocab family ${FAMILY}`);
  return fam.entries[slot];
}

/**
 * 导出一个 id（64 位十六进制的摘要）与抽取对象代号。
 * @param {any} vocab 加载期词表 @param {string} worldSeed 世界种子 @param {number} genesisMinute 第 0 日时刻
 * @param {string} slot 位次代号（idslot 族） @param {string} parentId 父 id @param {number} ordinal 序位 @param {number} [minute] 取建行时刻；clocked 为假时必须缺省（恒取 genesisMinute）
 * @returns {string} 64 位小写十六进制
 */
export function instanceDigestOf(vocab, worldSeed, genesisMinute, slot, parentId, ordinal, minute) {
  const entry = idslotEntry(vocab, slot);
  if (!isSeedTemplate(worldSeed)) throw new KernelError('E-SEED-COMPONENT', {}, `instanceIdOf: world seed ${JSON.stringify(worldSeed)} is not ^[A-Za-z0-9_-]{1,64}$`);
  if (typeof parentId !== 'string' || !CODE_RE.test(parentId)) throw new KernelError('E-SEED-COMPONENT', {}, `instanceIdOf: parent id ${JSON.stringify(parentId)} is not a code`);
  if (!isInt(ordinal)) throw new KernelError('E-SEED-COMPONENT', {}, `instanceIdOf: ordinal ${JSON.stringify(ordinal)} must be a non-negative integer (a world-intrinsic position, never a call count)`);
  if (!Number.isSafeInteger(genesisMinute)) throw new KernelError('E-SEED-COMPONENT', {}, 'instanceIdOf: genesisMinute is not an integer');
  if (entry.clocked !== true && minute !== undefined && minute !== genesisMinute) throw new KernelError('E-SEED-COMPONENT', {}, `instanceIdOf: slot ${slot} is not clocked, minute is always genesisMinute`);
  const at = entry.clocked === true ? minute : genesisMinute;
  if (!Number.isSafeInteger(at)) throw new KernelError('E-SEED-COMPONENT', {}, `instanceIdOf: slot ${slot} is clocked, minute must be an integer`);
  // 先赋值再返回：seed_sites 检测器把紧跟 return 的调用当声明跳过（同 grid.mjs 先例）。
  const digest = genIdKey('gen_ids', 'instance_digest', worldSeed, slot, parentId, ordinal, at);
  return digest;
}

/**
 * 建实体的实例 id（卷十 R10-12.1 `instanceIdOf`）：位次条目的 kind 非空（建实体），id = 该实体类的 id 前缀（表头 entity.idPrefix 的首项，调用方给）加摘要前半。
 * 前缀加摘要前半须合代号文法（小写字母起头、至多一个代号长度）；卷十没有写 id 的字面格式，此式与 drawObjectIdOf 同法（见回报"已定"）。
 * @param {any} vocab @param {string} worldSeed @param {number} genesisMinute @param {string} slot 位次代号（kind 非空） @param {string} parentId @param {number} ordinal @param {string} idPrefix
 * @returns {string}
 */
export function instanceIdOf(vocab, worldSeed, genesisMinute, slot, parentId, ordinal, idPrefix) {
  const entry = idslotEntry(vocab, slot);
  if (entry.kind === null || entry.kind === undefined) throw new KernelError('E-GEN-STAGE-UNKNOWN', {}, `idslot ${slot}: has no entity kind, it is a draw object (use drawObjectIdOf)`);
  const digest = instanceDigestOf(vocab, worldSeed, genesisMinute, slot, parentId, ordinal);
  const id = `${idPrefix}${digest.slice(0, digest.length >> 1)}`;
  if (!CODE_RE.test(id)) throw new KernelError('E-SEED-COMPONENT', {}, `instanceIdOf: ${JSON.stringify(id)} is not a code (idPrefix ${JSON.stringify(idPrefix)})`);
  return id;
}

/**
 * 抽取对象代号：kind 为空的位次导出的 id 只作骰值键的主体段用，须合代号文法（小写字母起头、至多一个代号长度），
 * 取 `<前缀>_` 加摘要前半（十六进制串长度的一半，不另写长度字面量）。前缀取位次代号去掉族前缀的部分。
 * @param {any} vocab @param {string} worldSeed @param {number} genesisMinute @param {string} slot @param {string} parentId @param {number} ordinal
 * @returns {string}
 */
export function drawObjectIdOf(vocab, worldSeed, genesisMinute, slot, parentId, ordinal) {
  const entry = idslotEntry(vocab, slot);
  if (entry.kind !== null && entry.kind !== undefined) throw new KernelError('E-GEN-STAGE-UNKNOWN', {}, `idslot ${slot}: has an entity kind, it builds entities (not a draw object)`);
  const digest = instanceDigestOf(vocab, worldSeed, genesisMinute, slot, parentId, ordinal);
  const stem = slot.slice(vocab.index.get(slot).prefix.length);
  return `${stem}_${digest.slice(0, digest.length >> 1)}`;
}
