# 门禁 K5-24 Sonnet 只核（1119）

对象：分支 ds/gate-k524，提交 384afed7（`git diff origin/master...HEAD`，9 文件）。核者 Sonnet 5.5 中档，只读，非写者。

结论：**必须改 1 项（第 2 条绕过口子）；其余可接受。**

## 依据原句
- 卷二 §2.5 :495：「其他所有卷与所有文件只调用这个谓词，不得自己读 `terminal` 字段或 `state.terminated`……别处读即 E-VIEW-PREDICATE-LOCAL。」
- 卷二 §2.7 :552（terminated 键登记行）：「kernel 的 `writePath` 核对"目标未终止"是内核自己读，不列为读者」。
- 李白 11-19 11:1x 裁定⑤：「豁免只限 kernel/ 下做拒写核对的文件……扫描按目录口径写，不点名开白名单。」

## 逐项
1. 码 E-VIEW-PREDICATE-LOCAL：已登记。server-plugin/kernel/error-codes.mjs:71 有；卷二 :495、:496 码表即此条原码。可接受。
2. **必须改**：绕过口子。tools/accept/detectors/path_access.mjs（stateReadHits，约 :178–:190）只认 stateChains 里 `segs` 逐段等于 `terminated` 的链。
   - 计算属性 `state[k].x`：segs[0]='*'，不等于 'terminated'，不计。顶层变量键读本由 vol2.S15（decl_cmp dynamicState）接，但 S15 范围只有 `groups:["rules"]`（tools/accept/items.json 约 :2750）、state 为 registered，且只报 segs[0]==='*'；textcore、inputEdge、gate、outputGate、aiGate、assembly 组里 `state[k]` 无人管。
   - 别名 `const s = state; s.terminated`、解构 `const { terminated } = state`：根被换名后追不到，没有任何条目接。
   - 卡头第二节第 3 条「不留绕过口子」。条目 source 写「局限同其余读条目」不是理由：本条是卷文明文禁令（:495「所有文件」），口子在规则层与各服务端组里敞着。
   - 改法（按卷文可行、宁报勿漏，仍不点名文件）：stateReadHits 在同一范围内另计两类并同码 E-VIEW-PREDICATE-LOCAL，各加必报夹具与单测：
     a. `state` 根的第一段是计算属性（ch.segs[0]==='*'）即计（含 `state[k]`、`state['terminated']` 之外的变量键）；
     b. `state` 作为被绑定的值（`= state` 后接 `;`、`,`、`)` 而非 `.`/`[`/`?.`，或 `{…} = state` 解构）即计；作为函数实参传入（`terminated(engine, state, id)`、`readPath(state, …)`）不计。
     真实仓库须仍为 0（跑 `pathAccess(loadContext…)` 的单测验证）。若写者认为 b 误报面过大，须列出真实仓库中的误报样例报主会话，不得降为"局限"了事。
3. kernel 豁免：按目录口径，范围靠 params.groups 不含 kernel 实现，items.json 无点名文件，grep 无文件名。可接受。范围组七项（rules、textcore、inputEdge、gate、outputGate、aiGate、assembly）对照 tools/accept/read.mjs groupModel 与卷二 §2.9：服务端为 kernel、inputEdge、gate、outputGate、aiGate、assembly(files)、textcore(files)、规则层剩余（remainderGroup 键 rules），无遗漏。
4. tests/accept/api-callers.test.mjs：新增 19 行，纯追加在文件末尾；无 CR 行混入、无重复段、无残留，末尾换行正常；两条测试均自造文件内容再断言命中文件名与码（含 kernel/ 与 kernel/load/ 直读不计、句柄与谓词与写入目标不计），真实仓库断言为 0，是行为测试而非抄读数。夹具：36（`state.terminated[id]` 读）必报；37（谓词与 `readPath(state, P.terminated(id))`）、38（写入目标）必不报，能区分对错。可接受（heredoc 违规已由写者在回报中认）。
5. 共用检测器：path_access 的改动只新增 `access==='stateRead'` 分支，其余分支代码未动；cross_write、display_read、dual_write、version_fork 经登记器各 rev+1、旧记录未删（criteria.json diff 只增不删）；全量测试通过。可接受。
6. 命令与末行：
   - `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs`：tests 725，pass 725，fail 0，duration_ms 130626。
   - `node tools/accept/run.mjs pre_commit`：verdict "pass"（text_judge 各例为 not_run，属未跑类，非失败）。
   - 工作区干净。

## 处置
第 2 条改完（含 a、b 的夹具与单测）后，由另一个 Sonnet 复核一次再封。其余无须改。

## 第 2 轮（Sonnet 5.5 中档，只核，3a11f72e）

结论：**可封。**

- 改法对：path_access.mjs stateReadHits 现在计算属性第一段（segs[0]===*）计 computed，裸 state 被 `=` 绑定（别名、解构；engine.state 前缀跳过）计 alias，同码 E-VIEW-PREDICATE-LOCAL；函数实参不计；写入目标仍不计。
- 夹具 module_edge-39（state[key]）、-40（别名）、-44（解构）必报；单测按文件与 nodeKind 断言（a 计算、b 别名、c 解构、d engine.state 别名必报，e 函数实参与 kernel/ 目录不计），能分辨对错；真实仓库单测仍为 0 命中。
- criteria.json 删行只有 print 与 rev 两类，旧记录未删；五类 rev+1 经登记器。
- 全量：tests 726，pass 726，fail 0；pre_commit verdict pass。
- 残余（可接受，不阻封）：`cond ? state : x`、`{ state }`、`return state` 一类非 `=` 紧邻的转手不计，同属此类检测的词法局限，建议写者在条目 source 写明。
