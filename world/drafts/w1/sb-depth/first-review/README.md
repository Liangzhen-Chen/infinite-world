本目录保存 T09 的独立首审来源与官方 prepare 产物。15 次共同背景全部是本次新设计的过去交流，原人物关系或利益冲突只用于核对相容性，不能证明这次共同在场与发言。

前 5 次引用已发布且 public=true 的桑坂地方问题。后 10 次没有相同的已发布公共问题，引用原人物的短期关切并明确 private，公开说话仅限 sourceRefs.publicSpeech 的范围；末 4 次只是公共路相互招呼，不处理原工作问题。每个网络为两名共同记忆参与者加一名相关成年同户住户，第三人不是见证者，不进入 knownBy，也不新增记忆。

所有原字段采用独立 hash；双方视角、具体地点、共享事实和待定结果分别冻结。所有实际参与者的 secrets 与 authoredFacts.privateFact 都列为审核风险，风险内容仅供 L2/L4 比对，不能扩入另一人的已知事实。未调用模型、未新建或写入预算，未生成正式 L2/L4 批准记录。

出处脚本为上一级 `author-background.mjs`，沿 T25 的正式 API 验证。官方命令为 `node tools/npc-depth.mjs --design world/design/w1-sb-depth.mjs --root world/drafts/w1/sb-depth/first-review --authored-background world/drafts/w1/sb-depth/first-review/authored-background.json --card T09 --prepare`。上一级所有冻结候选与原作者材料保持不变。

首轮公共验证器把事件 ID `memory_sb_depth_shared_1` 误匹配为 `_10` 至 `_15` 的子串，失败原文及 12 个误报叶保存在 `source-validation-failure-v1.json`。每个单事件纯来源检查通过不能替代官方全批验证；修复公共判断后的实际结果由 `source-validation.json` 和 prepare 留证，原失败记录保留。

2026-10-12 的零模型官方请求预检保存于 `request-preflight.json`，full/compact 各 30 份人物请求文件中分别包含 draft 与 L2 的完整待发正文及 UTF-8 指纹。`../request-preflight.mjs` 在系统临时目录复制冻结世界与首审文件，以已耗尽的隔离测试账运行官方 `runDepth → runContentPipeline`；每个 draft 在预算检查处停止。L2 以原候选经官方 builder 和 T45 附件转换构造，再单独检验 pipeline 的请求预算交接；没有伪造 draft 响应，也没有实际 L2 审查。隔离流程全部 pending，generate 调用和费用预留均为零；不把临时流程的记录写回本目录。

原请求缺少 12 处外部人物代词的 sex 值；draft 的 context 还缺 4 处本人代词所需性别，虽然 L2 的 before 已有本人 sex。现由 `source-evidence-map.json` 显式登记 11 份 `source-supplements/` 附件，覆盖这 16 处引用。附件只含本人 id/name、确需的本人 sex 与必要他人的 id/name/sex，每个原值由 prepareDepth 的冻结 reference 严格匹配。L2 的本人 notes、workplace 和家属关系已在 before，相关住户关切已在 people.concern；这些字段无需追加。附件只供审核，不扩大 NPC 知识、私密字段或场所权限；原基础文件、候选、manifest、172 处原来源字段 hash 和 60 处私密风险均保持。

按本地 DeepSeek 客户端最高费率常量，输入每百万 UTF-8 字节 2 元、完整输出上限每百万 token 8 元，30 人首轮 draft 加 L2 的预留上界合计为 compact 11.497666 元、full 13.315548 元，其中 draft 合计 3.700114 元。原卡 3 元不能覆盖这组预检上界；共享账快照 spent=10.81767864、reserved=0.083736、wave=20，可用上界 9.09858536 元，同样不足覆盖两种格式的合计。此处计算是逐请求预留上界的合计，实际串行结算费用未知，未计重修和后续模型调用，不代表本次已预留或花费。

缺失原性别已补齐，373 个待审叶、15 个独立事件及其风险路径保留完整覆盖合同；合同夹具只是验证输出格式，不能批准事实。真实模型槽仍未授权，公共 pipeline 在 review 预算阻断后仍可能付费 draft 的问题待修，本阶段不启动真实起草、审核或发布。后续获授权时须使用原 T09 和固定共享 budgetRoot `F:/dnd/world/drafts/m4-object`，重新核对持久费用与授权，不能以临时测试账领取额度。
