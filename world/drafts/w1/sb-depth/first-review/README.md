本目录保存 T09 的独立首审来源与官方 prepare 产物。15 次共同背景全部是本次新设计的过去交流，原人物关系或利益冲突只用于核对相容性，不能证明这次共同在场与发言。

前 5 次引用已发布且 public=true 的桑坂地方问题。后 10 次没有相同的已发布公共问题，引用原人物的短期关切并明确 private，公开说话仅限 sourceRefs.publicSpeech 的范围；末 4 次只是公共路相互招呼，不处理原工作问题。每个网络为两名共同记忆参与者加一名相关成年同户住户，第三人不是见证者，不进入 knownBy，也不新增记忆。

所有原字段采用独立 hash；双方视角、具体地点、共享事实和待定结果分别冻结。所有实际参与者的 secrets 与 authoredFacts.privateFact 都列为审核风险，风险内容仅供 L2/L4 比对，不能扩入另一人的已知事实。未调用模型、未新建或写入预算，未生成正式 L2/L4 批准记录。

出处脚本为上一级 `author-background.mjs`，沿 T25 的正式 API 验证。官方命令为 `node tools/npc-depth.mjs --design world/design/w1-sb-depth.mjs --root world/drafts/w1/sb-depth/first-review --authored-background world/drafts/w1/sb-depth/first-review/authored-background.json --card T09 --prepare`。上一级所有冻结候选与原作者材料保持不变。

首轮公共验证器把事件 ID `memory_sb_depth_shared_1` 误匹配为 `_10` 至 `_15` 的子串，失败原文及 12 个误报叶保存在 `source-validation-failure-v1.json`。每个单事件纯来源检查通过不能替代官方全批验证；修复公共判断后的实际结果由 `source-validation.json` 和 prepare 留证，原失败记录保留。
