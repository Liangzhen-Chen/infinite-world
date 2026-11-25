// 检测器 hygiene（卷十二 §2.3 开放登记；L-08 扩项，docs/gemini/kickoff-1125.md:479）：防回潮杂项扫描。
// 模式、扫描范围、阈值、正则与豁免全在扫描类别行（数据），本文件不列任何 IP、密钥形态、文档路径或上限数字：
//   mode = ipv4        公网 IPv4 字面量；排除段（CIDR）、版本号前缀判法都在数据里
//   mode = linePatterns 逐行正则（密钥形态等）
//   mode = mdLinks     docs 下 .md 的相对链接指向仓库里不存在的文件（去掉围栏代码与行内代码后判）
//   mode = docLimits   指定文档的行数上限与禁用叠层词
//   mode = fileSize    指定范围内单个扩展名文件超过字节上限
// 豁免与 archive_ref 同形：{path, line?, reason}，带 line 只跳过含该子串的行，不带 line 跳过整个文件；缺理由报 E-ACC-ITEM-PARAM。
// 命中均落在被扫文件的一行或整文件上；rowKey 不含行号，行数变化不改行键。

import { LAYOUT, REGISTRY } from '../read.mjs';

function paramHit(why) {
  return [{ file: `${LAYOUT.accDir}/${REGISTRY.scanclasses.file}`, line: 0, nodeKind: 'param', symbolPath: why, code: 'E-ACC-ITEM-PARAM' }];
}

function scoped(ctx, scope) {
  const roots = Array.isArray(scope.roots) ? scope.roots : [];
  const except = Array.isArray(scope.except) ? scope.except : [];
  return ctx.files.filter((f) => roots.some((r) => (r.endsWith('/') ? f.startsWith(r) : f === r)) && !except.some((x) => f === x || f.startsWith(x)));
}

function exemptionsOf(cls) {
  const list = Array.isArray(cls.exemptions) ? cls.exemptions : [];
  for (const e of list) if (!e || typeof e.reason !== 'string' || !e.reason) return null;
  const skipFile = new Set();
  const skipLine = new Map();
  for (const e of list) {
    if (typeof e.path !== 'string' || !e.path) continue;
    if (e.line) skipLine.set(e.path, [...(skipLine.get(e.path) || []), e.line]);
    else skipFile.add(e.path);
  }
  return { skipFile, skipLine };
}

function textOf(ctx, file) {
  const text = ctx.read(file);
  return typeof text === 'string' && !text.includes('\0') ? text : null;
}

function ipv4ToInt(s) {
  const parts = s.split('.').map((x) => Number(x));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function cidrContains(cidr, ip) {
  const [base, bitsRaw] = String(cidr).split('/');
  const b = ipv4ToInt(base);
  const bits = Number(bitsRaw);
  if (b === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return ((ip & mask) >>> 0) === ((b & mask) >>> 0);
}

function ipv4Hits(ctx, cls, code, ex) {
  let match; let versionRe = null;
  try {
    match = new RegExp(cls.match, 'g');
    if (typeof cls.versionPrefixRe === 'string' && cls.versionPrefixRe) versionRe = new RegExp(cls.versionPrefixRe);
  } catch { return null; }
  const cidrs = Array.isArray(cls.excludeCidrs) ? cls.excludeCidrs : [];
  const hits = [];
  for (const file of scoped(ctx, cls.scope || {})) {
    if (ex.skipFile.has(file)) continue;
    const text = textOf(ctx, file);
    if (text === null) continue;
    const skip = ex.skipLine.get(file) || [];
    text.split(/\r?\n/).forEach((line, i) => {
      if (skip.some((s) => line.includes(s))) return;
      match.lastIndex = 0;
      let m;
      while ((m = match.exec(line))) {
        const ip = ipv4ToInt(m[0]);
        if (ip === null) continue;
        const before = line[m.index - 1] || '';
        const after = line[m.index + m[0].length] || '';
        if (/[0-9.]/.test(before)) continue;
        if (after === '.' && /[0-9]/.test(line[m.index + m[0].length + 1] || '')) continue;
        if (versionRe && versionRe.test(line.slice(0, m.index))) continue;
        if (cidrs.some((c) => cidrContains(c, ip))) continue;
        hits.push({ file, line: i + 1, nodeKind: 'ipv4', symbolPath: '', code });
        return;
      }
    });
  }
  return hits;
}

function linePatternHits(ctx, cls, code, ex) {
  let patterns;
  try { patterns = (Array.isArray(cls.patterns) ? cls.patterns : []).map((p) => new RegExp(p)); } catch { return null; }
  if (!patterns.length) return null;
  const hits = [];
  for (const file of scoped(ctx, cls.scope || {})) {
    if (ex.skipFile.has(file)) continue;
    const text = textOf(ctx, file);
    if (text === null) continue;
    const skip = ex.skipLine.get(file) || [];
    text.split(/\r?\n/).forEach((line, i) => {
      if (skip.some((s) => line.includes(s))) return;
      if (patterns.some((re) => re.test(line))) hits.push({ file, line: i + 1, nodeKind: 'pattern', symbolPath: '', code });
    });
  }
  return hits;
}

function mdLinkHits(ctx, cls, code, ex) {
  let linkRe; let externalRe; let invalidRe; let fenceRe; let spanRe;
  try {
    linkRe = new RegExp(cls.linkRe, 'g');
    externalRe = new RegExp(cls.externalRe);
    invalidRe = cls.invalidTargetRe ? new RegExp(cls.invalidTargetRe) : null;
    fenceRe = cls.fenceRe ? new RegExp(cls.fenceRe, 'gm') : null;
    spanRe = cls.codeSpanRe ? new RegExp(cls.codeSpanRe, 'g') : null;
  } catch { return null; }
  const hits = [];
  for (const file of scoped(ctx, cls.scope || {})) {
    if (ex.skipFile.has(file) || !file.endsWith('.md')) continue;
    let text = textOf(ctx, file);
    if (text === null) continue;
    if (fenceRe) text = text.replace(fenceRe, '');
    if (spanRe) text = text.replace(spanRe, '');
    linkRe.lastIndex = 0;
    let m;
    while ((m = linkRe.exec(text))) {
      let target = String(m[1]).trim();
      if (!target || externalRe.test(target) || (invalidRe && invalidRe.test(target))) continue;
      target = target.split('#')[0].split('?')[0];
      if (!target) continue;
      let decoded = target;
      try { decoded = decodeURIComponent(target); } catch { decoded = target; }
      const resolved = decodePath(file, decoded);
      if (existsIn(ctx.files, resolved)) continue;
      hits.push({ file, line: lineOf(text, m.index), nodeKind: 'link', symbolPath: target, code });
    }
  }
  return hits;
}

function decodePath(file, target) {
  const dir = file.slice(0, file.lastIndexOf('/') + 1);
  const segs = (dir + target).split('/');
  const out = [];
  for (const s of segs) {
    if (s === '' && out.length === 0) continue;
    if (s === '.' || s === '') continue;
    if (s === '..') out.pop(); else out.push(s);
  }
  return out.join('/');
}

function existsIn(files, path) {
  return files.includes(path) || files.some((f) => f.startsWith(path + '/'));
}

function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text[i] === '\n') line++;
  return line;
}

// 路径归一：去掉开头的 `./`。用例夹具里不带斜杠的 `@file` 名会落在用例目录下（`tools/__case__/CLAUDE.md`），
// 归一后仍按登记里的仓库相对路径对上；真仓库里本来就是原名，结果不变。
function normPath(p) {
  return String(p).split('/').filter((s, i) => !(s === '' && i === 0) && s !== '.').join('/');
}

function docLimitHits(ctx, cls, code) {
  const hits = [];
  const byNorm = new Map(ctx.files.map((f) => [normPath(f), f]));
  for (const entry of Array.isArray(cls.files) ? cls.files : []) {
    if (!entry || typeof entry.path !== 'string') return paramHit('docLimits entry path');
    const actual = byNorm.get(normPath(entry.path));
    if (!actual) continue;
    const text = ctx.read(actual);
    if (typeof text !== 'string') continue;
    const lines = text === '' ? 0 : text.replace(/\n$/, '').split('\n').length;
    if (Number.isInteger(entry.maxLines) && lines > entry.maxLines) hits.push({ file: actual, line: 0, nodeKind: 'doc', symbolPath: 'lines', code });
    for (const phrase of entry.forbid || []) {
      const at = text.indexOf(phrase);
      if (at >= 0) hits.push({ file: actual, line: lineOf(text, at), nodeKind: 'doc', symbolPath: 'phrase', code });
    }
  }
  return hits;
}

function fileSizeHits(ctx, cls, code, ex) {
  const max = cls.maxBytes;
  if (!Number.isInteger(max) || max <= 0) return null;
  const ext = typeof cls.ext === 'string' && cls.ext ? cls.ext : '';
  const hits = [];
  for (const file of scoped(ctx, cls.scope || {})) {
    if (ex.skipFile.has(file) || (ext && !file.endsWith(ext))) continue;
    const text = ctx.read(file);
    if (typeof text !== 'string') continue;
    const size = Buffer.byteLength(text, 'utf8');
    if (size > max) hits.push({ file, line: 0, nodeKind: 'file', symbolPath: '', code });
  }
  return hits;
}

export function detect(ctx, params = {}, cls = {}) {
  const ex = exemptionsOf(cls);
  if (!ex) return paramHit('exemption without reason');
  const code = params.code;
  const needsScope = ['ipv4', 'linePatterns', 'mdLinks', 'fileSize'].includes(cls.mode);
  const roots = cls.scope && Array.isArray(cls.scope.roots) ? cls.scope.roots : [];
  if (needsScope && !roots.length) return paramHit(`mode=${String(cls.mode)} scope roots empty`);
  if (cls.mode === 'docLimits' && (!Array.isArray(cls.files) || !cls.files.length)) return paramHit('docLimits files empty');
  let hits;
  if (cls.mode === 'ipv4') hits = ipv4Hits(ctx, cls, code, ex);
  else if (cls.mode === 'linePatterns') hits = linePatternHits(ctx, cls, code, ex);
  else if (cls.mode === 'mdLinks') hits = mdLinkHits(ctx, cls, code, ex);
  else if (cls.mode === 'docLimits') hits = docLimitHits(ctx, cls, code);
  else if (cls.mode === 'fileSize') hits = fileSizeHits(ctx, cls, code, ex);
  else return paramHit(`mode=${String(cls.mode)}`);
  return hits === null ? paramHit(`mode=${String(cls.mode)} data`) : hits;
}
