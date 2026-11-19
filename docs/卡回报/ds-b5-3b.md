# 5-3b 回报（Claude Sonnet 5.5 中档写；11-19）

## 交卷前自查

| # | 问题 | 是/否 | 证据 |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 卷十八 R18-1.5 :521（"同意事件的编号记在 `terms.consentAct`（E-REL-CONSENT）"）；卷十八 :298（E-REL-CONSENT）；卷十八 :208 成婚/缔结行（actor、targets 为当事人）；卷二十四 表 A :126 起（actor、targets 为最小字段）；卷九 §4.2.1 :630–:633；李白裁定-1117.md :1134 起 03:20 裁定 1–5 |
| 2 | 没有按 id/名字/场景写特例 | 是 | 判定只读种类行 `concluded` 与同意事件的 actor/targets，不看种类名、id |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | tests/kernel/holdings.test.mjs：consentAct 缺省、查不到（全 0 的十六进制、代号形）、数字/文字形均拒；primitives-runtime.test.mjs：terms 为 null/字符串/数组、consentAct 为 7/空串均 E-ACT-PRIMITIVE |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 份额 0.5/0.25/0.25 按 shareSum=1 手算；同意事件在测试里先造 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | — |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是 | 代码与测试 +157/−13 行（不含两卷正文与快照）；唯一卡外文件 server-plugin/kernel/events.mjs 加 `findEvent`（+10 行，读同意事件必需的普通接口，AGENTS.md 已授权，见偏离 1 之后） |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs`：tests 669 pass 669 fail 0；`node tools/accept/run.mjs pre_commit`：verdict pass |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | 玩家买卖产权、入股时，同意能从动作契约一路到内核写者，多人入股缺一人同意即拒，仍在规则层、不写死 |

## 改了什么
- 卷九 §4.2.1 holding.open/transfer/rescale 三行加可选 `terms.consentAct`，表后加"持有原语的本笔同意"一段；卷十八 R18-1.5 加一句指回；两卷附录各加 1118k28 一行；勘误前快照 `卷九-v2-勘误前-1118k28.md`、`卷十八-v8-勘误前-1118k28.md`；现行快照（卷九-v2、卷十八-v8、卷十八-封卷）已覆盖，cmp 相同；既有历史修订行零改动。
- world/ontology/primitives.json 三行加 `optional: {terms: consentTerms}`；primitives-runtime.mjs 的 CATALOG 同步，新增行字段 `optional` 与类型 `consentTerms`（契约只核形状），transfer/rescale 适配器原样透传 `terms`（open 原本已透传）。
- kernel/holdings.mjs：rescale 新增人时，同意事件（取 EventId 查日志）的 actor+targets 须覆盖全部新增人，否则 E-REL-CONSENT；只改已有人份额不查。
- kernel/events.mjs：加 `findEvent(id)`（组内用）。
- 测试：holdings.test.mjs 新增 6 条、改 1 条（原用假同意编号，改为日志里真事件）；primitives-runtime.test.mjs 新增 1 条。

## 偏离卡文与需要李白知道的
1. **EventId 类型缺陷已顺手修**：内核原把 `terms.consentAct` 当 CODE 文法（字母打头）校，真事件 id 是 64 位十六进制，约 10/16 数字打头，会被误拒。改为 EventId（十六进制或代号形都收，同 events.mjs 载荷校验）。
2. **"经 execute 带了同意能过"做不到**：块 5 没有 emit 适配器，execute 里任何批都走到"写者未上线"。所以 execute 层只测契约形状（形状不合 E-ACT-PRIMITIVE、合的到 E-ACT-WRITER-NOT-READY），"不带被拒、带了能过"由内核 transferHolding 测试守；适配器透传 `terms` 那两行没有测试直接覆盖，挂块 6 接 emit 适配器时补。
3. 【已裁，修改轮已照办】李白 11-19 10:2x：同意事件当事人 = actor（非空时）∪ targets，唯一定义处在卷十八 R18-1.5，卷九只引用；开边、转移的新边两端都核，rescale 只核新增人。内核 `checkConsentCovers` 已整类核对，测试补 transfer 承接者/标的不在内拒、在则过，open 一例。
4. 【已裁】同上，transfer 要核。
5. 勘误里 `holding.open` 表里原本没写 terms，已补。

## 报李白：既要同意又会走协议移交的种类清单
查 world/ontology/dimensions/_vocab.json 的 holding_kind，`concluded` 为真共 7 行：hk_owns(:263)、hk_share(:264)、hk_leases(:265)、hk_citizen_of(:272)、hk_certified(:274)、hk_allied_with(:283)、hk_honored_by(:301)。其中 `succeedBy` 非空或任一格取 ho_succeed（按候补顺序移交、转给后继）的：无。取相近非动作移交格的：hk_owns、hk_share、hk_leases 的 gone 取 ho_estate，hk_leases 的 vacated 取 ho_revert；内核目前只接 close/stay/succeed，其余格按 E-ACT-WRITER-NOT-READY 拒，未加新机制。"被关系条目 consent 指向"的种类未列（关系写者块 7 才建）。

## 部分与挂卡
- 判"须同意"目前只看 `concluded`；"被关系条目 `consent` 指向的种类"一半没落：块 5 关系写者未上线，carriesRel/intimate 种类整笔拒收，走不到；挂卷十八块 7 关系写者卡，不新造。
- execute 层"带了同意能过"、适配器透传 terms 的直接测试：挂块 6 emit 适配器卡。

## 修改轮 2
primitives-runtime.mjs 删掉 keys.mjs 的 isHex64 import（规则层不许 import 非 kernelApi 条目），`consentTerms` 只核 terms 是普通对象；consentAct 的 EventId 校验与覆盖核对只在内核 holdings.mjs。该文件现仅 import ledger.mjs、holdings.mjs 两行。
