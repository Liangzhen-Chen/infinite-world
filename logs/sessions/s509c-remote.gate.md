# 卡片门禁 s509c-remote
worktree F:/dnd-wt/S509 vs adb09c6986d0e48b0a4f994538336f2239b63fcc；覆盖率选测 (shadow)；耗时 45 分钟
总判定：**FAIL**；退出码：1；本结果仅覆盖快档，慢档由慢档扫描兜底
通过 396/398（快档 398）
## FAIL（2）
- tests/action-registry.test.mjs（测试）：注册表：数据声明、带命名空间、与 S0 动作清单一一对应且为最新同步：两次基线仅 0/2 次出现相同完整用例路径和指纹
- tests/performance.test.mjs（测试）：5000消息：真实历史分组、覆盖裁剪、场景与工具提示组装≤150ms，保持输入与增量索引：两次基线仅 1/2 次出现相同完整用例路径和指纹
已登记既有失败（KNOWN，已判 PASS）：0 个用例
既有待办：既有 94，新增 0，已移除 0，未核实 0
影子选测：保守集合 456，裁剪集合 456，裁剪会漏掉 0 个文件
58 slow files deferred to slow sweep
