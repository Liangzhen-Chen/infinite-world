// 只读入口全量检查，第 1/4 组（入口序号 % 4 == 0）：在仓库临时副本上实跑，运行前后文件逐字节不变。
// 全量层：登记完整性与静态扫描在 tests/readonly-entries.test.mjs（日常层）；本文件已列入 tools/smoke-tests.json 的 nightlyOnly（合并层推迟到全量）。
import test from 'node:test';
import {runGroup} from './fixtures/readonly-runner.mjs';

test('只读入口在仓库副本上运行前后，所有文件逐字节不变（第 1/4 组）', {timeout: 3500_000}, () => runGroup(0));
