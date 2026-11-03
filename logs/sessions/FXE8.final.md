# FXE8 交接

工作树：F:/dnd-wt/FXE8；分支 t-fxe8。未执行 Git 写操作、部署或原存档操作。开工已有未跟踪 `.base`，保留。

## 根因与处理

| 原失败位置 | 根因 | 性质 | 处理与依据 |
| --- | --- | --- | --- |
| tests/a3-world-approval.test.mjs:39、world/design/a3-world-approval.mjs:289/321、tools/content-pipeline.mjs:229 | 采矿镐回执的引用事实包括整店进货品类；直接插入铁镰改变历史指纹 | 内容审批数据接点不匹配 | 铁镰原行移入 rules.economy.shops.additionalRestock；shop.mjs 在目录、当前店铺和原校验入口合并。after 保留原进货顺序；历史 stores 保持已审版本，未改审批骨架、回执或通用指纹校验 |
| tests/bounty.test.mjs:50（原行） | 首日铁镰进货将 20 铜从 NPC 钱袋转入公库，原司法资金边界不包含聚落公库 | 批准规律变化，夹具前提遗漏 | 安静司法夹具开局备满注册货架，避免无关进口；所有悬赏、认捐、退回金额与原守恒等式不变 |
| tests/entity-world.test.mjs:48（原行） | 推进全部店铺时铁匠也补铁镰，来源公库额外收入 20 铜 | 批准规律变化，严格锚点过期 | 新增单独铁镰回执断言：1 件、20 铜；原运费/货款拆分保留，公库严格期望加 20 |
| tests/m5-authority-content.test.mjs:14（原行） | M5 原 authorityRules 不含 W8-E8 新批准的 public_property、powerSources、seatPowers、seatPowersSource | 批准规律变化，完整对象锚点过期 | 期望由 M5 原对象加四项精确扩展构成，继续完整 deepEqual；依据 05 §5.7.3 与 804996a6 的规则数据。未改 M5 骨架和历史回执 |
| tests/quest-sources.test.mjs:47（原附近） | 铁镰货款转入公库，旧总额只含钱袋和任务托管，少计 20 | 批准规律变化，守恒边界遗漏 | 将聚落公库计入严格资金合计；本人扣款、托管与总额相等等式均保留 |
| tests/quest-sources.test.mjs:83/93（原附近） | 初始公库 640 加进货收入 20 后，疫病 150、冬荒 200 均能托管，汛情 80 反而被留底拒绝 | 批准规律变化，预算场景前提过期 | 明确起始公库 510；手算 510+20−150−80=300 留底。疫病后 380，冬荒 200 会低于留底而拒绝；原疫病/汛情/冬荒断言保留 |
| tests/quest-sources.test.mjs:126（原行） | 10 日等待包含第 1/8 日两轮铁镰补货，公库收入共 40，退款后不再等于期初公库 | 批准规律变化，严格锚点过期 | 精确断言两条回执 [[1,1,20],[8,1,20]]；退款后公库严格等于期初+40，任务超期、归零托管、退款额与私人退款断言均保留 |

铁镰手算：目录 basePrice=10，固定夹具市场稀缺系数上限 2，一次 1 件，合计 20 铜；第二轮同价，货架达到 2 件上限后停补。未发现本卡所列失败来自规律错误、权限错误或实际账本守恒破坏。

## 变更范围

server-plugin/shop.mjs、world/meta/rules.json，以及 bounty、entity-world、m5-authority-content、quest-sources、shop-restock 五个测试文件。shop 与 shop-restock 是审批问题修复必需接点；新增行复用原校验，不另造审批器。新增覆盖未知店铺、重复货品、无效插入位置；原完整目录断言对齐精确增补行及原顺序。

## 验收

所有测试均为一文件一条 `node --test --test-isolation=none --test-reporter=tap tests/<文件>.test.mjs`，输出仅筛选 `^# (pass|fail)|^not ok` 的前 40 行。TAP 用于避开 PowerShell 对 Unicode 摘要符号的编码损坏；失败定位仅阅读单用例末 30 行。TEMP/TMP 均设 F:/dnd-tmp。

| 文件 | 结果 |
| --- | --- |
| a3-world-approval | pass 7 / fail 0 |
| bounty | pass 5 / fail 0 |
| entity-world | pass 6 / fail 0 |
| m5-authority-content | pass 4 / fail 0 |
| quest-sources | pass 8 / fail 0 |
| shop-restock（新增接点直接相关测试） | pass 7 / fail 0 |
| engine（CORE） | pass 22 / fail 0 |
| storage（CORE） | pass 14 / fail 0 |
| plugin（CORE） | pass 7 / fail 0 |
| actions-catalog | pass 4 / fail 0 |
| action-registry | pass 7 / fail 0 |
| advance-registry | pass 5 / fail 0；原金快照直接匹配 |
| arch-metrics | pass 4 / fail 0 |
| w8e8-premises | pass 16 / fail 0；保留原进货顺序后复核通过 |
| building-maintenance | pass 4 / fail 0 |
| s5-law-maintenance | pass 10 / fail 0 |
| s5-law-public-maintenance | pass 9 / fail 0 |

`node tools/export-actions.mjs` 已重导，docs/actions.json 没有实际 diff。未设置 UPDATE_ADVANCE_GOLDEN，未修改金快照；没有快照字段变化需要提交审核。

numeric-digest 已完成改前/改后对照：以 HEAD 原 shops 数据重建改前有效目录，再运行同一 numeric-digest 场景，与最终代码直接运行对比。full、quiet 两个状态摘要及全部数值函数摘要完全相同（STATE_EQUAL=True、FUNCTIONS_EQUAL=True）。数据分离保留了采购顺序和模拟结果；无需金快照差异表。两个临时对照文件均已删除。

最终验收串行进行；早期定位时曾在 shop-restock 尚未返回完成时启动一次 bounty 复核，短暂存在两个独立测试进程，随后均正常退出。上表最终五文件、shop-restock 与同步四件套证据均来自后续串行运行。未手动结束任何进程。

## 交接边界

不触及 docs/架构设计/、world/design/、dist/、docs/待办.md、docs/问题.md。不删测试、不跳过测试、不放宽断言；每处测试改动的设计依据见上表及就地注释。同步导出的 docs/actions.json 无实际变化；金快照不重生成。未提交，由主会话检查并代提交。PROGRESS/CHANGELOG/当前状态保留主会话所有权，本执行卡只交接详细报告。

最终检查：实际内容 diff 仅限上述七个文件；`git -c core.whitespace=cr-at-eol diff --check` 通过（保留原文件的 CRLF/混合换行）；没有遗留临时调试文件、运行进程或未解决阻碍。本卡所有要求检查均已完成，无 EPERM 待补跑项。docs/actions.json 在 status 中仍显示 M，但 unstaged/cached diff 均为空，另以原始字节确认与 HEAD 完全相同；未通过 Git 写操作刷新索引。
