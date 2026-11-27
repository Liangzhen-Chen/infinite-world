// 验收：卡 chore/s2-gov：机读规矩迁移后解析等价。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-gov；未参与写码与审卡。
// 依据：CLAUDE.md:8（规矩 ② 与生效裁定，门禁机读规矩须与基线一致）；docs/PLAN.md:67（S2-GOV：第五节原样移到机读文件，解析器不变）。
// 黑盒：用实现已有的 loadRules 解析两边文本，比对结果对象；基线固定为提交 6413e8a47。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const BASE = '6413e8a47';
// 本卡最终内容（合入后历史中保留）：一次性对比（改前后比较、删除、新增条目行号）只看这一版，别的卡改动这些文件不影响本卡验收。
const PIN = 'e5cb05269';

// 依据：卷十二:545；补充：CLAUDE.md:8；测的是什么：基线提交的派活卡头规矩解析出的规则对象，与新机读文件解析出的规则对象深相等；测试位置：tests/acceptance/chore-s2-gov/card-rules-equiv.test.mjs:15
test('新机读规矩与基线第五节解析结果深相等', async () => {
  const { loadRules } = await import(pathToFileURL(join(ROOT, 'tools/accept/lib/card-archive.mjs')).href);
  const oldText = execFileSync('git', ['show', `${BASE}:docs/派活卡头规矩.md`], { cwd: ROOT, encoding: 'utf8' });
  const newText = execFileSync('git', ['show', `${PIN}:tools/accept/card-rules.md`], { cwd: ROOT, encoding: 'utf8' });
  const a = loadRules(oldText);
  const b = loadRules(newText);
  assert.equal(a.error, undefined, `基线解析报错：${a.error}`);
  assert.equal(b.error, undefined, `新文件解析报错：${b.error}`);
  assert.deepStrictEqual(b.rules, a.rules);
});
