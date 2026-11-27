// S2-T1b 黑盒验收：规则层不写死地区代号，不导出纬度换算（卷二十勘误 S2-T1b；卷二十 T-4、T-8 口径）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-t1b。
// 依据与每条测的是什么见 docs/卡档案/feat-s2-t1b/出题.md。注释不计；门禁与 tsc 本身由 CI 判定，不在本文件。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as S from './support.mjs';

const SERVER = join(S.ROOT, 'server-plugin');
const RULES = join(SERVER, 'rules');
const CODE_PREFIX = /^(ssch_|tsch_|st_|loc_)/;
const sourceOf = (f) => S.stripComments(readFileSync(f, 'utf8'));

test('8a. 规则层字符串字面量不以 ssch_、tsch_、st_、loc_ 开头（地区代号只在数据里，不在规则代码里）', () => {
  const hits = [];
  for (const f of S.walk(RULES)) {
    for (const lit of S.literalsOf(sourceOf(f))) {
      if (CODE_PREFIX.test(lit)) hits.push(`${S.relPath(f)}：${lit}`);
    }
  }
  assert.deepEqual(hits, [], '规则层不得写死地区方案、节气方案、地点的代号');
});

test('8b. 无 latitudeOf 导出：server-plugin 下任何模块都不导出名为 latitudeOf 的函数、常量或具名列表项', () => {
  const hits = [];
  const decl = /export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+latitudeOf\b/;
  const list = /export\s*\{[^}]*\blatitudeOf\b[^}]*\}/;
  for (const f of S.walk(SERVER)) {
    const src = sourceOf(f);
    if (decl.test(src) || list.test(src)) hits.push(S.relPath(f));
  }
  assert.deepEqual(hits, [], '不得导出 latitudeOf（卷二十勘误 S2-T1b：季节与节气不读纬度）');
});
