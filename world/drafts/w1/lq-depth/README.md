T08 当前处于作者预检和离线 prepare 阶段。L2、L4、T11 发布均未运行。

`89546d6` 的原 base、audit、candidate、foundation、manifest 和离线报告继续保留在本目录。原 design 全文另存于 `offline-v1-evidence/design.mjs.txt`，完整字节 SHA-256 与 JSON 内容 hash 记在 `offline-v1-evidence/original-hashes.json`。字节 hash 固定原始 LF 快照；Git 将检出文件换为 CRLF 时，核验先恢复原 LF 字节，原 hash 不变。原 manifest 是旧证据，当前 design 已修订，不能用旧 manifest 发布。

当前候选使用 `author-v2/`。18 处实际文字变化均在 `author-v2/author-source-checklist.json` 逐 id/path 对照原目标或正式家属 currentConcern；30 人的 384 个叶子分别记录来源类别。家属名册实际为 row[6] traits、row[7] concern，正式来源记录保留当前字段原值。

六次五人会面是作者新增公共背景，旧来源只支持人物身份、劳动困境和个人经历。清单没有把这些会面当作旧共同亲历，也没有给出 L2/L4 通过凭证。独立背景必须等 T25 接口显式 opt-in 后再审核；家属意见不自动成为其他人物已知，原秘密和旧记忆保持不变。

本轮模型调用和新增模型费用均为 0，没有登记新 allocation 或改写共享预算。后续继续使用稳定编号 T08，增量上限 3 元、W1 共享上限 20 元；改目录和 revision 不增加额度。

离线命令：

```powershell
node world/drafts/w1/lq-depth/author-precheck.mjs
node tools/npc-depth.mjs --design world/design/w1-lq-depth.mjs --root world/drafts/w1/lq-depth/author-v2 --budget-root F:/dnd/world/drafts/m4-object --card T08 --prepare
node --test tests/npc-depth-lq.test.mjs tests/npc-depth-sources.test.mjs tests/npc-publication-increments.test.mjs
node --test tests/engine.test.mjs tests/storage.test.mjs tests/plugin.test.mjs
```
