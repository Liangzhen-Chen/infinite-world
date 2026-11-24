共 14 条，甲 0 乙 13 丙 1，有理由 2 无理由 12。

本卡读了：卷二十九 :114-195、:260-305、:410-477、:525-596、:765-808；卷二按 Grep 定位读了 :936-947、:960-1013、:1069-1098、:1292-1313（:936-1330 未逐行通读，只读 outputGate 行与 §2.9 第 0、1、4、6 条相关段）。代码全文：server-plugin/output-gate/display-load.mjs:1-93、enums.mjs:1-26、envelope-exit.mjs:1-45、mount.mjs:1-42、redact.mjs:1-32、reply-composer.mjs:1-74、select.mjs:1-28、templates.mjs:1-105；佐证另读 kernel/rx.mjs、gate/screen.mjs、textcore/ops.mjs、tests/kernel/output-gate.test.mjs。

### 1 显示档 RX 未建：模板变体的 when 一律加载失败，选择器也不认 slot/mod/broader
- 位置：server-plugin/output-gate/display-load.mjs:56（另 server-plugin/kernel/rx.mjs:325-328、server-plugin/output-gate/select.mjs:21）
- 设计原文：卷二十九 R29-2.16 :572「显示配置加载器把它们交 kernelApi 的 compileRX，按"显示档"编成…rxTree」；§3.1 :426「对每行的已编译 when 调…evaluateRX」
- 代码实际：display-load 对每个非空 when 调 `compileRX(v.when, 'display')`，而 rx.mjs 的 compileRX 只在 profile 为 data 时另有入口，传 'display' 恒抛 E-MOD-RX（rx.mjs:325-328）；evaluateRX 的 run 也只处理 dim/clock/handle 等数据档变体，没有 slot、mod、broader（rx.mjs:381-434），select.mjs 却已按 `{slot: values}` 绑定调用。
- 理由：问题.md:179-180（P-2 显示档未做、compileRX 两参拿不到，已登记）
- 影响：规则缺
- 严重程度：乙
- 合并：无

### 2 显示配置加载器只读白名单三份文件，不读 gram 与 world/display 其余文件
- 位置：server-plugin/output-gate/display-load.mjs:17（测试固化处 tests/kernel/output-gate.test.mjs:197-201）
- 设计原文：卷二十九 §3.1 :428「只读…：world/i18n/locales.json、world/i18n/gram.<显示语言代号>.json、packs/<ns>/i18n/gram.<显示语言代号>.json、world/display/**」
- 代码实际：`WHITELIST` 只有 locales.json、templates.json、config.json 三项；panels/map/assets/epithets 与 gram.* 一律不读，测试还断言 panels.json 写了也不读。
- 理由：无（仅注释自述 :2-3「随面板卡与语言卡」；测试 :197 把缺口写成用例）
- 影响：规则缺
- 严重程度：乙
- 合并：无

### 3 显示配置只核形状，不按代号文法收窄、不查 key 是否在 kind 主键登记、不查 slot.source 是否在输入结构
- 位置：server-plugin/output-gate/display-load.mjs:46（key 只判非空）、:36（source 只判非空）、:44（kind 只判枚举）
- 设计原文：卷二十九 §2.5 :268「key…须是该 kind 的主键登记里的代号…E-TPL-KEY」、:269「source 须落在该 kind 的输入结构里…E-TPL-KEY」；S29-12 :472「加载校验逐值按代号格式核对」
- 代码实际：key 只判 `row.key === null || nonEmpty(row.key)`，source 只判 `nonEmpty(s.source)`；注释 :6 自称"代号文法归 kernelApi narrow 与离线校验"，但仓库里没有对应的离线校验器（Grep tools/ tests/ 只命中 error-codes.mjs 与本测试）。
- 理由：无（仅注释自述 :6）
- 影响：规则缺
- 严重程度：乙
- 合并：无

### 4 模板引擎只做 ref 与 num 两种 fill_kind，其余七种一律把变体作废
- 位置：server-plugin/output-gate/templates.mjs:42-52
- 设计原文：卷二十九 R29-2.4 :560「`qty`、`time`、`dur`、`bearing`、`dist` 各走一条 format 类模板…`list` 逐项渲染…`stored` 经…readSealed 与 unseal…`sub` 渲染一条片段」；§2.1 :150-157 列全 fill_kind
- 代码实际：`fillSlot` 只处理 FILL.ref 与 FILL.num，其余 kind 直接返回 undefined，所在变体作废；注释 :4-5 明写"qty、time、dur、bearing、dist、list、stored、sub…用到它们的变体视为不可填"。
- 理由：无（仅注释自述 :4-5）
- 影响：规则缺
- 严重程度：乙
- 合并：无

### 5 num 槽位只做非负整数、按位成字，不按显示语言行的 digitGroup 分组，也不收定点数
- 位置：server-plugin/output-gate/templates.mjs:50
- 设计原文：卷二十九 R29-2.4 :560「`num` 按显示语言行的数字分组」；§2.1 :149「num＝整数或定点数」；卷二 :904「数字分组时按显示语言行的 digitGroup 用整数除法把值拆成几段，非首段以 minWidth = digitGroup 调用」
- 代码实际：`Number.isSafeInteger(raw) && raw >= 0 ? intDigits(raw, 0)`；不读 digitGroup，负数与小数直接作废变体。
- 理由：无（仅注释自述 :4「不做显示语言行的数字分组、不做负号与定点数」）
- 影响：读数错
- 严重程度：乙
- 合并：无

### 6 模板文本的选择结构未实现，整个变体文本是选择结构即作废；段里混入未知对象还会抛 TypeError
- 位置：server-plugin/output-gate/templates.mjs:55-68
- 设计原文：卷二十九 §2.5 :273-276「一个段列表或一个选择结构…`{slot, by: enum select_by, cases, other}`」；R29-2.5 :561「模板文本的选择结构…挑出一个段列表」
- 代码实际：`assemble` 只认数组段列表与 `{s}` 槽位引用；顶层为选择结构时 `Array.isArray` 为假 → 返回 undefined，变体作废；段列表里出现非 `{s}` 的对象会被 `parts.push(seg)` 交给 concatText，`need()` 对非 Text 抛 TypeError（ops.mjs:19），注释 :55「遇到选择结构或未知段形状即返回 undefined」与实际不符。
- 理由：无（仅注释自述 :5）
- 影响：规则缺
- 严重程度：乙
- 合并：无

### 7 选模板只走"本代号 → 该 kind 兜底"两步，不做 R29-2.2 的上位链
- 位置：server-plugin/output-gate/templates.mjs:83-85
- 设计原文：卷二十九 R29-2.2 :540「先找 key 等于所给代号的模板；没有则沿该代号的上位链逐级找，至多 display.fallbackHops 步；再没有用该 kind 的兜底」
- 代码实际：candidates 只 push `byKey.get(key)` 与 `byKey.get(null)`；`display.fallbackHops` 从未读取。
- 理由：无（仅注释自述 :6「主键上位链需各卷登记，块 6 只走…两步」）
- 影响：规则缺
- 严重程度：乙
- 合并：无

### 8 模板行的 stable 字段从未被读取，标了 stable 的模板仍会因 rotate 换变体
- 位置：server-plugin/output-gate/templates.mjs:80-104（display-load.mjs:59 存了 row.stable，此后无读者）
- 设计原文：卷二十九 §2.5 :271「stable…为真表示同一输入再次渲染须得同一变体（R29-2.3）」；R29-2.3 :559「模板行标了 stable 时，同一件事不论何时、以何种语言再渲染，落在同一个变体上」
- 代码实际：`renderTpl` 只按 priority 与 rotate 选，`row.stable` 全仓无引用；rotate 分支按 ctx.seq 取模，同一输入不同行号会落到不同变体。
- 理由：无
- 影响：规则缺
- 严重程度：乙
- 合并：无

### 9 rotate 轮换的序号取响应行序号，不取事件 id 序号
- 位置：server-plugin/output-gate/reply-composer.mjs:30-33（ctx.seq = lines.length），由 templates.mjs:101 取模
- 设计原文：卷二十九 R29-2.3 :559「按输入里的序号（事件的 id 序号，没有事件的取本次响应的行序号）对并列条数取模来挑」
- 代码实际：compose 里 `ctx.seq = lines.length`，只用行序号；注释明写回执形状没有事件序号字段、内核也没有取 EventId 序号的出口。
- 理由：问题.md:382（回执无 eventSeq，轮换暂用行序号，待卷九/卷二十四定）
- 影响：规则缺
- 严重程度：乙
- 合并：无

### 10 显示闸裁决次数没有经内核 report 写进旁路记录
- 位置：server-plugin/output-gate/reply-composer.mjs:36-39（redact.mjs:30 只返回 verdict）
- 设计原文：卷二十九 R29-7.6 :784「次数经内核的 report 写进旁路记录，只有代号与数值，没有原文」
- 代码实际：redact 返回 `{screened, verdict}`，composer 把 verdict 放进行的 gate 字段，全组没有调用 kernel/report.mjs 的 report；grep output-gate 无 report 调用。
- 理由：无
- 影响：规则缺
- 严重程度：乙
- 合并：无

### 11 渲染固定用语言名单第一种，不读本次请求的 locale
- 位置：server-plugin/output-gate/mount.mjs:31（`const lang = langs[0]`），reply-composer.mjs:26（compose 无 ctx/locale）
- 设计原文：卷二十九 §3.1 :433「显示上下文 ctx：{locale: DisplayLang, wantText, channels, viewer}，前三项来自上行头部」
- 代码实际：装配时取 langs[0] 建 labels 与 redactor，compose 没有 locale 参数，换界面语言不改变输出。
- 理由：无（仅注释自述 mount.mjs:21「请求头 locale 选语言随 6-21」）
- 影响：规则缺
- 严重程度：乙
- 合并：无

### 12 mountOutput 返回 void，不产出 PromptRenderCap
- 位置：server-plugin/output-gate/mount.mjs:26（JSDoc 与实现均 @returns {void}）
- 设计原文：卷二 :1013「`mountOutput` 收下 `ReplyCap` 并返回 `PromptRenderCap`」；卷二十七/卷二块 6 勘误只许"不交给任何人"，未许不返回
- 代码实际：mountOutput 组装并 registerComposer 后没有返回值；块 6 装配拿不到 PromptRenderCap。
- 理由：无
- 影响：规则缺
- 严重程度：乙
- 合并：无

### 13 notice 行以回执的 actionId / resultCode 作模板主键，未从状态容器条目或效果原语取
- 位置：server-plugin/output-gate/reply-composer.mjs:50（`line(KIND.notice, r.actionId, …)`）、:58-60（`${RESULT_KEY_PREFIX}${result.resultCode}` 作 notice 键）
- 设计原文：卷二十九 R29-2.2 表 :545「`notice`｜状态容器条目、效果原语｜条目 → 其族｜回执与已应用效果（卷九 §2.4）」
- 代码实际：notice 的主键直接取回执动作代号 actionId 或 reply_result 枚举值，代码没有从"状态容器条目/效果原语"两类登记里取主键，也没有两者的对应表。
- 理由：无
- 影响：读数错
- 严重程度：乙
- 合并：无

### 14 output-gate 代码里有成片英文自然语言诊断字串
- 位置：server-plugin/output-gate/display-load.mjs:41、:42、:44、:46、:47、:49、:50、:51、:54、:88；envelope-exit.mjs:23、:26、:27、:29、:32；redact.mjs:17；reply-composer.mjs:24；select.mjs:22
- 设计原文：卷二十九 S29-1 :461「其余字符串字面量须是登记过的代号、路径、schema 名…否则计入」；总则 3 :107「运行时代码里没有任何一种自然语言的字面量」
- 代码实际：`fail('E_TPL_KEY', 'bad slot')`、`'payload field outside the whitelist'`、`'when did not evaluate to a boolean'` 等英文短语既非代号也非路径或 schema 名，扫 S29-1 会计入。
- 理由：无
- 影响：只是形式
- 严重程度：丙
- 合并：无

## 已登记未建

- 显示档 RX（compileRX 的 display 档、evaluateRX 的 slot/mod/broader）：问题.md:179-180 登记 P-2 未做，代码按失败交出（不静默当恒真）。
- 事件 id 序号出口：问题.md:382 登记暂用行序号。
- 面板/地图/素材/称呼行与 gram 加载：新底子方案-v0.md:131 写 outputGate 最小版"各做到哪待裁定"，代码注释 :2-3 记为随面板卡与语言卡；未见正式的"块 N 不建"登记，故第 2 条仍按偏离计。

## 拿不准

- envelope-exit.mjs:37 用模板字符串 `` `${payload.responseId}:${n}` `` 把两个整数拼成 screenId。它是信封标识、不是显示文字，卡第③项"其他数字转文字出现在输出路径的"是否覆盖协议标识，卷文没有明说。
- display-load.mjs:32 把任意一份白名单文件的 JSON 解析失败都报 E_TPL_KEY，locales.json 的码是否应为 E-I18N-LOCALE 取决于卷二十九 §2.2（:196-208），不在本卡指定行段内，不判。

## 跨卷待判

- outputGate 的八个文件都用相对路径直接 import kernel 文件（enums.mjs:6 → kernel/handles/markers.mjs、display-load.mjs:10 与 select.mjs:6 → kernel/rx.mjs、mount.mjs:15 → kernel/handles/display-lang.mjs、reply-composer.mjs:9 → kernel/transport/reply-channel.mjs）。卷二 :837 要求 outputGate 对 kernel"只经 kernelApi"，但"kernelApi"在本仓库是数据登记还是 import 门禁，须对照卷二 §2.7/§2.9 第 0 条整表判，本卡只拿到 :936-1330 的片段，不判。
