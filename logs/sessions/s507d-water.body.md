# 续卡 s507d-water：修本轮门禁新回归

主会话自动门禁（F:/dnd/logs/sessions/s507c-water.gate.md / .gate.tsv，s5a 基线对照）在你上一会话改动后抓到**新回归**：
- tests/m3-consistency-integration.test.mjs 7/1
多半与本会话发布的正式内容（world/ 数据）有关：发布类测试校验已发布内容的完整性/版本/绑定（如 law 绑定、依赖村落、物种表），新增内容可能需要随审批管线同步更新相应清单或基线文件——走审批管线与发布脚本的正规流程更新，不得手改 dist/，不得放宽断言。performance 若只是负载导致的耗时超标（基线同项在门禁里是负载下测的），单独空闲复测并写明。
不要自己跑慢档测试；交卡后自动门禁会重跑。汇报 ≤250 字（UTF-8，F:/dnd/logs/sessions/s507d-water.final.md）：每个回归根因一句、改动文件、pass/fail。
