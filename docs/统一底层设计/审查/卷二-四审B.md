模型：claude-sonnet-5-5，中档（11-13 换 Opus 审查前的旧记录）（主会话 11-13 按运行记录补注）

# 卷二四审 B（第四版，1391 行）

静态阅读，未运行任何东西。

## 结论：有条件通过

三审的 N1、N2、N3、S1 全部落实。新裁定（输入规范化、屏蔽词、四模块组）大体到位，有 4 条必改：1 条文内矛盾、1 条错误码表缺项、2 条扫描口径缺口。

## 一、三审项核对

| 项 | 判定 | 证据 |
|---|---|---|
| N1 白名单改上下文句柄 | 已解决，附 M3 的补洞 | L1204 ④「任何裸字符串字面量…除非满足上下文白名单」；L1205 句柄 `V.<family>.<id>`、两侧类型归因、`E-VIEW-FAMILY-MISMATCH`、`'sleep'` 与 `'sfam_sleep'` 都报、白名单文件不含代号集合；正例 `st.dims.family.value === V.sfam.sfam_sleep`，反例三条（裸字面量、数组 includes、异族句柄）；A16 L1184 |
| N2 G4 与目录口径 | 已解决 | G4 L1243 只删 `inputEdge.modules`；G5 L1244 空 labels 代号菜单；§1.9 L219 把 display 层明确"不删"；四组定义 L398-401、L407；S7 L1196 |
| N3 extension 归属 | 已解决 | L1203 显示层组含 `extension/**/*.mjs`，26 的基线归显示层 L1207 |
| S1 dead/unconscious 按族 | 已解决 | L270 `family == sfam_dead`；B14 L1237 按 `sfam_unconscious`，且"实现里不出现任何 status_* id" |

回答"是否真正堵住 `=== 'sleep'`"：**主体堵住**——裸字面量一律报，不再依赖"字串是否登记"；族归因防止拿错族的句柄。但归因靠 AST 静态类型，存在绕法，见 M3。

## 二、新裁定核对

- **输入规范化**：L218 写明 NFC → 去首尾空白 → 简单大小写折叠 → 逐码元相等，不折叠全半角，允许候选编号，无匹配退回并展示完整菜单，与你给的口径一致。B10 (a)(b)(i) L1225-1233 用例齐：首字母大写、首尾空格、编号 "3"、繁简 "買鹽"≠"买盐"、全角空格、中间空格、编号越界/非整数，zh/en 同构 (h)。通过。
- **生成名与屏蔽词**：L211 只存 nameParts，哈希不含拼装字串，屏蔽词离线校验 E-I18N-BLOCKLIST，运行时只在显示闸替换，禁重采样写回（E-VIEW-NAME-RESEED）；A17 L1185、S17 L1210、B9 L1223 对应，B9 加了"存档哈希相同"。方向对，但有 M1、M2。
- **四个模块组**：L398-401、L407：inputEdge ≤8（E-GROUP-SIZE）、四组不相交、规则层 import inputEdge/display/outputGate 即 E-VIEW-INPUT-IMPORT、gate 只被测试与 CLI import；S13 分规则层组与显示层组，显示层同样不得用文字判断（L1203）；G4/G5 见上。但各组"自己内部"的扫描规则不齐，见 M3、M4 与建议 S3。

## 三、必改

**M1　屏蔽词离线校验与"校验器不读 labels 值"矛盾（L211 对 L209）。**
L209：校验器对 labels"只查键存在，不读值"。L211：校验器要用"每种已发布语言的拼装结果"与 blocklist 比对——必然读 label 值并做文字匹配。必须指明由谁做：建议改成"内容构建工具（tools/，第三扫描组，单列）"执行 E-I18N-BLOCKLIST，`dimensions-validate.mjs` 保持只查键；并在 L209 加一句例外指向它。

**M2　错误码表缺项（L606-616 的 4.3 表）。**
正文与断言用了 `E-I18N-BLOCKLIST`（L211、A17）、`E-VIEW-FAMILY-MISMATCH`（L1205、A16）、`E-VIEW-NAME-RESEED`（L1210）、`E-VIEW-INPUT-IMPORT`（S16），4.3 表里只有 `E-I18N-LABEL-MISSING` 与 `E-GROUP-*`。把它们和对应级别补进表。另：L209 称缺键为 `W-DIM-LABEL-MISSING` "按 E 级处理"，L606/L616 同码两形态，统一成一个码、两种严重度的写法即可。

**M3　类型归因的绕法没堵（L1205）。**
须补三句：(1) **无法静态归因的比较一律按报错处理**（局部变量经解构、跨函数传参、三元合流等，宁可误报也不放过）；(2) 禁止对 `V` 的动态访问（`V[fam][id]`、`V[\`sfam_${k}\`]`）与用模板/拼接构造代号字串，计入 ④；(3) 经 `const S='sleep'` 别名再比较，按字面量溯源计入 ④。再加一条夹具到 A16：这三种写法都必须被报。

**M4　输入边组没有机器扫描规则，只有行为用例（L1203、L1212）。**
S13 把 inputEdge 整组排除，S16 只管 import。于是 input/ 里写一个 `includes`/正则/`localeCompare`，只有 B10 行为用例可能抓到。补一条 S18：对 inputEdge 组单独扫描，只允许"唯一一个规范化函数 + `===` + 数字整串匹配"，出现 ②类方法（includes/indexOf/startsWith/match/search/localeCompare）、正则、任何相似度/编辑距离调用即失败；并列出组内文件数 ≤ 8 的检查。outputGate 组也写一条：只能读 blocklist 与 labels，不得写 state（S17 已覆盖一半），不得被规则层 import（L407 已有）。

## 四、建议（不阻塞）

- S1　`sfam_dead`、`sfam_unconscious` 仍是规则层里点名的族。更通用的写法：在 `sfam_*` 词表条目上加字段（如 `terminal:true`、`capabilityLoss:[…]`），规则只读字段，不点名族。
- S2　(e) 同名判定应写成"规范化后相同"（"Buy"与"buy"在 en 下规范化相同即 ambiguous）；再加一个用例：菜单项显示名恰好是数字（"3"）与编号冲突时的处理。
- S3　gate 组（门禁与扫描）自身是否受 S13 约束未写；建议写"gate 组读文字是其职责，免扫，但其输出不得被规则层读"。
- S4　`E.<code>` 句柄（L1205）只提了名，没写它的家族归因规则；补一句。

## 五、有无暗含专项规则或读文字

- 未发现读自然语言判逻辑的条款。显示闸的屏蔽词替换是显示层对显示字串的文字匹配，被限定为：只在 outputGate、结果不回写 state、规则层不得 import（L407、S17），符合"文字只是显示层"。
- 专项味道只剩 S1 一条（点名 `sfam_dead`/`sfam_unconscious`）。
- 无空泛条款：新增 A16、A17、S17、G5、B10 (i) 均有可执行判据。

## 偏离指令之处

无。未提交 git。
