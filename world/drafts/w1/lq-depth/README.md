T08 当前处于作者预检和离线 prepare 阶段。L2、L4、T11 发布均未运行。

T25 显式出处已在 `author-v2/first-review/` 完成零模型准备。`authored-background.json` 是独立未审的作者背景，六组均引用砾泉已发布的公开地方问题，列明原字段 hash、有限公开说话、未定结果及全部参与者秘密风险。官方纯验证器和 `--authored-background --prepare` 通过只表示合同与冻结关联有效；新背景仍未获 L2/L4 批准。原 author-v2 的全部文件保持不变，首次审核候选也未改文字。

T26 合同预检在 `author-v2/first-review/T26-contract-preflight.json`，实际 full/compact 请求都要求 contradictions、reviewedPaths、backgroundReviews 三字段并精确覆盖全部路径和事件。84 个原出处逐值匹配；本人 sex、workplace、notes 在 skeleton.before 中存在。实际代词引用的另16人 sex 未在原出处投影中，15份最小原值附件保存在 `source-supplements/`，每份仅含本人 id/name 和相关人物 id/name/sex。首次 runContentPipeline 目前不会自动带入它们；最小接入是在 buildReviewRequest 和可选 compactReviewRequest 之后追加这份 user 附件，官方复审的 --source-evidence 已使用该位置。本轮只准备附件，未改公共工具、冻结 source 或 foundation。

首次30人 draft 加 L2 的逐请求保守预留合计是13.601916元；仅精简 L2 后是11.636910元，再附最小 sex 来源是11.647692元。此处以客户端 UTF-8 字节护栏估算，不是实耗，不预占全卡；未来每次请求仍逐条预留和结算，T08增量上限保持3元。本轮实际费用0，附件进入首次真实请求、L2及L4均待执行。

`89546d6` 的原 base、audit、candidate、foundation、manifest 和离线报告继续保留在本目录。原 design 全文另存于 `offline-v1-evidence/design.mjs.txt`，完整字节 SHA-256 与 JSON 内容 hash 记在 `offline-v1-evidence/original-hashes.json`。字节 hash 固定原始 LF 快照；Git 将检出文件换为 CRLF 时，核验先恢复原 LF 字节，原 hash 不变。原 manifest 是旧证据，当前 design 已修订，不能用旧 manifest 发布。

当前候选使用 `author-v2/`。18 处实际文字变化均在 `author-v2/author-source-checklist.json` 逐 id/path 对照原目标或正式家属 currentConcern；30 人的 384 个叶子分别记录来源类别。家属名册实际为 row[6] traits、row[7] concern，正式来源记录保留当前字段原值。

六次五人会面是作者新增公共背景，旧来源只支持人物身份、劳动困境和个人经历。清单没有把这些会面当作旧共同亲历，也没有给出 L2/L4 通过凭证。首次审核已显式 opt-in，旧 author-v2 清单保留当时待 T25 的状态。家属意见不自动成为其他人物已知，原秘密和旧记忆保持不变。

当前首次审核的官方准备命令为：

```powershell
node world/drafts/w1/lq-depth/author-background.mjs
node tools/npc-depth.mjs --design world/design/w1-lq-depth.mjs --root world/drafts/w1/lq-depth/author-v2/first-review --authored-background world/drafts/w1/lq-depth/author-v2/first-review/authored-background.json --budget-root F:/dnd/world/drafts/m4-object --card T08 --prepare
```

本轮模型调用和新增模型费用均为 0，没有登记新 allocation 或改写共享预算。后续继续使用稳定编号 T08，增量上限 3 元、W1 共享上限 20 元；改目录和 revision 不增加额度。

离线命令：

```powershell
node world/drafts/w1/lq-depth/author-precheck.mjs
node tools/npc-depth.mjs --design world/design/w1-lq-depth.mjs --root world/drafts/w1/lq-depth/author-v2 --budget-root F:/dnd/world/drafts/m4-object --card T08 --prepare
node --test tests/npc-depth-lq.test.mjs tests/npc-depth-sources.test.mjs tests/npc-publication-increments.test.mjs
node --test tests/engine.test.mjs tests/storage.test.mjs tests/plugin.test.mjs
```
