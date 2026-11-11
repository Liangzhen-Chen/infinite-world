# 卡 FXE8：W8-E8 引入的回归（5 个测试）

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读）。工作树 F:/dnd-wt/FXE8，分支 t-fxe8，基于 s5a@2032b5e6。

## 背景（主会话沿 s5a 合并点二分）
以下 5 个测试在 master 全过，在 s5a 失败；首个失败合并点都是 **804996a6**（merge t-w8e8-premises：田租依据 fieldRentBasis 与延期租、铁镰进货、public_property 职权与 seatPowers、业主自修 building-maintenance、设施损耗改五年参考寿命、日常采购双方在场快照等）：
a3-world-approval、bounty、entity-world、m5-authority-content、quest-sources（3 项）。
失败位置：a3-world-approval:68 与 tools/content-pipeline.mjs:229（shop_hw_forge_mining_pick 发布骨架/引用事实不匹配）、bounty:37 附近、entity-world:48、m5-authority-content、quest-sources:47/83/126。用 `git diff 804996a6^1 804996a6 --stat` 看那次合并改了什么。

## 要做
1. 逐个找根因（文件:行），归类：已批准的规律变化（如铁镰进货、损耗口径、seatPowers）导致锚点变化 / 真实回归（规律错误、守恒破坏、权限错误）/ 内容审批数据对不上。
2. 按类处理：
   - 已批准规律变化 → 手算新值、更新严格锚点并注明依据；
   - 真实回归 → 修代码，不动断言；
   - 已审内容对不上（如 forge 进货行与已审骨架）→ 不手改 dist/ 或已审 world/design；修数据接点使新增行独立于已审骨架，或写明需经审批管线补审的条目，由主会话决定。
3. 不删测试、不放宽断言。

## 验收
上述 5 个文件逐文件全过；CORE 三件、同步四件套；w8e8-premises、building-maintenance、s5-law-maintenance、s5-law-public-maintenance 不退化。汇报一张表：每处失败的原因、性质、处理。
