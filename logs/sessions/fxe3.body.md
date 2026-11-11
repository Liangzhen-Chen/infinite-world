# 卡 FXE3：W8-E3 引入的内容审批/发布类回归（8 个测试）

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读）。工作树 F:/dnd-wt/FXE3，分支 t-fxe3，基于 s5a@2032b5e6。

## 背景（主会话沿 s5a 合并点二分）
以下 8 个测试在 master 全过，在 s5a 失败；首个失败合并点都是 **6b704e70**（merge t-w8e3-consumers：休息回血按伤情闭式、淋湿暴露、统一耕作面积事实 field.cultivation、车前/金银花分种，以及 world/rules/tables/balance/yields.json 新增参数）：
a3-content-approval、m4-publication、monster-society-content、npc-publication-increments、npc-traits-publication、w1-villages-publish、w5-content、world-events。
失败位置多落在 tools/content-pipeline.mjs:229、tools/m2-people-publish.mjs:88、tools/publish-*.mjs（发布前校验/骨架与引用事实比对）。用 `git diff 6b704e70^1 6b704e70 --stat` 看那次合并改了什么。

## 要做
1. 找出共同根因（文件:行），说明为什么 E3 的改动让这些发布/审批检查失败。
2. 按根因修：
   - 若是 E3 改了已发布/已审内容（world/design、已审骨架）而未走审批管线 → 不得手改 dist/ 或已审 world/design；应让新规则数据作为新增参数/事实独立于已审骨架，或在报告中写明需要经审批管线补审哪些条目（主会话决定是否花钱跑管线）。
   - 若是校验器/发布工具对新参数形状不认（例如 params 新增字段、新的 fact）→ 修消费端，使新形状被正确识别，不放宽校验。
   - 若是测试夹具依赖旧数据的计数/哈希 → 按新数据手算更新锚点并写依据，断言保持严格。
3. 不删测试、不放宽断言、不改已发布内容绕过检查。

## 验收
上述 8 个文件逐文件全过；CORE 三件、同步四件套；另跑 a3-world-approval（它属于另一组 E8，若因你的修复改变要说明）。汇报一张表：每个测试的失败原因、根因、处理。
