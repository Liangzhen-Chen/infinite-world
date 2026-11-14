# 卷二 P1–P3 与 DisplayLang 甲 只核（11-14）

只核：Opus 5.5 中档（claude-opus-5-5 medium），不是改稿者。对象：卷二最新提交 655c7975（同提交改卷二十九 C29-3 行、修订行与 审查/卷二十九-停报项与记账.md）。依据：审查/卷二收卷勘误批-只核.md 的 P1–P3 与 ④ 方案甲、李白 11-14 11:30 裁定。正文未改。

结论：**P1、P2、P3 与 DisplayLang 甲都按所请落实，没有超出；快照合规；脚本全过（check-c29-3-fs 先按裁定修了一条许可）。有 1 处局部漏改（见 R1），不用改结构；另记 2 项。**

## A 检查脚本修订（check-c29-3-fs 第 6 项）
- 原因：入口表新增 `kernel/load/display-langs.mjs`（kernel 组）读 `world/i18n/locales.json`，第 6 项许可组只有 textcore、gate、outputGate，判 FAIL。这是裁定带来的合法新读者，不是正文错。
- 改法（只加一条最窄许可）：组为 kernel **且**文件恰为 `kernel/load/display-langs.mjs` **且**来源列路径恰为 `world/i18n/locales.json` 一个、整行无"写"、产出列写"不产出 `Text`"，才放行；不满足任一条报"kernel 例外越界"。其他 kernel 文件、其他组照旧报"非许可组读语言包"。规则层两项（矩阵、白名单 node 列为"无"）未动。
- 备份 F:/dnd-tmp/vols/backup/check-c29-3-fs.mjs.20261114-103707.bak；diff 存 脚本/检查脚本锚点改动/check-c29-3-fs-DisplayLang.diff；副本 脚本/只核/check-c29-3-fs.mjs 已同步（逐字节相同）。
- 敏感性试验（scratch 副本，6 项全 FAIL，见原始输出末段）：s1 `kernel/load/env.mjs` 也读 locales.json；s2 display-langs 加读 labels；s3 display-langs 改读 labels；s4 display-langs 行加"可写回"；s5 同文件改属规则层；s6 kernel 另一文件名读 locales.json。现行卷二 PASS。

## B ① 各项是否到位、是否超出
| 项 | 落点 | 判定 |
|---|---|---|
| P1 `intDigits(n, minWidth)` | §2.8 textcore 行、outputGate 行；豁免表 `textcore/ops.mjs` 行 | 照所请：非负整数、前补零位到 `minWidth`、0 不补；负号由模板给；outputGate 行写明按 `digitGroup`（卷二十九 :208）整数除法拆段、非首段 `minWidth = digitGroup`、分隔符取语言包经 `concatText`，合 R29-6.8。groupApi（:569）只登记导出名，不需改。D.1 ④ 行仍写 `intDigits(n)` 是那一批的历史记录，不算矛盾 |
| P2 音频全局与入口行 | §2.9 第 1 条白名单 host 行；入口表 bootstrap 行 | 加 `AudioContext`（只用于构造 `AudioCap`），仍"全部仅 bootstrap"；入口行加 manifest 与素材文件，写明经 `fetch` 取、不经 `NetCap`，清单经 `narrowWire` 收窄，冻结表不交出——一并答了上次 P2 第 3 点（取法）。上次 P2 另提的卷二十九 M29-36 旧问题不在本批所请内，未动（见记账 2） |
| P3 提交号 | D.1 "卷二收卷勘误批"八行；卷二十九 C29-3 行；记账表首段与 1、2、4–9 项 | 都写 e44fcde4；记账第 3 项写"提交号待下次提交补"（同提交写不了自己，合理） |
| DisplayLang 甲 | §1.9 加引用；§2.7 kernelApi `displayLangs`（callers textcore、gate、outputGate、aiGate）与矩阵 textcore 行；入口表加 `kernel/load/display-langs.mjs` 行、display-load 行补一句；第 2 条声明归属两项、类型登记表两行、豁免表一行、narrow-wire 行一句 | 与 ④ 方案甲逐条对上：声明在 `kernel/text-types.d.ts`（规则层 tsconfig 不引用）与 `extension/textcore/types.d.ts`；服务端唯一构造 `kernel/handles/display-lang.mjs`，名单由 `kernel/load/display-langs.mjs` 读 `locales.json` 只取 `id`；上行 `locale`、state/存档 `lang` 都走这一处；display-load 不自己转型；客户端只在 `narrowWire`。`kernel/load/*` 本有 `node:fs`（矩阵 kernel 行），无需加权；规则层对 `displayNames` 的 readers 为空，看不到 `lang`。名单只含语言代号，不读自然语言；不进摘要。乙、丙写明不采用及理由 |

没有原文以外的新机制。

### R1 卷二十九 §2.3 语言包文件表"谁读"一格漏了新读者（局部，同根牵连）
卷二十九 :223 `locales.json` 一行"谁读"只写"显示配置加载器"。本批起 `kernel/load/display-langs.mjs` 也读它（卷二 :865）。卷二 D.1 新行末写"卷二十九 §2.3 不需改"，但该表就是按文件列读者的，两卷说法不一。建议只改这一格为"显示配置加载器；语言代号另由 `kernel/load/display-langs.mjs` 读（卷二 §2.9 第 1 条，DisplayLang 甲）"，并删去卷二 D.1 那半句。不改结构，按二审余项常规可直接改、只核确认。

## ② 卷二十九标注
C29-3 行改"已全部落实"，提交号直写 e44fcde4，DisplayLang 一项写明方案甲并指向卷二 D.1 与记账表；修订行写"只改本格状态说明，不加设计"，实际也只改了这一格。记账第 3 项与卷二 D.1 一致。

## ③ 勘误合规（快照 1114z）
- `版本快照/卷二-v17补26-勘误前-1114z.md`、`版本快照/卷二十九-封卷-勘误前-1114z.md` 分别与 655c7975^ 的卷二、卷二十九逐字节相同。
- `版本快照/卷二-v17补26-现行.md` 与现行卷二逐字节相同。
- 版本号未升，卷首未改；两条新修订行都有理由、位置、读者卷。

## 记账（不阻断）
1. 卷二 :669 写"`kernel/types.d.ts` 只放代号类品牌"，`DisplayLang` 是代号类却放 `text-types.d.ts`。字面不矛盾（没说代号类全在 types.d.ts），构造函数清单也指向豁免表；下次排版可在 :669 括号里补"`DisplayLang` 例外，见第 2 条"。
2. 卷二十九 M29-36（:1017）把 `extension/ambient-audio.mjs` 归"host 组"，与 host 组 = `extension/host/**`、能力构造者只有 bootstrap 不一致——上次只核已提，本批未在所请内，仍待处理。

## 脚本（原样见 审查/脚本输出/卷二P1至P3与DisplayLang-只核-原始输出.txt）
check-vol2 PASS；check-vol2-ext PASS；check-卷二十九 全部通过；check-c29-3-fs（修订后）PASS；check-divisor 全书 0 处、回归全过；敏感性试验 6/6 FAIL。
