# B2-W4g《S13 ④ 白名单 (d) 门禁落实》与 B2-W4 第三步（kernel 裸字面量 302→0）只核原始输出

- 依据：李白 11-18 08:18 第 3 条、13:05 两条、16:3x 末句（终核过后照常合入不报）；卷二勘误 1118k20（:852、:2413 (d)）。
- 写：DeepSeek（deepseek-flash）：2b1b1c0d（检测器 typeof 与 markers 豁免、`in` 不计）、a5fa55a7（续跑：markers.mjs 单列 GRAMMAR_TOKENS 与搬迁定义源、检测器只取文法记号子集、typeof 只认操作数本身、12 条真违例照 T）、1bd5550a（dimensions-validate 两份定义改引 markers）。首跑因网络中断（ENOTFOUND）未提交，续跑接上未提交改动完成。
- 只核：另一 DeepSeek 两轮（必改：豁免集放宽、typeof 过宽→已改；必改：dimensions-validate 两份→已改）；Claude Sonnet 5.5 中档（claude-sonnet-5-5 medium）终核可封，自报 $0.08。
- 会话日志：F:/dnd-tools/claude-config-ds/projects/F--dnd-wt-ds-b2w4g/（DeepSeek）、F:/dnd-tools/claude-config/projects/F--dnd-wt-ds-b2w4g/37c996bb-…jsonl（Sonnet）。

## DeepSeek 只核一轮（b6fe379b-4768-41b0-80cb-d28508098932.jsonl；审 2b1b1c0d）

照卷二《维度表规范与统一入口》（:2412/:2413）

**必须改：**

① **第2条成立——豁免集反了，放宽④**：`collectMarkerTokens`（`tools/accept/detectors/typed_pos.mjs:29-42`）把 `markers.mjs` 全部导出当"文法记号"，但该文件只有**协议标记**定义源（`TYPES` :7、`CODE_ENUMS` :10、`DOMAIN_OPTIONAL` :39、`ROW_FIELDS` :42、`RX_OPS` :46、`RX_KIND` :52、`PATH_TYPE_EXTRAS` :56、`NS_ROW_TYPES` :60、`LOT_LEG_KEYS` :65），**没有一个** :2413 (d) 所列记号（通配 `*`、路径分隔符、join 分隔串、JSON 记号）。后果：`x === 'number'` 被免（`tests/accept/w4g-selftest.test.mjs:30` 明判 0），`server-plugin/kernel/save.mjs:548` 的 `state === 'ok'` 被吞——正是 (a) 明令"不计是否登记代号"的放宽。反向也没豁免：`'*'` 21 处（generated:65、keys:105/120/122/197、state-owners:76/82/92/94/246/320、save:116/262/263/370、storage:82/92/351）与 JSON 记号 17 处（json-text.mjs:23/37/42/45/51/56/57/61/65/69/70/74 及 :8 的 Set）仍在计。`markers.mjs` 未区分两类；须先在 markers 里单列文法记号定义源（多文件共用的 `*` 等按 :2413 末句收进去），检测器只取该子集。

② **`operandHasTypeof`（`typed_pos.mjs:47-71`）扫描过宽**：它穿过下标与语句头括号，`a[typeof b] === 'z'`、`if (typeof x) y === 'z'` 里的字面量被误判为"typeof 结果比较"；应只认操作数本身是 typeof 表达式。

**通过项：** `in` 不计有 :2412 原文（④ 只列 `===/!==/switch/Map 键/数组元素`）；`c_text_kernel_4` 302→49 属实（`node tools/accept/run.mjs pre_commit`：current 49、last 302、b0 670），`baseline.json` 未改；5 个使用 `typed_pos` 的类别（escape_hatch、fallback、id_parse、text_judge、wallclock）恰为升 rev 的 5 类，rev+1 带同号记录，格式与登记器输出一致；`node --test tests/*.test.mjs tests/kernel/*.test.mjs tests/accept/*.test.mjs` → 477 pass／0 fail；`pre_commit` verdict pass。残留 49 条中约 38 条是 (d) 应免的文法常量，不能算"白名单外真违例"。

未改任何文件、未提交。

## DeepSeek 只核二轮（13d74009-b783-4098-84fc-fffdc379398f.jsonl；审 a5fa55a7）

照卷二《维度表规范与统一入口》。

**判：必须改一处。** dimensions-validate.mjs:19 仍写 `{class:'class'}`、:77 仍写 `'effect'`，与其新定义源 VOCAB_FAMILIES（卷二 :288）、ID_KINDS（:182）重复，留两份。

余合规：markers.mjs 0 import（测试过）；GRAMMAR_TOKENS 出处：`'*'`/`'.'` :814、`'|'` :320、JSON 记号 :2413(d)。五项定义源逐个：DECL_FIELDS←declare.mjs:47 原数组（:476-477）、RULE_STRUCTURES←rules.mjs:117 PROCESS_STRUCTURE（:1429）、KERNEL_MODULES←state-owners.mjs:418 LEDGER_WRITER（:247）——原处已删、只一份，属搬迁非新造手写名单；词表族名、伪类 kind 同属搬迁，仅余上述两份。检测器只收 GRAMMAR_TOKENS、typeof 只认操作数本身；`x==='number'` 计 1、两条反例计 1 均过。抽查 declare:47、rules:117、rx:324、named-conditions:64、save:549 行为等价。c_text_kernel_4=0（last 302），baseline.json 未改；25 类判据仅加 ref、升 rev、换指纹，无阈值改动。`node --test …`：480 pass 0 fail；`pre_commit`：verdict pass。残留三文件未入提交。

（主会话：1bd5550a 改 dimensions-validate 两处为引 T.vocab_family.class、T.id_kind.effect，480 测试过、c_text_kernel_4 仍 0；随 Sonnet 终核一并核。）

## Claude Sonnet 终核（37c996bb-50fd-4e3b-abea-71fa182a419e.jsonl；审 1bd5550a；自报 $0.08）

照卷二《维度表规范与统一入口》：**可封**。

1. `typed_pos.mjs`：豁免只取 `markers.mjs` 的 `GRAMMAR_TOKENS`，协议标记照计。typeof 只认比较操作数本身是 typeof，`switch(typeof)` 的 case 同样处理。没有按文件名或行号跳过的口子。
2. `markers.mjs`：新增成员各自标了卷二出处（:814、:320、:2413、:476/477、:1429、:288、:182、:247），都是搬迁，文件仍是 0 import。
3. `save.mjs` 和 `json-text.mjs`：抽查的改写是把字面量换成同值句柄，行为不变。
4. 测试：`node --test` 480 项全过，0 失败。

唯一的观察，不算必改：`'x' in obj` 不再计入第 ④ 类，依据是卷二 :2412 的 ④ 没列 `in`，`in` 归第 ② 类。
