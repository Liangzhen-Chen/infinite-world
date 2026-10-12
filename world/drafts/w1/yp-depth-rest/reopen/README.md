# T06 本次授权的离线双人修订

本目录绑定 `user-reopen-20261012-01`，规划标识为 `T06-user-reopen-20261012-01-offline-1`。`controlled-plan.json` 沿用已有受控修订形状，冻结原 foundation、base 和 candidate，并串接最终汤桓修订与旧批次重绑定 proof。`freeze.json` 固定原目录全部历史文件的逐字 hash，`old-records.json` 保存双方完整旧 record，`source-quotes.json` 保存正式原源的逐字段引文。

合入前只读核对发现主线与原任务树的历史文件存在LF/CRLF差异。`freeze.json.checkoutEvidence` 保存两处实际读到的字节hash，登记前逐文件确认差异仅为换行；检查只接受这两个固定hash，不在运行时规范化或扩展来源白名单。原源JSON内容hash继续沿公共工具的 `hashContent`，没有修改任何公共源码或主线文件。

`patch-diff.json` 记录五个 old→new：双方 `memorySeeds[2]`，以及裘砚 `knowledge.unknown[0]`、`relationships[1].note`、`opinions.neighbors[1].view`。新事件只写原源登记的认识和同村日常往来，不设当面相认或货签共同经历；交谈前询问时间保持待问，未发生且未承诺。原记忆、其他28人的候选和双方正确兄弟叶保持原值；29份旧通过记录均原样保留，裘砚的旧通过只对应旧事件，修后两人均未获真实L2或L4批准。

`design.mjs` 在原候选上应用逐叶差异，`candidate-after.json` 保存完整30人修后候选，原设计与原候选文件没有改写。离线证明在 `offline-report.json`：L1及T04榆坡缺口为零，双方共享事件地点/知情者/正文一致，原记忆保留。此证明不代表真实人物审核或正式发布预演通过。当前 `npc-depth-review` 对本卡受控修订实际返回 `T06继续冻结`，旧汤桓还存在已用 `reviewRecovery`；这些 guard 未删除，T49尚未集成。

只读检查命令在工作目录 `F:/dnd-wt/T06` 执行，检查不会进入模型或预算入口：

```powershell
node world/drafts/w1/yp-depth-rest/reopen/prepare-offline.mjs --check
```

以下是当前公共 CLI 可解析的完整输入，已知被冻结 guard 阻断。本阶段没有执行真实请求；T49定版后须先登记该固定授权及这份计划的 hash，并依其真实接口补齐显式重开参数，再授模型槽执行。不能把下列旧接口命令视为已获得新轮运行授权，也不能删除旧复审字段来让它运行。

```powershell
node tools/npc-depth-review.mjs --id npc_yp_tanghuan --design world/drafts/w1/yp-depth-rest/reopen/design.mjs --root world/drafts/w1/yp-depth-rest --budget-root F:/dnd/world/drafts/m4-object --card T06 --controlled-revision world/drafts/w1/yp-depth-rest/reopen/controlled-plan.json --authorization-hash 683e66df84290477d4bfe63814e14e1476c2aa0eed19461db6aa2435a2cb75fc --source-evidence world/drafts/w1/yp-depth-rest/reopen/source-evidence.json
node tools/npc-depth-review.mjs --id npc_yp_qiuyan --design world/drafts/w1/yp-depth-rest/reopen/design.mjs --root world/drafts/w1/yp-depth-rest --budget-root F:/dnd/world/drafts/m4-object --card T06 --controlled-revision world/drafts/w1/yp-depth-rest/reopen/controlled-plan.json --authorization-hash 683e66df84290477d4bfe63814e14e1476c2aa0eed19461db6aa2435a2cb75fc --source-evidence world/drafts/w1/yp-depth-rest/reopen/source-evidence.json
```

先审汤桓，完整请求上界适配且协议/来源通过后再审裘砚；两人的新L2通过后仍须重新实际阅读受影响批的flag与随机5并登记新L4。原卡spent为1.82866384元，未知reserved为0.083736元；新累计上限2.5元，最多可再用0.58760016元，首ID限0.50元，均仅是后续预算参考。本期没有改allocation、预算或锁，没有正式写入、部署或动原存档。

第一次相关测试完整原文保存在 `related-first-failure.json` 的 `outputRaw`，保留原输出空行与空格。批发布旧夹具没有向T46入口提供确定候选与可核验预留费率，发出请求前即停止；夹具已提供冻结patchDraft、完整请求费率和零实际费用，生产预算/审核规则未变。修复后原文见 `related-rerun-results.txt`，换行证据及完整旧record核验后的相关原文见 `related-final-results.txt`，提交前CORE原文见 `core-results.txt`。
