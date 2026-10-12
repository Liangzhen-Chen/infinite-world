本目录保存 T09 的独立首审来源与官方 prepare 产物。15 次共同背景全部是本次新设计的过去交流，原人物关系或利益冲突只用于核对相容性，不能证明这次共同在场与发言。

前 5 次引用已发布且 public=true 的桑坂地方问题。后 10 次没有相同的已发布公共问题，引用原人物的短期关切并明确 private，公开说话仅限 sourceRefs.publicSpeech 的范围；末 4 次只是公共路相互招呼，不处理原工作问题。每个网络为两名共同记忆参与者加一名相关成年同户住户，第三人不是见证者，不进入 knownBy，也不新增记忆。

所有原字段采用独立 hash；双方视角、具体地点、共享事实和待定结果分别冻结。所有实际参与者的 secrets 与 authoredFacts.privateFact 都列为审核风险，风险内容仅供 L2/L4 比对，不能扩入另一人的已知事实。未调用模型、未新建或写入预算，未生成正式 L2/L4 批准记录。

出处脚本为上一级 `author-background.mjs`，沿 T25 的正式 API 验证。官方命令为 `node tools/npc-depth.mjs --design world/design/w1-sb-depth.mjs --root world/drafts/w1/sb-depth/first-review --authored-background world/drafts/w1/sb-depth/first-review/authored-background.json --card T09 --prepare`。上一级所有冻结候选与原作者材料保持不变。

首轮公共验证器把事件 ID `memory_sb_depth_shared_1` 误匹配为 `_10` 至 `_15` 的子串，失败原文及 12 个误报叶保存在 `source-validation-failure-v1.json`。每个单事件纯来源检查通过不能替代官方全批验证；修复公共判断后的实际结果由 `source-validation.json` 和 prepare 留证，原失败记录保留。

2026-10-12 的 T48 零模型正式请求预检保存于 `request-preflight.json`。full/compact 各 30 份人物请求文件分别包含完整 draft 与 L2 正文及 UTF-8 指纹。`../request-preflight.mjs` 在临时目录复制冻结世界、原候选和持久账历史，以正式 `runDepth → runContentPipeline` 验证耗尽原卡后整队列停止，30 人保留 pending、attempts=0，未产生 provider 响应。

逐 ID 探针在 `runContentPipeline` 的实际接口位置复用 `buildDraftRequest`、`buildDraftRequest.reviewDraftFor`、`buildReviewRequest` 与 T45 来源转换。每个隔离账的单卡余额设为整轮上界少 0.000001 元，仍足够支付 draft；正式入口因为 draft 加必要 L2 整轮不足而拒发，generate 调用为零、账本未变，旧 `estimateCostYuan` 若被调用会硬失败。另在临时账以准确整轮余额通过同一 rates 预算接口原子预留两份已捕获请求，再按未发状态全部退款；该证明只核对成本，不调用 generate 或提供审核结果。临时账的原历史请求、未知预留均保留，隔离记录不写回本目录。

原请求缺少 12 处外部人物代词的 sex 值；draft 的 context 还缺 4 处本人代词所需性别，虽然 L2 的 before 已有本人 sex。现由 `source-evidence-map.json` 显式登记 11 份 `source-supplements/` 附件，覆盖这 16 处引用。附件只含本人 id/name、确需的本人 sex 与必要他人的 id/name/sex，每个原值由 prepareDepth 的冻结 reference 严格匹配。L2 的本人 notes、workplace 和家属关系已在 before，相关住户关切已在 people.concern；这些字段无需追加。附件只供审核，不扩大 NPC 知识、私密字段或场所权限；原基础文件、候选、manifest、172 处原来源字段 hash 和 60 处私密风险均保持。

按本地客户端费率常量，输入每百万 UTF-8 字节 2 元、完整输出上限每百万 token 8 元。full 单人整轮最高 0.495928 元，compact 最高 0.416074 元；原 T09 尚未登记花费或预留，本次快照每人第一轮均在原 3 元余额以内。共享账快照 spent=10.81767864、reserved=0.083736、wave=20，可用上界 9.09858536 元，每人第一轮也均低于该余额。以上仅说明当前单轮准入条件，后续剩余额度取决于实际结算及必要重修，不保证 30 人能全部完成。

30 人首轮上界的描述性合计为 compact 11.497666 元、full 13.315548 元，其中 draft 合计 3.700114 元。合计不作为同时预付要求，也不据此认定原 3 元不能启动；正式执行须逐 ID 原子预留本轮，结算实际费用并退还确定未发部分，再判断下一 ID。未知历史预留不能退款。新增与重开已有用户授权，具体 T09 总额度由 T47 确定，本报告 `authorizedCardLimitYuan` 与逐 ID 的增额余额字段暂为 null；确定额度后应核对总额度减该卡已花和预留是否至少等于该行整轮上界，且同时满足共享账限制。报告可传入该总额度作算术展示，此参数不会改变预算或授予模型槽。

| 人物 ID | full 整轮元 | compact 整轮元 |
| --- | ---: | ---: |
| npc_sb_zhangluo | 0.447212 | 0.388652 |
| npc_sb_yuanqing | 0.495928 | 0.416074 |
| npc_sb_zhonglan | 0.446470 | 0.388362 |
| npc_sb_tianmo | 0.445318 | 0.387638 |
| npc_sb_zhenyun | 0.443114 | 0.385410 |
| npc_sb_gulu | 0.441156 | 0.384016 |
| npc_sb_yexun | 0.444316 | 0.387148 |
| npc_sb_zhuchai | 0.443438 | 0.385944 |
| npc_sb_panyao | 0.441402 | 0.383920 |
| npc_sb_gaoshu | 0.441576 | 0.383988 |
| npc_sb_zhouwei | 0.437276 | 0.378616 |
| npc_sb_congsi | 0.434654 | 0.377274 |
| npc_sb_maoli | 0.433672 | 0.376980 |
| npc_sb_jiean | 0.434610 | 0.377864 |
| npc_sb_baishu | 0.437080 | 0.379450 |
| npc_sb_luwei | 0.435766 | 0.378986 |
| npc_sb_shikui | 0.438838 | 0.381044 |
| npc_sb_kongliu | 0.438664 | 0.380976 |
| npc_sb_feiqing | 0.427820 | 0.374790 |
| npc_sb_shangyun | 0.438184 | 0.379990 |
| npc_sb_chishan | 0.453892 | 0.388668 |
| npc_sb_chayue | 0.452720 | 0.387756 |
| npc_sb_qinwan | 0.445348 | 0.380278 |
| npc_sb_longfu | 0.448018 | 0.382940 |
| npc_sb_zhuxian | 0.447334 | 0.382224 |
| npc_sb_fuyu | 0.443478 | 0.379768 |
| npc_sb_quanli | 0.443714 | 0.379004 |
| npc_sb_yanjue | 0.445770 | 0.380498 |
| npc_sb_xianghe | 0.445436 | 0.379772 |
| npc_sb_diye | 0.443344 | 0.379636 |

373 个待审叶、15 个独立背景、11 份来源附件及原 172 处来源 hash、60 处私密风险保持完整。覆盖合同夹具只验证输出结构，不能批准事实；正式 L2/L4 均未执行，本阶段费用为零。T46 的整轮预算阻断已在当前入口证明，原先“review 阻断后仍可能先付 draft”的阻碍已移除。交回 T09 后仍须取得独占模型槽，并核对原 T09 的持久 allocation 与固定共享 `budgetRoot F:/dnd/world/drafts/m4-object`；临时测试账不能用于真实请求。

2026-10-12 原 T09 已沿固定授权 `user-reopen-20261012-01` 完成整村真实首审，直接复用合法候选进行 L2，未调用模型回显 draft。张洛首 ID 预留上界 0.264032 元、实际费用上界 0.08414424 元，通过完整逐叶和背景风险协议后逐 ID 续审。首轮 30 次实际 L2 为 18 passed、12 manual，费用上界 2.39163488 元；原响应、请求、来源与用量均保留。28 份检出换行凭证复现历史精确字节 hash，JSON 值和所有授权源 hash 未改变；早期字节测试失败原文仍在 `complete-002/preflight-tests.txt`。

针对 12 个实际 hard，补充逐字段匹配原世界的家属关切、亲属关系及必要原人物 notes 等审核附件。原候选及 11 份既有附件未改，补件不写入 NPC 知识；来源指引引用原独立背景的公开说话范围，不能以候选证明事实。沿相同 card、授权 ID 与 manifestHash 再进行 12 次有界 L2，10 人补证复审后通过，池杉与龙芙仍为 manual。池杉最新 hard 位于共享交流的 knowledge.known[2]/memorySeeds[2]；龙芙最新 hard 涉及知识、目标步骤和关系备注等，全部原文见对应记录的 reviewRecovery.response 和 prior。本授权每人两次已用尽，未启动第三次；本期 42 次实际请求全部为 L2，累计费用上界 2.46694448 元，T09 总限 4.5 元、reserved=0，旧未知 0.083736 元保留。

30 人原候选合并视图通过 T04，来源与候选指纹保持；这只证明离线结构。真实 L2 为 28 passed、2 manual，其中 13 个事件、26 人的参与者链完整通过，池杉/查悦与秦婉/龙芙两条事件链未闭合。正规整村 preview 实测拒绝“缺重开L2”，正式 baseline 未写。整村 L4 未批准、波次评分未执行，不能把 28 个 passed 或 26 个闭合 ID 当成整村批准或拆批发布依据；本阶段按停止线交回主会话。最终相关和 CORE 结果在 `complete-002/final-tests.txt`，未跑全量与构建，未操作酒馆或原存档。

新增执行入口为上一级 `complete-002.mjs`；直接 L2 来源/预算预检、首次记录快照、逐 ID 结果与补证计划保存在 `complete-002/`。两轮审核记录位于本目录逐 ID JSON，summary/batch 仍明确保留未批准 L4。清理本期重复预检请求目录的自动审批返回“blocked by policy”，目录保留，未绕过；原 120 份历史请求也完整保留。
