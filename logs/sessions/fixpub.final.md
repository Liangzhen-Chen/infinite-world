# FIXPUB 交接（2026-10-31）

人物档案与四村的合法重发已恢复：K10b 已审关系、现有钱物和后来记忆都保留；未经审批的改动继续拒绝。正式世界内容未改，无需新增付费 L2。

## 根因与首败对照

- W8E3 合并 `6b704e70` 前后的 `world/people/baseline.json` 完全相同；它到 K10b 父提交的人物数据也完全相同，没有人物关系变更。隔离还原该提交后，原版 `tests/w1-villages-publish.test.mjs` 为 5 过 / 1 败，失败是临时发布世界没有复制 `world/rules`，新药草 `nw_plantain` / `nw_honeysuckle` 在 engine 校验时报“须引用四季密度表”。两项深度人物重发用例在该提交上通过。父提交同文件 6 过 / 0 败。现树 `tests/w1-villages-publish.test.mjs:30` 已由 FXE3 (`2b2f66df`) 加入规则目录复制；这处不需要再修。W8E3 直接改动北林已审 site 的另一个审批缺口也已有 APR (`63a58bba`) 重审，本卡复用其证据，没有新付费调用。
- K10b 合并 `f5edba19` 的人物语义 diff 只有陆青、沈渡的 `relationships`：各由 3 条增为 4 条，新增对陈柏的“公事报修”，信任/好感均为 0。位置为 `world/people/baseline.json:9512`、`:11385`。这两条已经在 `world/drafts/k10b-public-maintenance` 的原七条候选中走完审批与发布，不能当作手改未审内容删除。
- 在隔离还原的 `f5edba19` 上，原版人物发布测试加载即失败，错误为 `npc_hw_luqing/relationships[3]`（`tools/m2-people-publish.mjs:86`）。只换回该提交父版本的 baseline 后，顶层冲突消失。旧 `tools/publish-npc-depth.mjs` 的整人 before/after 比较与 `tools/npc-depth-publication-sources.mjs` 的快照比较没有接入后续 K10b 审批证据，导致合法后续版本被当作过期原档。

## 修法与边界

- `tools/npc-publication-sources.mjs:13`：复用 `readApprovedContent` 核验 K10b 七条候选、来源指纹、L2 状态/正文和 L4，并按原 `isPublished` 合同核对七条正式发布值；只为当前世界已采用的精确 `relationships.after` 返回来源。未采用提案的旧世界不依赖其审核状态。
- `tools/publish-npc-depth.mjs:29`、`:95`：冻结人物匹配及重放结果先组合精确已审关系，保留所有其他字段与原有钱物、记忆尾段和并发保护。
- `tools/npc-depth-publication-sources.mjs:28`：收据中的后版本使用同一已审组合；原版本与进程内凭证绑定保持原合同。
- `tests/npc-profile-publication.test.mjs`：加强关系保留断言，补测第四条关系信任 0→1、关系数量 4→5、缺失学堂产权造成半发布、审批 before 被改、撤销 L4、审批来源缺失的拒绝，并验证未采用后续提案的旧版本不被阻塞。临时世界增加 K10b 原审批材料，理由是当前世界已包含该批关系。没有删测试或放宽原断言。
- 必要扩展 `tests/w5-content.test.mjs:70`：内容验收发现旧版夹具清空 `shops.stores` 后仍保留 FXE8 新增的 `shops.additionalRestock.shop_hw_forge`，触发 `server-plugin/shop.mjs:343` 的未知店铺拒绝；`.base` 同为 4 过 / 1 败。缺省 lore 的旧版本来没有这些商店，故在同一投影处也清空增补货架映射，原校验及断言均保留；修后整文件 5 过 / 0 败。没有改店铺运行时或正式货架内容。

世界数据、W1 骨架、架构设计、dist、待办、问题均未修改。未提交、未部署、未读取 secrets；未新增模块或审批清单。无需主会话付费 L2。

## 验收

- 最终完整实现：人物发布文件 11 过 / 0 败（61 秒），四村发布文件 6 过 / 0 败（130 秒）；两文件在加入七条完整发布保护后均已整文件重跑。
- `node tools/export-actions.mjs` 已重导；动作目录内容无差异，已保留原 CRLF。
- CORE 三文件、同步四件套均通过；推进金快照没有重生成或变化。
- 最终重算 `affected-tests2 . 8c4215c2 WORKTREE 0`：46 文件（新增 W5 夹具修正）；再加入所有文件名匹配 content / approval / publication / publish / world 的 31 文件，去重仍共 72 文件。无 gate-skips 命中的文件。每个文件均使用独立 node --test --test-isolation=none --test-reporter=tap 进程，只读取过滤摘要。
- 受影响清单 **46 文件：38 通过、7 与 .base 同败、1 长测未完成**。内容/发布类 **31 文件：30 通过、1 子进程受限**（npc-depth-batch-publication）。总集合 **72 文件：64 通过、7 与 .base 同败、1 长测未完成**。
- 逐文件结果：`F:/dnd/logs/sessions/fixpub.tests.tsv`；基线结果：`fixpub.base-tests.tsv`；最终自动清单：`fixpub.affected-tests.txt`。基线是本卡未修改的 world/server/extension/schema 数据与代码副本，三个修改的 tools 模块从主会话提供的 `.base-src` 恢复，测试恢复原版。
- 本卡没有运行时、数值或世界数据改动；未另跑 numeric-digest。

本树与 `.base` 的逐文件对照如下（数值为用例通过/失败；每文件一进程）：

| 文件 | 本树 | .base | 原因/接续 |
|---|---:|---:|---|
| tests/invariants/i31-total-order.test.mjs | 17/1 | 17/1 | 10 天整步与逐日状态不等价，见下文 |
| tests/npc-depth-authored-background.test.mjs | 17/6 | 17/6 | L4 CLI 子进程 spawn EPERM |
| tests/npc-depth-batch-publication.test.mjs | 0/10 | 0/10 | 公共 fixture 的 L4 CLI 子进程 spawn EPERM |
| tests/npc-depth-lq.test.mjs | 25/3 | 25/3 | prepare CLI 子进程 spawn EPERM |
| tests/npc-depth-pipeline.test.mjs | 9/6 | 9/6 | prepare/发布 CLI 子进程 spawn EPERM |
| tests/npc-depth-sb.test.mjs | 17/2 | 17/2 | prepare CLI 子进程 spawn EPERM |
| tests/overfit-guard.test.mjs | 2/2 | 2/2 | git 子进程未启动，status=null，断言要求可读取 master |
| tests/s5-playthrough.test.mjs | 40 分 16 秒未完成 | 按长测规则未重复 | 主会话外跑；未计通过 |
| tests/w5-content.test.mjs | 5/0 | 4/1 | 已修旧版商店投影，全部原断言保留 |

I31 的失败为 `tests/invariants/i31-total-order.test.mjs:334` 的 `tenDoc.state` / `oneDoc.state` 深比较（一次 10 天与逐日推进），末段涉及采矿工资违约的关系证据。整文件本树与基线均为 17/1，单独运行该用例亦失败；面包竞争用例单跑通过，不将本问题误归因给该场景。本卡未改推进调用路径。

五个人物 CLI 文件均按单失败末 30 行确认了 `spawn EPERM`；overfit 的实际错误为无法读取 master 目录（git 子进程 status=null）。主会话需在沙箱外逐文件补跑这六个文件及 S5 试玩，并承接 I31 基线遗留。

本会话 S5 试玩 Node PID **50764**、启动时间 **2026-10-31 10:28:50** 已在运行期间记录。到 40 分钟仍无最终摘要后，复核 PID、Node 类型及同一启动时间，仅停止此进程，实测 2416 秒；串行脚本随后完成其余文件。没有按名称或批量结束任何进程。

临时历史树、基线副本、调试脚本与被停止进程的临时目录均已清理；`.base`、`.base-index`、`.base-src` 是主会话预置材料，保留。最终仅五个发布/内容核验相关文件有改动，禁区无改动。未提交，由主会话代提交。
