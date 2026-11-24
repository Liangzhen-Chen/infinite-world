# 5-3b Sonnet 只核（11-19）

被核：分支 ds/b5-3b，提交 019485ce 相对 origin/master 的全部改动（14 个文件，代码与测试约 +157/-13，其余为两卷正文、勘误前快照、现行快照、卡回报）。核者：Claude Sonnet 5.5 中档，不是写者。

## 结论：必须改（1 条）；其余可送终核

## 必须改

### 1. 卷九新段把"同意事件当事人 = actor ∪ targets"写进了卷文（卷九 §4.2.1 :649 新段，及卷九附录 :1770 新行）

- 李白 03:20 裁定 2 原句（李白裁定-1117.md :1134 起的第 2 条）："该同意事件的当事人须覆盖全部新增持有人，缺任一个按 E-REL-CONSENT 拒"。裁定没有说当事人是哪几栏。
- 卷九 :649 新段多写了括号"（表 A 的 `actor` 与 `targets`）"，附录 :1770 又写了一遍。卷十八 :208 成婚行只说 actor、targets 是两位配偶；卷二十四表 A（:126 起）只把 actor、targets 定为最小字段、`event_role` 映射为 actor/target，没有任何一处写"同意事件的当事人 = actor 加 targets"。写者自己在卡回报偏离 3 也承认："卷文没逐字写……是我按卷文推的，请李白核"。
- 这是执行者自补进卷文（派活卡头第二节第 1 条）：读法没裁定就先写成了正式条文，李白若另有读法（例如只认 targets、或加 witnesses/related），卷九已被固化。
- 要求：卷九 :649 与附录 :1770 删去"（表 A 的 `actor` 与 `targets`）"，只照裁定原句写"该同意事件的当事人须覆盖全部新增持有人"；读法留给李白裁定。代码侧 holdings.mjs:434–446（`checkConsentCoversHolders` 里 `new Set([event.actor, ...event.targets])`）可暂保留，但在代码注释和 PLAN 标"读法待李白裁定"，并把该代码注释里"（表 A 的 actor 与 targets）"一句改成"待李白裁定的读法"。卡回报偏离 3 须带给李白。
- 改后需重做：卷九现行快照 cmp = 正文；"勘误前-1118k28"快照不变；附录该行同步改。

## 逐项核对

1. 勘误 1118k28：可。卷九 :630/:632/:633 三行加可选 `terms.consentAct`，`holding.close`（:631）未动；holding.open 行原本没写，同勘误补上，合裁定 1。卷十八 R18-1.5（:521）只多一句指回卷九，无新设计。两个"勘误前-1118k28"快照与 origin/master 正文 `git diff --exit-code` 为零；卷九-v2、卷十八-v8、卷十八-封卷三个现行快照 cmp 正文相同；两卷附录各只加一行（卷九 :1770、卷十八 :1672），-U0 diff 无历史修订行改动；版本号未升。
2. 见"必须改"1。
3. 适配器与目录：可。primitives-runtime.mjs 的 transfer/rescale 适配器只加 `terms: p.terms` 透传，open 原本已透传；契约层 `consentTerms` 只核对象形状与 consentAct 的 EventId/null 形，其余键由内核按种类行 termsKeys 判，不自补不自判，合裁定 3。`optional` 字段名与 `consentTerms` 类型在 CATALOG 与 world/ontology/primitives.json 一致（三行都加、close 不加，测试 primitives-runtime.test.mjs 新增条直接对 DOC 与 CATALOG 比），`specTokens` 同步纳入 `optional`，是目录自洽所必需。
4. rescale 覆盖：基本可。`checkConsentCoversHolders`（holdings.mjs:434–446）事件查不到、或缺任一新增人即 E-REL-CONSENT；只改已有人份额时新增人为空列表直接返回，不要求；与裁定 2 一致。小疑点（不单列必须改）：判断条件只看 `row.concluded === true`，裁定与卷九新段写的是"concluded 为真，或被关系条目 consent 指向的种类"，后半没落。但本块 `carriesRel/intimate` 种类在 holdings.mjs:513–515 整笔拒收 E-ACT-WRITER-NOT-READY（关系写者块 7 才建），后半在块 5 实际走不到，且现有 `checkConsent`（5-3 已封）也是只看 concluded。可送终核判，建议在 PLAN 记"关系条目 consent 一半随块 7 关系写者补"，不在本卡补。
5. `findEvent`（events.mjs +10 行，卡外文件）：必需（同意事件要从日志取当事人，别无读口）；只读、返回日志里的冻结记录或 null、未进 kernelApi、注释写明"kernel 组内用"，可。consentAct 由代号校验改 EventId 校验：有依据，卷十八 :461 `consentAct: EventId nullable`，事件 id 是 64 位十六进制可能数字打头，原按 CODE 文法校会误拒真事件；`isEventRef` 仍收代号形，并有数字打头十六进制的转移测试。不属自补设施。
6. 测试：期望值字面量可手算（改份额 npc_b 0.5、npc_a 0.25、org_x 0.25，和为 1；覆盖/只覆盖一人/查不到/只改份额/形状不合各一条；事件在测试里经 `emit` 先造，不造假）。被改的那条原用例（"改份额新增持有人……带本笔同意通过"）原来用假编号 `act_new_consent`，新增覆盖判定后必须换成日志里真事件，属必需同步，不是放宽，断言收紧为 `consentAct: consent`。适配器透传两行没有直接测试覆盖（块 5 无 emit 适配器，execute 只能走到 E-ACT-WRITER-NOT-READY），写者已在偏离 2 如实说明并挂块 6；裁定 5 要求的"缔结类 transfer 不带同意被拒、带了能过"由内核 transferHolding 测试守，既有 5-3 用例已含不带被拒、带了通过，可接受。
7. 全量：`node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` 末行：tests 669 / pass 669 / fail 0（本机重跑，耗时 123 秒；写者回报同数）。

## 其他观察

- 写死、特判、放宽：未见。判定只读种类行 `concluded` 与事件字段，不看 id、名字。
- 卡回报偏离 4（transfer 新持有人是否须在同意事件当事人内，卷文未写，未加）处理得当；终核时请李白一并回答。
- 本核只在上述一处卷文自补上判必须改；改完卷九文字、快照与附录，代码不动即可再送终核。

## 第 2 轮（改后提交 d254ded4；核者同为 Claude Sonnet 5.5 中档）

结论：可封。

依据：李白 11-19 10:2x 裁定（docs/审查/李白裁定-1117.md 末节）①当事人 = actor（非空时）∪ targets，定义放卷十八 R18-1.5，卷九引用；②open/transfer 核两端，rescale 照 03:20；协议移交不加机制只列清单；③consentAct 按 EventId 校。

① 卷文与快照：卷十八 R18-1.5 加"同意事件的当事人（本句是唯一定义处……）= 该事件的 actor（非空时）∪ targets；双方同意要求新边两端都在内，按制度要求 consentBy 读出的同意方都在内"，照裁定原句。卷九新段与附录只写"照卷十八 R18-1.5"，不再重述等式。卷九-v2、卷十八-v8 与卷十八-封卷三个现行快照 cmp 正文相同；两个勘误前快照与 origin/master 正文无差；两卷各仍只有一行 1118k28 附录（本轮只改该行，不新增行），历史修订行未动。
② 代码：`checkConsentCovers` 用于 open（[holder, subject]，holdings.mjs:556）、transfer（[newHolder, 旧边 subject]，:649）、rescale（新增人，:701），事件查不到或缺任一端即 E-REL-CONSENT；判"须同意"仍只看 concluded，已在注释与回报写明关系条目一半挂块 7。新测试手算无误：转移事件 actor npc_b、targets [item_q] 通过；只含旧持有者、只含承接者、全 0 十六进制三种都拒且状态不变；open 持有者与标的都在内通过、只含持有者拒。删除"7 开头十六进制转移测试"属必需同步：hk_owns concluded 为真，7*64 不在日志里，现在必拒。数字打头 EventId 仍有用例守：`'0'.repeat(64)` 在 rescale 与 transfer 测试里拿到的是 E-REL-CONSENT 而非 E-HK-PROTOCOL（若仍按代号文法校会是后者）；契约层 `'7'.repeat(64)` 形状用例在 primitives-runtime.test.mjs:208 保留；真实 emit 事件 id 用例有 64 位十六进制断言。
③ 回报：偏离 3、4 标"已裁"；"报李白"清单列 concluded 为真的 7 个种类，并说明没有 succeedBy 非空或取 ho_succeed 的行，不硬造机制；"部分与挂卡"如实写明关系条目一半挂块 7、execute 层带同意能过与适配器透传测试挂块 6。与代码、测试一致，未夸大。
④ 全量：`node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` 末行 tests 670 / pass 670 / fail 0。

无必须改。
