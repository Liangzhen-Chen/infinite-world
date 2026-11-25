// chore/hygiene-fixes 的行为测试：mdLinks 遮蔽围栏代码后行号不偏移（夹具 docs/__case__ 里写明期望行号）；
// docLimits 登记的被管文档在仓库里找不到时报 E-ACC-ITEM-PARAM，不静默放过。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContext, readRegistry } from '../../tools/accept/read.mjs';
import { splitFixture } from '../../tools/accept/run.mjs';
import { detect } from '../../tools/accept/detectors/hygiene.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ctxOf = (files) => loadContext(ROOT, { files: [...files.keys()].sort(), read: (p) => files.get(p) });

test('mdLinks：围栏之后断链的命中行号等于原文件行号（期望值由夹具写明）', () => {
  const text = readFileSync(join(ROOT, 'tests/accept/bypass/md_links-21.txt'), 'utf8');
  const files = splitFixture(text, 'server-plugin/__case__/md_links-21.mjs');
  const mdPath = [...files.keys()].find((f) => f.endsWith('.md'));
  assert.ok(mdPath, '夹具里应有被扫的 .md');
  const expected = Number(/期望命中行号：(\d+)/.exec(files.get(mdPath))[1]);
  const cls = readRegistry(ROOT, 'scanclasses').find((r) => r.scanClass === 'md_links');
  const hits = detect(ctxOf(files), { code: 'E-ACC-ARCHIVE-REF' }, cls);
  assert.equal(hits.length, 1, '围栏内的链接不报，只报围栏外那一条断链');
  assert.equal(hits[0].file, mdPath);
  assert.equal(hits[0].line, expected);
});

test('docLimits：登记的被管文档不存在时报 E-ACC-ITEM-PARAM；存在的文档照常按行数与叠层词判', () => {
  const cls = (path) => ({ mode: 'docLimits', files: [{ path, maxLines: 1 }] });
  const missing = detect(ctxOf(new Map([['docs/present.md', '# present']])), { code: 'E-ACC-ARCHIVE-REF' }, cls('docs/absent.md'));
  assert.equal(missing.length, 1);
  assert.equal(missing[0].code, 'E-ACC-ITEM-PARAM');
  const empty = detect(ctxOf(new Map([['docs/present.md', '# present']])), { code: 'E-ACC-ARCHIVE-REF' }, cls(''));
  assert.equal(empty[0].code, 'E-ACC-ITEM-PARAM', '空路径也是找不到，不能因空值跳过');
  const present = detect(ctxOf(new Map([['docs/present.md', '# a\n# b\n']])), { code: 'E-ACC-ARCHIVE-REF' }, cls('docs/present.md'));
  assert.deepEqual(present.map((h) => [h.code, h.symbolPath]), [['E-ACC-ARCHIVE-REF', 'lines']]);
});
