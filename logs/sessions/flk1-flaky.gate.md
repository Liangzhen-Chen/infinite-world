# 卡片门禁 flk1-flaky
worktree F:/dnd-wt/FLK1 vs 314e5e3f50da18258164d615e7dc86d467b587be；覆盖率选测 (shadow)；耗时 43 分钟
总判定：**BLOCKED**；退出码：1；本结果仅覆盖快档，慢档由慢档扫描兜底
通过 397/398（快档 398）
## BLOCKED（1）
- tests/actions-catalog.test.mjs（测试）：actions.json 是最新导出（改工具枚举后须重新运行 node tools/export-actions.mjs）：两次基线同败；缺少有效登记（未登记、owner/到期日无效、已过期或缺判定时间），需主会话决定
已登记既有失败（KNOWN，已判 PASS）：0 个用例
既有待办：既有 90，新增 0，已移除 0，未核实 0
影子选测：保守集合 456，裁剪集合 456，裁剪会漏掉 0 个文件
58 slow files deferred to slow sweep
