模型：claude-sonnet-5-5，中档（11-13 换 Opus 审查前的旧记录）（主会话 11-13 按运行记录补注）

# 卷二九审 B（第九版，1749 行）

静态阅读，未运行任何东西。

## 结论：有条件通过（3 条机制层真问题）

## 一、八审项核对

| 项 | 判定 | 证据 |
|---|---|---|
| R1(a) 禁令范围 | 已解决 | §2.8 4a L477：覆盖 `server-plugin/**` 全部六组、规则层与 `extension/`；子码 -ANY/-ASSERT/-DIRECTIVE（L523-525、L733） |
| R1(b) 覆盖粒度 | 已解决 | L477：按文件清单比对 `tsc --listFiles`，`exclude/files` 不得漏文件；L733、L528 |
| R1(c) 加载器唯一写法 | 已解决（遗留见 Q1） | L477 `/** @type {unknown} */ const raw = JSON.parse(text)` 后只能传给 `narrow(raw, schemaId)`；L526 正反例 |
| 小项：matchIdLeak 单例 | 已解决 | A19 L1317（`player` 不命中）；L1532 称 gate 行已写，该行（L458）是超长行，我只核到夹具 |
| 小项：Text 加载 | 已解决 | 4b L484-486 labels 只由 `projection/load-labels.mjs` 读，blocklist 由 `gate/load-blocklist.mjs` 读 |
| 小项：E-TSC-ESCAPE 分子码 | 已解决 | L733 |

## 二、4a/4b 机制缺口（真问题）

**Q1　`narrow` 的类型契约没定义，且与 Text 可见性冲突（L477、L482-483、L460）。**
全部品牌化的收口是 `narrow(raw, schemaId)`，但没写它的静态类型：若返回 `any`/`unknown`，整个体系在这一点穿孔；它必须是按 schemaId 映射到产出类型的泛型（如 `narrow<S extends SchemaId>(raw: unknown, id: S): SchemaOut[S]`，`SchemaOut` 由登记表生成），且 `SchemaOut` 对非登记 id 报错。另：`narrow` 实现在 `kernel/validate`（L483），4b 表却让它为 display/gate/aiGate 的加载器产出 `Text`，而 §2.8 第 1 条说 Text 对 kernel 不可见、由五组入口函数标记。须改成：`narrow` 只收窄为品牌/数值，`Text` 字段由各加载器自己的入口函数在收窄后标记。另：L477 说"`unknown` 是全仓库唯一允许的 unknown"，但 `strict` 下 `catch (e)` 的 `e` 默认就是 unknown，会处处违例；须明确 catch 变量的处理（`useUnknownInCatchVariables` 配合"catch 变量只许传给 kernel 的错误规整函数"或明文豁免）。

**Q2　4b 把外部输入口只列了文件与 JSON.parse（L478、L489）。**
外部数据入口还有：`fetch`/`Response.json()`、HTTP 请求体（`req.body`）、`process.env/argv/stdin`、`postMessage`/DOM 事件数据、`child_process`。它们返回 `any`，被 no-unsafe-* 拦住后，合法代码无处落脚，实现者必然在业务文件里自行加 `unknown`/强转。须把 4b 从"读文件与 JSON.parse"泛化为"**一切外部数据入口**（文件、网络、进程环境、标准输入、DOM/消息事件）只许出现在登记加载器表内，且都经 `narrow`"，并给网络与事件入口各登记一类加载器（如 `ai-gate/parse.mjs` 已有，补 HTTP 请求入口与 extension 的事件入口）。

**Q3　门禁只比对了 tsc，没比对运行位置白名单的 eslint（L477）。**
位置白名单是 eslint 自写规则。`.eslintignore`、`ignorePatterns`、`--ignore-pattern`、每组自带的 eslint 配置都可以让个别文件不过检查，而 tsc `--listFiles` 比对不会发现。补一条：eslint 同样按文件清单比对（磁盘清单 = eslint 实际检查清单，ignore 列表为空，所有 eslint 配置由门禁核对哈希），差即 E-TSC-COVERAGE。

## 三、措辞小项（记账）

- 文件清单 glob 只写 `{mjs,js}`（L477）；建议包含 `.cjs/.mts/.ts/.jsx`，以免新扩展名漏检。
- 分组 tsconfig（project references）每一份都须 `strict`+`checkJs`；写明"所有 tsconfig"，而不只是总配置。
- L460 aiGate 行仍写"任一代号登记表条目的子串"，单例豁免只在 A19 与 gate 行；两处同一口径。
- 4b 表第一行 `kernel/load/*.mjs` 是 glob，登记应为具体文件名，新增加载器须改表（门禁可比对）。

## 偏离指令之处

无。未提交 git。
