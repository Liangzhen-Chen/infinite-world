# FXE3 交接

状态：已完成本卡可执行修复及验收，七个目标测试文件全过；A3 北林边已审站点按卡片允许的报告路径交主会话安排补审，本卡并未全绿。本会话未调用付费审批，未改回执。

## 根因与处理

基线为 t-fxe3 / s5a@2032b5e6，追溯合并点 6b704e70。不是统一的 params 形状不兼容：正式世界 loadWorld 和 validateWorld(release) 均成功，prepareNpcPublication 正式世界预演也成功。发现三个责任不同的根因：

1. **已审内容漂移**：world/geo/locations.json:381、391、402–403 在 loc_hw_northwood.site 内加入两种草药和两条再生规则。world/design/a3-content-approval-content.mjs:18 起按正式原始文件构建整个 site 审批条目；其 :178 起的 L2 上下文也加入两种物品。tools/content-pipeline.mjs:229 正确拒绝旧指纹。不得更新旧指纹掩盖未审改动。
2. **隔离夹具丢失参数依赖**：六处仅复制 meta/people/geo/lore 的夹具保留了带 gather.density 的新资源，却没有 world/rules/tables/balance/yields.json:6–7。server-plugin/sites.mjs:154–155 严格要求引用四个有效季节密度值，因此发布校验失败；tools/m2-people-publish.mjs:88 只是统一校验的调用点。补齐 rules/，包括规则程序，使加载器按现有归档机制保留 primitiveTables。未放宽校验或断言。
3. **订阅者枚举锚点过时**：server-plugin/environment.mjs:59 新增 weather_exposure，order=5。手算顺序为 transition_hooks(0) → weather_exposure(5) → monster_society(10)，后续顺序保持不变。world-events 严格列表补入该项。

| 测试文件 | 失败原因 / 根因 | 处理 | 最终结果 |
|---|---|---|---|
| a3-content-approval | 北林边整个 site 与已审指纹不符 | 保留拦截，列入下述补审范围 | 2 pass / 1 fail；待补审 |
| m4-publication | 隔离发布目录缺密度表 | 夹具复制 rules/ | 5 pass / 0 fail |
| monster-society-content | 所含 T162 隔离发布目录缺密度表 | 修改 monster-society-content-t162.mjs 的复制范围 | 最终整文件33 pass / 0 fail |
| npc-publication-increments | 隔离人物发布缺密度表 | 夹具复制 rules/ | 8 pass / 0 fail |
| npc-traits-publication | 隔离特征发布缺密度表 | 夹具复制 rules/ | 4 pass / 0 fail |
| w1-villages-publish | 隔离四村发布缺密度表 | 夹具复制 rules/，历史投影仍覆盖原规则主文件 | 6 pass / 0 fail |
| w5-content | 无 lore 的旧世界夹具带新资源而缺密度表 | 保持无 lore，补齐 rules/ | 5 pass / 0 fail |
| world-events | 严格订阅者列表漏 E3 新成员 | 在 order=0 与 order=10 之间补 weather_exposure | 8 pass / 0 fail |

## 需要主会话决定的补审

按卡片允许的报告路径，补审 **world/drafts/a3-content-approval/patch_loc_hw_northwood_site.json 对应的一个条目 patch_loc_hw_northwood_site**：

- site.resources 新增 nw_plantain、nw_honeysuckle：物品、库存20、采集120分钟、技能、季节、密度引用、待标定来源。
- site.changes 新增 nw_plantain_regrow、nw_honeysuckle_regrow：每20日再生1、上限20、各自资源引用和待标定来源。
- 该条目的 L2 publishedFacts.items 新增 item_plantain 与 item_honeysuckle 的 id/name/use 引用事实。
- 经现有 L1/L2/L4 管线重审此条目及其所属批次；summary/batch/人工阅读凭据只能由管线更新，不能直接改哈希。

本会话选择卡片明确允许的“报告待补审条目”，没有另造资源合并层，也没有撤掉玩家已有的分种资源。主会话完成审批后应单独复跑 a3-content-approval。本卡不保证此项已过。

## 验收

所有测试一文件一 node 进程，串行运行；TEMP/TMP=F:/dnd-tmp。仅读取摘要，失败需要时仅取最后30行。Windows 沙箱 Unicode 摘要显示不稳定，因此批次使用 TAP reporter，过滤 ^not ok 与 # pass/# fail，未读取完整输出。

标准命令为 `node --test --test-isolation=none --test-reporter=tap tests/<文件>.test.mjs`，PowerShell 管道仅保留 `^# (pass|fail)|^not ok` 的前40条摘要。M4 与魔物社会首轮在夹具修改前已载入代码，因此修改后分别完整重跑，最终结果以上表为准；其余通过证据均对应最终文件。T162 修改的七个用例随 monster-society-content 整文件一起运行，未跳过任何用例。最终长测33/0，正常退出；本会话未终止任何进程。

- 动作目录：已运行 node tools/export-actions.mjs，docs/actions.json 内容无差异。
- CORE：engine 22/0、storage 14/0、plugin 7/0，全部通过。
- 同步四件套：actions-catalog 4/0、action-registry 7/0、advance-registry 5/0、arch-metrics 4/0，全部通过；未设 UPDATE_ADVANCE_GOLDEN，金快照无变动。
- a3-world-approval：5 pass / 2 fail，卡片已注明属于 E8。单独跑 fix3-world 失败用例的最后30行定位为 tools/content-pipeline.mjs:229 拒绝 shop_hw_forge_mining_pick 指纹。此文件及其生产依赖本卡均未修改，未修 E8 范围。
- 共同规则四项 invariants：i01-conservation 2/0、i02-non-negative 3/0、i15-single-account 2/0、i16-event-primary-write 2/0，全部通过。

## 边界与剩余

改动仅七个测试文件，每处均有依据注释；无断言删除或放宽。生产代码、世界数据、数值及归档定义均未修改，所以没有本卡引入的金快照或 numeric-digest 差异；numeric-digest 未额外运行。未触及 docs/架构设计/、world/design/、dist/、docs/待办.md、docs/问题.md。不读 secrets、不部署、不动原存档、不执行 git 写操作、不结束进程。开工已有未跟踪 .base 保留。

尚未提交，由主会话代提交。本会话没有创建临时调试文件。
