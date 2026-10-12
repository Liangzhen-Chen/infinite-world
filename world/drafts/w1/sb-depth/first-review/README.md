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
