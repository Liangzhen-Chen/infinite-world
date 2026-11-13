模型：claude-sonnet-5-5，中档（11-13 换 Opus 审查前的旧记录）（主会话 11-13 按运行记录补注）

# 卷二八审 B（第八版）

静态阅读，未运行任何东西。

## 结论：有条件通过（1 条真问题）

## 一、七审项核对

| 项 | 判定 | 证据 |
|---|---|---|
| Q1 逃逸口 | 大部分解决，见 R1 | §2.8 第 4a 条 L464：禁 any/as any/as unknown as/@ts-*/eslint-disable，no-unsafe-* 全开；JSON.parse 与读文件只许 kernel 加载器且先过 schema（E-TSC-PARSE）；tsconfig strict+include 覆盖 + E-TSC-COVERAGE；state 类型由 pathTypes 生成（L460）；正反例 L498-500；错误码 L705 |
| Q2 位置白名单 | 已解决 | L463 补局部变量声明/解构、三元与 `??` 合流、数组元素与 includes、对象字面量属性值，前提同品牌；L495、L497 正反例同步 |
| 小项：六组 | 已解决 | L420 六个模块组、互不相交、import 矩阵 |
| 小项：自写规则 | 已解决 | L463 "自写一条规则"，工作量归卷十二（L1625） |
| 小项：Text 可见性 | 已解决 | L460 分组 tsconfig / project references |
| 小项：matchIdLeak 单例 | 已解决（措辞见下） | L447；A19 L1289 对只含 `player` 的文本不命中 |
| 小项：return 位置 | 已解决 | L463 "函数返回类型声明为同一品牌" |
| 小项：哈希排除表重复 | 已解决 | L454 合并为一条 |
| 小项：L220 拆条 | 暂缓，已记账 | L1627 写明留排版版处理，可接受 |

## 二、真问题

**R1　4a 的适用范围、覆盖粒度、加载器豁免三处口径不闭合（L464、L461）。**
(a) 范围：4a 的禁令点名"规则层与 kernel 目录"。inputEdge、gate、aiGate、outputGate、display 五组没有同样的 any/@ts-ignore/eslint-disable 禁令（只有"kernel 之外的任何 as"一句覆盖到它们）。但输入边产出的就是进入规则层的动作代号 Handle，aiGate 签发 writeText 凭证；这些组里一个 `any` 或 `@ts-ignore` 就能凭空造出品牌值，等于把"只有 kernel 构造品牌"掏空。应写成：4a 对 `server-plugin/**` 全部六组一律适用（extension/ 的 display 部分同），仅 `kernel/load/*.mjs` 对 JSON.parse/文件读取有豁免。
(b) 覆盖粒度：E-TSC-COVERAGE 比对的是"目录集合"。tsconfig 的 `exclude` 或 `files` 可以在已覆盖的目录里漏掉单个文件。改为按**文件清单**比对（磁盘上 `server-plugin/**/*.mjs` 对 tsc `--listFiles` 的结果，有差即失败）。
(c) kernel 自身矛盾：4a 说 kernel 目录禁用 any 且 no-unsafe-* 全开，同时又让 kernel 加载器做 `JSON.parse`（返回 any）。写明加载器的唯一合法形态：`JSON.parse` 结果立即赋给 `unknown`，经 schema 校验函数收窄后才产出品牌，并把这一处在 eslint 配置里作为加载器文件级例外登记。

## 三、措辞小项（记账）

- L447 的 matchIdLeak 定义写"任一代号登记表条目的子串"，单例豁免只在 A19 夹具里出现；把"单例 id（`singletonIds`）不作 needle"写进 L447 本身。
- `Text` 在规则层与 kernel 不可见（L460），但 kernel 加载器读 labels 值时如何处理未说明；一句话点明 labels 值只由 display/outputGate 的加载入口读取。
- 4a 的错误码 E-TSC-ESCAPE 同时用于 `any`、`as`、`@ts-*`、`eslint-disable`，建议在 §4.3 按子类（-ANY、-ASSERT、-DIRECTIVE）分列，便于卷十二统计基线。

## 偏离指令之处

无。未提交 git。
