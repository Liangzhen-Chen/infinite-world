模型：claude-sonnet-5-5，中档（11-13 换 Opus 审查前的旧记录）（主会话 11-13 按运行记录补注）

# 卷二三审 B（第三版，1183 行）

静态阅读，未运行任何东西。对照：复审B 的 M1-M5、李白输入边六点。

## 结论：有条件通过

M1-M5 全部落实。语言边界的验收比上轮扎实得多。剩 3 条必改，都是"白名单口径漏洞或自相矛盾"，改动小。

## 一、M1-M5 核对

| 项 | 判定 | 证据 |
|---|---|---|
| M1 B8 与派生维度矛盾 | 已解决 | L236「派生维度不接受偏离行」；L484 受伤=状态实例+修正，source base→modified；L1042 B8 改写，并拆出非派生维度 durability 的偏离写回 |
| M2 输入边断言 | 已解决 | L1044-1052 B10 (a)-(h) 逐项覆盖（NFC 口径、首尾空白/大小写/标点、整句含项/关键词、缺槽位、同名 ambiguous、T0 无自由文本、AI 越界/超时/不可用、zh/en 同构）；L206 把相等口径写死；G4 L1062 |
| M3 S13 口径 | 大部分解决，见必改 N1 | L1023-1029 |
| M4 modifiable 与 map | 已解决 | L95、L581 与 L1005/附录 A 一致，A3 L997 要求 `upkeepPerDay[class_fuel]` 通过 |
| M5 "同第一版"悬空 | 已解决 | 全文检索无"同第一版"；§6.12 L967-969 有"改后"列，A9 L1003 指向它 |

S13 逐项：
- 扫描目录含 consistency-review/service/evidence/outcome，排除输入边模块组并有 state-owners `inputEdge.modules` 来源：L1024 通过。
- AST 抓 includes/startsWith/正则/字面量比较：L1025 ①②③④ 四类，通过。
- 代号白名单正则与文件：L1026 点名 `world/ontology/scan-allowlist.json`，正则 `^[a-z][a-z0-9_]{1,47}$` 等限三个文件，通过。
- 基线 219/74/26：L1028 写明（219 拆 A-F 六类 117/27/13/15/36/11，和为 219 无误）。
- 不误伤显示层与 i18n：L1027 通过。
- "合格字面量须符合格式且在登记表"：L1025④+L1026(a) 表面成立（'sleep' 不在表里就报），但有漏洞，见 N1。

## 二、新增内容

**§3.9 效果族（L516-541）与状态容器派生 can/awake/capacity（L258）：没有暗含专项规则，没有读文字。**
- 效果族只有数据行：目标选择、RX、输出种类（封闭 enum：modifier/status/primitive/event/spawn）、引用原语与动词代号；"加神/法术/怪物不改 .mjs"并有 B13（L1055）。符合"行为由通用规则从维度算出"。
- `awake = body.consciousness ≥ rules.capacity.awakeMin`，capacity 取 consciousness/moving/manipulation 三值查阈值表，容器只能经 `modifiers[]` 影响 body.*，没有第二条路：纯数值，通过。
- 旧字段对照抽查（代码）：action-capacity.mjs:27 `capacity()`、:29/:33/:39 返回 `level: none/limited/full` 与新"full|limited|none"一一对应，且 :29/:33/:39 的中文 reason 确在迁移清单上；:62 `canAct` 为单一入口与 §2.5 一致；derived.mjs:72 `slot.closed` 对 `closed:true=modifiable:false`；derived.mjs:107 `startsWith('bld_')`/`'faction_'` 对 E-VIEW-ID-PARSE 与 `faction_*→org_*`。零偏差。

## 三、必改

**N1　S13④ 白名单会放过"单词恰好也是代号"的情形（L1025 ④、L1026 (a)，对 L242）。**
白名单 (a) 是"全部表中登记的 ASCII 代号"的平铺集合。L242 的 status_family 枚举值本身就有 `sleep`、`injury`、`dead`、`hunger` 这类裸单词，它们是合法登记代号。于是规则层写 `x === 'sleep'` 因为"在白名单里"而过关，而这恰是睡眠判断的老病（S3 的 83 处睡眠正则）。必须改成"按上下文判定"：比较的字面量必须属于**被比较维度所声明的词表族**（或经 `vocab()` 取得的常量），否则仍报；并规定规则层使用代号字面量的唯一合法形式（例如经注册表常量/`vocab` 句柄，不直接写裸字符串）。补一条夹具：把 `'sleep'` 写进规则代码必须被报。

**N2　G4 自相矛盾（L1062 对 L207、L1017）。**
G4 要删除 `server-plugin/input/` **和 `projection/`**。但 projection 是显示层，菜单要靠它渲染显示名；删掉后"按菜单走完流程"没法成立。李白的规矩是"输入边可整体拔掉"，没说拔显示层。改为：G4 只删输入边模块组（`inputEdge.modules`）；另加 G5：显示层缺 labels 时菜单以代号显示仍可操作（与 G1 相通）。同时统一目录名：L1017 写"输入边与 ui 目录"，L1027 写"ui-*.mjs 投影层"，L1062 写 `projection/`，三处口径不一致。

**N3　扫描范围漏了 extension（L1024 对 L1028）。**
L1028 基线写"extension 26 → 0"，但扫描目录只有 `server-plugin/**/*.mjs`，没写 extension 目录在不在内。要么把 extension 目录加进扫描目录并写路径，要么说明那 26 处在 server-plugin 内。否则基线数字无扫描器可测。

## 四、建议（不阻塞）

- S1　`dead = status_dead 实例存在`（L258）与 B14 的 `status_unconscious`（L1056）在规则里点名单个状态 id。改用 `status.family`（L242 已有 `dead/unconscious` 族）判断，避免专项 id 字面量，也与 N1 一致。
- S2　效果族示例里 `skill_medicine`、`resource:"mana"`、`magnitude * 0.1` 等是示例，但示例中的魔数没有标定值出处；示例上加 `placeholder` 已有，建议再写"数值一律引用 rules 表"。
- S3　`tools` 333 行与中文枚举约 1,100 行"先登记基线、只降不升"（L1028）：没有目标终值，建议写明由卷十二定。
- S4　S13 ③ 把 `world/i18n` 之外含中文的字面量一概计入，错误消息 `throw new Error(中文)` 在 (c) 里豁免：建议与 §4.2 校验器自身输出"允许中文"（出现在旧版 §4.2）保持同一句话，免得两处解读不同。

## 偏离指令之处

无。未提交 git。primitives "封闭 19 个"（L537）我没核到代码数量，未下结论。
