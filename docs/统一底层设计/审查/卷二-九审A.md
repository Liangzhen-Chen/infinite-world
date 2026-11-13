模型：claude-sonnet-5-5，中档（11-13 换 Opus 审查前的旧记录）（主会话 11-13 按运行记录补注）

# 卷二 九审 A（第九版）

审查对象：docs/统一底层设计/卷二-维度表规范与统一入口.md（1749 行；已读 §1.5 命名 struct 登记、§2.7（JSON 示例、import 矩阵、权限表）、§2.8 第 1–4b 条、§3.2、§4.1 校验器路径、附录 D 相关行）。只做静态阅读。新的绕法归卷十二，不计入卷二。

## 总判：有条件通过

八审 Q1–Q4 与 4 条小项全部落实。登记加载器表（4b）把读文件与 JSON 解析收成 5 个登记文件，校验器迁到 kernel/validate，思路正确。但"Text 的唯一通路"按字面走一遍，有一处断路（inputEdge）、一处自相矛盾（Text 构造点）、一处类型空洞（kernel 碰 Text 路径），另有 host 组与 rx 字段两个新缺口。共 5 条真问题。

## 一、八审 Q1–Q4 与小项核对

| 条 | 判定 | 行号证据 |
|---|---|---|
| Q1 运行态修正项带文字 basis | 已解决（有尾巴，见 R5） | §3.2 L569：运行态条目不带字串，`basis` 为 `struct:basis`；§1.5 L190–191 登记 `struct:basis`、`struct:modifier`；§2.7 L447：struct 内不得有 `string` 字段 |
| Q2 加载器与校验器位置 | 已解决 | §4.1 L690：校验器迁到 `server-plugin/kernel/validate/dimensions-validate.mjs`；§2.8 L478–489 4b 登记加载器表（kernel/load、kernel/validate、display 的 load-labels、gate 的 load-blocklist、aiGate 的 parse、tools 离线校验器），表外任何 `JSON.parse`/`fs`/动态 import 即 E-TSC-PARSE（§4.3 L733）；L477 规定 `unknown` 唯一写法与 `narrow` |
| Q3 Text 通路 | 部分解决 | L473、L482–486：kernel 加载器不产出 `Text`，display/gate/aiGate 各有自己的加载器；通路在 inputEdge、Text 构造、kernel 触碰 Text 路径三处没有闭合，见 R1–R3 |
| Q4 struct 文法 | 已解决 | §2.7 L447 文法加 `struct:<名>`；§1.5 L186–195 命名 struct 登记表（basis、modifier、holding、effectCall、statusInstance、nameParts）；D 行 L1531 |
| 小项：六组残留 | 已解决 | L465、L1704 |
| 小项：display↔outputGate 成环 | 已解决 | L438（display 行不再 import outputGate）、L441、L445：outputGate 只 import display 的 `templates.mjs`，组合由 host 完成，矩阵无环 |
| 小项：npcs 写者路径 | 已解决 | L403 统一为 `kernel/ledger.mjs`、`kernel/dimension-writers.mjs` |
| 小项：路径相对/绝对 | 已解决 | L446：writers 键相对 stateKey，加载期转绝对，与 pathTypes、textWriters 共用匹配语义 |

## 二、真问题

### R1 inputEdge 拿不到菜单显示名，Text 通路在此断开（L437、L473、L484、L443）
- §2.7 权限表（L443 附近）规定 inputEdge 读 labels（菜单项显示名作 Map 键），§2.8 表（L473 一带）要求它持有两张 `Map<Text, Handle<action>>`。但 4b 登记加载器表里 labels 的加载器只有 `projection/load-labels.mjs`，属于 display 组（L484）；import 矩阵 L437 的 inputEdge 行对 display 列为空白（禁止）。inputEdge 自己没有登记的加载器，也不能 import display 的。按字面，inputEdge 无法合法得到 `Text` 形态的显示名。
- 改法：二选一——在 4b 加一行 `input/load-menu.mjs`（inputEdge 组，读 labels，产出 `Map<Text, Handle<action>>`）；或在矩阵允许 inputEdge import display 的 `load-labels.mjs` 一个文件（只读冻结 Map）。

### R2 `Text` 的构造点与"只有内核可构造品牌类型"互相矛盾（L473、L474）
- L473 前半：每种品牌类型只能由内核构造函数产生；L474 与 E-KERNEL-ONLY：kernel 之外构造、`as` 强转品牌类型即违例。但 L473 后半：`Text` 由五个非规则组的登记加载器**或入口函数**从外部输入标记，又说 kernel 看不到 `Text`。玩家输入、AI 输出进入 inputEdge、aiGate 时，必须有人把裸 `string` 标成 `Text`；kernel 既不能做（看不到类型），其他组做了又算 E-KERNEL-ONLY。
- 改法：把 `Text` 从 E-KERNEL-ONLY 的品牌清单中单列：在一个只被五个非规则组引用的文件（如 `server-plugin/text/mark.mjs`）里提供 `asText(raw)`，规定它是 `Text` 的唯一构造点（登记进 4b 的"登记构造点"），其余组不得自行标记。

### R3 kernel 必须经手含 Text 的 state 路径，却看不到 `Text`（L473、§2.7 L423–425、L447）
- L473：`kernel/state-types.d.ts` 由 `pathTypes` 生成；textPaths 的路径类型是 `string`（L425），即 `Text`。kernel 的 storage、写者与 `writeText(credential, path, text)` 都要读写这些路径，但 kernel 的 tsconfig 不引用 `Text` 声明；生成的类型对 kernel 要么编译失败，要么只能退化成 `any`/`unknown`（4a 全部禁止）。
- 改法：kernel 侧对 textPaths 的值使用一个不透明类型 `TextSlot`（kernel 可见，不是 string 子类型，不可比较、不可拼接），五组侧再由 `asText`/`unwrap` 互转；`state-types.d.ts` 对 textPaths 路径生成 `TextSlot`，并在 L473 写明。

### R4 host 组出现在矩阵里，却不在六组与 state-owners 里（L439、L431、L416–421）
- 矩阵 L439 新增 `host`（`server-plugin/host/**`，组合 display→outputGate→传输），它被允许 import display、outputGate、aiGate；L431 却说共六个模块组，state-owners JSON（L416–421）也没有 `host`；L431 还规定"六组之外的 server-plugin 文件是规则层"，而规则层不得 import 五个非规则组（L445）。host 到底是第七组还是规则层，规则互相矛盾。
- host 还要传递 `Text`（把显示结果送出传输层），但 `Text` 只对五个非规则组可见（L473），host 不在其中。
- 改法：把 host 登记为第七个模块组（state-owners 加 `host.modules`，L431 改"七组"，互不相交与 E-GROUP-OVERLAP 范围同步），并规定 host 可见 `Text`、字符串操作按 §2.8 表中"仅原样传递"约束。

### R5 运行态修正项里的 `valueRX`、`when` 仍是字串（L191、L569、L447）
- L569：运行态修正项"不带任何字串字段"；L447：struct 内不得有 `string` 字段；但 L191 的 `struct:modifier` 保留 `value/valueRX/when/curve`，而 `valueRX`、`when` 是 RX 表达式文本（§3.2："subject.age >= 16"）。按 §1.5 的 `rx` 类型，它在 JSON 中就是字串；存进运行态 state 就违反 L447。
- 改法：规定运行态 `rx` 字段存**编译后的引用**（品牌类型 `RxId`，指向加载期编译登记的表达式；效果族与数据侧修正项产出的运行态条目在写入时由 kernel 查表转换），`struct:modifier` 里 `valueRX/when` 的类型写作 `RxId nullable`；并在 §1.5 的 `rx` 行注明"运行态存 `RxId`"。

## 三、措辞小项（只记账）

- `struct:holding` 引用了未登记的 `struct:holding_terms` 与族 `Handle<holding_kind>`（L192），应按"新增命名 struct 须登记"补一行或指向卷十八登记处。
- `struct:modifier`（L191）只列了 `value/valueRX/when/curve` 与 `source`，其余字段（stage、scope、stackGroup、priority、unpenalized、duration、target、id）未提；建议写"其余字段同 §3.2"。`source` 原有的 `via` 字段被去掉，也请说明。
- L195 命名 struct 表末行与"卷一 §4.4 的六类型……"同一行粘连，渲染成表格尾部；分段即可。
- `narrow(raw, schemaId)` 的返回类型含 `Text`（display/gate 加载器产出），而 `narrow` 实现在 kernel/validate（kernel 看不到 `Text`）；建议在 L477 注明用泛型 `SchemaTypes[S]`，该映射由五组各自的 `.d.ts` 声明合并提供，kernel 内只带不含 `Text` 的部分。
- tools 离线校验器（L487）读 labels 值，4b 把它列入但"所属组"写成 tools；S13 的 tools 第三组统计里请写明它是 4b 的合法读者，避免被 E-TSC-PARSE 误计。

## 四、结论

真问题 5 条（R1–R5），都是第九版新机制的接口收口，不涉及方案调整；措辞小项 5 条记账。按约定判"有条件通过"。R1–R5 各补一两句并同步 D.1 与附录 G 后，由主会话核对 §2.7 矩阵与 JSON、§2.8 第 1 条与 4b 表、§1.5 struct 登记即可收口，无需再整轮审。
