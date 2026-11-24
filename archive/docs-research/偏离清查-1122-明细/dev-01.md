# 偏离清查·第 1 组（卷一 总纲与分层）

共 8 条，甲 0 乙 3 丙 5，有理由 2 无理由 6。

设计依据：docs/统一底层设计/卷一-总纲与分层.md；docs/审查/李白裁定-1117.md；docs/派活卡头规矩.md 第二节硬规矩 1–10。已有审查合并来源：docs/研究/公共部件审查-乙-1122.md。行号为本次 Read/Grep 所见。

### 1 statuses.json 仍声明 kind:"tags"，未升级为卷二 §1.11 容器
- 位置：world/ontology/statuses.json:3
- 设计原文：卷一 §2.3 :156「本体表 world/ontology/*.json 保留；statuses 升级为卷二 §1.11 容器格式」
- 代码实际：statuses.json 顶层 `"kind": "tags"`（与 tags.json 同 kind），内容只有一条 exposure 标签 wet，不是 §1.11 状态容器。
- 理由：无
- 影响：规则缺
- 严重程度：乙
- 合并：无

### 2 derived-fields.json 仍留 5 条 scope:"writes" 的派生量
- 位置：world/ontology/derived-fields.json:8–12
- 设计原文：卷一 §2.8 :128「L-8 投影不落盘：投影可随时丢弃重建（I17）」
- 代码实际：standing/trust/loyalty/resentment/fame 五条 `"scope": "writes"` 仍登记为可写，与文件内 note「派生量不落存储」自相矛盾（未接入运行时，属遗留本体表）。
- 理由：无（文件内 note 自述 K2-23/M24-21，未入裁定/勘误/问题.md）
- 影响：规则缺
- 严重程度：乙
- 合并：无

### 3 state-owners.mjs 把 22 个实体类写死在代码常量 ENTITY_KINDS
- 位置：server-plugin/kernel/load/state-owners.mjs:50
- 设计原文：派活卡头规矩 第二节第 10 条（写死红线）「任何系统里的数值、规则、种类一律放数据表」；卷一 §2.1 :123「22 类实体各一个 view」
- 代码实际：`ENTITY_KINDS` 冻结数组列全 22 类（item…event_type），种类不在任何数据表、由代码单点列出。
- 理由：无（问题.md:753 只在别处顺带提「ENTITY_KINDS 只列了名」，非登记偏离）
- 影响：规则缺
- 严重程度：乙
- 合并：无

### 4 到期事件动词 verb_due_elapsed 在 mount.mjs 与 scheduler.mjs 各写一份字面量
- 位置：server-plugin/kernel/mount.mjs:20（另一处 server-plugin/kernel/scheduler.mjs:403）
- 设计原文：派活卡头规矩 第四节④「同一判断只一处」／第二节第 9 条（模块化）
- 代码实际：`DUE_VERB = 'verb_due_elapsed'` 与 `DUE_EVENT = { verb: 'verb_due_elapsed', … }` 两个文件各自写死同一 verb 代号字面量。
- 理由：无
- 影响：只是形式
- 严重程度：丙
- 合并：无

### 5 primitives-runtime.mjs 在 server-plugin 根目录、属规则层，与卷一目标路径不符
- 位置：server-plugin/primitives-runtime.mjs:1（文件头自述「规则层」）
- 设计原文：卷一 §5.1 :479「原语与执行器 primitives*.mjs … 目标路径一律在 server-plugin/kernel/** 下」
- 代码实际：执行器落 server-plugin 根目录、归规则层，未搬 kernel/**。
- 理由：裁定-1117.md:1081 五.1（执行器归组选 B 规则层）
- 影响：只是形式
- 严重程度：丙
- 合并：无

### 6 index.mjs 的 info 导出，注释仍写「等裁定」，裁定已落
- 位置：server-plugin/index.mjs:17
- 设计原文：卷一 §3.2 :399（装配文件封闭清单，卷二 §2.9 第 0 条「装配文件」项）
- 代码实际：`export const info = {…}` 现已被卷二 :996 第四种许可语句放行，但注释仍标「等李白裁定（C1）…info 暂保留」。
- 理由：裁定-1117.md:1487 6-19 C1；问题.md:326（勘误 1121k7 已合）
- 影响：只是形式
- 严重程度：丙
- 合并：无

### 7 primitives-runtime.mjs 手写一份代号/维度键文法（全仓第四份）
- 位置：server-plugin/primitives-runtime.mjs:105–130
- 设计原文：卷一 §3.1 :368「代号的唯一合法形式是同族句柄…裸字串字面量参与比较一律计入」（单一定义在卷二 §1.9）
- 代码实际：isCode/isKey 逐字符手写 CODE/KEY 文法并另读 grammarMaxLength，与 validate/types.mjs、vocab-load.mjs、keys.mjs 三处正则并行。
- 理由：无
- 影响：只是形式
- 严重程度：丙
- 合并：公共部件审查-乙-1122.md 第五节第 4 条／修理清单第 7 条

### 8 primitives-runtime.mjs 自写 canonical，与 kernel/storage.mjs 同式
- 位置：server-plugin/primitives-runtime.mjs:398
- 设计原文：卷二十七 :542（存档摘要只有一种、口径同卷二 §2.9 第 3 条）；乙组审查第十节「规范序列化」
- 代码实际：规则层自写 `canonical()` 做原语契约比对，与 kernel/storage.mjs:559 的 canonical 同式两份。
- 理由：无
- 影响：只是形式
- 严重程度：丙
- 合并：公共部件审查-乙-1122.md 第十节／修理清单第 14 条

## 拿不准

- primitives-runtime.mjs:48–69 的 CATALOG 与 world/ontology/primitives.json 是同一份原语契约（20 行、字段形状）写两处（代码 + 数据），靠 checkPrimitiveCatalog 逐行比对保一致。卷一 §3A.9 把「原语 op」列为封闭（可放代码），但硬规矩 §9「同一判断只一处」与之相抵。缺：卷二/卷九对「规则层可执行契约能否放代码、与数据目录并存」的明确一句。
- primitives-runtime.mjs:202–204 CONTRACT_EXTRAS.move 要求必带 subject，与同文件目录里 move 的 subject 列为 optional 不一致；依据卷九 §4.2.1 :639（行动者由提交段给）。属卷九范围，本卡未把卷九作设计依据，不判。

## 跨卷待判

- world/ontology/ 下 verbs.json、obligations.json、tags.json、statuses.json、derived-fields.json、calendar.json、entity-templates.json、holdings.json、offenses.json 等本体表当前无运行时加载器（kernel/load/world.mjs 只载 dimensions/、_vocab.json、state-owners.json、primitives.json、named-structs.json）。其中 verbs.json 已有裁定（裁定-1117.md:1171 判「verb 必须在 verbs.json」为陈旧引用，动词改读 verb 族）。其余各表应加载还是随领域卷退役，须按各领域卷判断，本卡不判。
