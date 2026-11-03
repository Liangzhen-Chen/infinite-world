# 卡 llm1-confirm：回合"先解析再确认" + 判断步骤提示 + 回执去噪（不调用付费模型）

工作区 F:/dnd-wt/LLM1（分支 t-llm1，基于 s4a 911c3743，含 A3 与 S4 全部合入）。先读：docs/产品原则.md；F:/dnd/logs/sessions/a4llm-research.final.md（本卡依据，"推荐：先解析再确认"与拆卡第 1 张、constitution 草稿）；docs/架构设计/修订记录.md 2026-10-23 回合契约与 2026-10-24 第 4、5 条。只汇报与本卡有关的结论。

## 产品经理的硬要求（不得违反）
1. **自由度底线**：引擎候选只是捷径，不是围栏。候选里永远有"都不是"，选它进入开放提案（world_propose / open:proposal），由世界规律裁决可行部分、原因与替代。模型拿不准时必须选"都不是"，不得用近似候选凑数（把创意意图降级为普通动作算失败）。
2. **规则只保留一版、不做旧存档兼容**：不新增任何复演版本标记（xxxVersion）或旧行为分支；同版本存档重放确定性保持。
3. 不换更贵的模型；目标是**准确、快、便宜**三者都提升。

## 要做
1. **候选确认**：每个场内回合，服务端先用现有无模型构造器（server-plugin/action-constructor.mjs）+ 可做动作卡（action-affordances.mjs）按场景事实（地点、在场者、营业、库存、能力）与玩家原话，产出 3–5 个候选（参数由引擎填好，含缺槽说明）+ "查更多/澄清/都不是（开放提案）"。模型通过一个 strict 选择函数（DeepSeek 非思考 tool_choice 指定函数 + strict schema，enum 为候选引用）只做选择或补缺槽；引擎按所选引用执行，模型不能自填任意动作参数。唯一候选也须模型确认。"无行动"只用于纯闲聊/观察，不能替代对行动请求的裁决。
2. **回执去噪**：给模型的工具回执与场景投影去掉只给引擎用的字段（各类 xxxVersion 标记、内部编号链、复演元数据等），保留状态、效果、成本、拒因、缺槽、来源；投影上限仍 ≤1200 token。
3. **判断步骤提示**：按 research 文档的 constitution 草稿把 prompt/constitution.md 改写为"①判断类型 ②核对事实 ③选候选或都不是 ④只叙述回执"的步骤体，可调整措辞；静态提示总量不得超过 10593（用卡末命令检查）。prompt/examples.md 补 2–3 个判断示例，其中至少 1 个是"创意意图 → 都不是 → 开放提案"。
4. **性能**：tests/performance.test.mjs 当前提示组装 112–185ms 超 150ms 阈值（a3a 改走生产原生运行时后出现）。本卡改动提示组装路径，验收要求它回到阈值内，不放宽阈值。

## 测试（全部离线，用录制或桩模型，不调用付费 API）
- 新增 tests/turn-confirm.test.mjs：①普通请求产出含正确候选的列表，选择后引擎执行且参数来自引擎；②模型选不存在的引用/自填参数被拒；③创意意图（如"我用歌声安抚这头狼""把池水净化后卖掉"）候选中无匹配时走"都不是 → 开放提案"，玩家原意文本完整传入提案；④近似候选不得被当作创意意图的替代（桩模型选近似项时，系统如何防止——至少：候选必须带与原话的匹配依据，确认时校验；写明你的做法）；⑤回执投影不含 xxxVersion 等引擎字段。
- 现有回合契约、意图、路由、A3 相关测试全过（名字含 turn、intent、routing、a3-intent、a3-routing、consistency、generation、review 的测试文件逐个跑）。

## 可改
server-plugin/{action-constructor,action-affordances,consistency-service}.mjs，extension/{turn-contract,tools,generation}.mjs、extension/runtime.js，tools/{deepseek-client,playtest-runner,build-card}.mjs，prompt/{constitution,examples}.md，相应测试。新模块在 tools/arch-layers.mjs 归层、tools/system-map.mjs 登记。不改冻结语料（tests/fixtures/a3-intents*.json、tests/playtests/*.json）与 scorer；不改 docs/、dist/。

## 验收
上述新旧测试逐个单独进程全过（沙箱拦 spawn 用 --test-isolation=none）；performance、arch-metrics、system-map、CORE（engine/storage/plugin）全过；静态提示：
`node --input-type=module -e "import {loadPromptBundle} from './tools/build-card.mjs'; const b=await loadPromptBundle(); console.log('staticTokens='+b.budget.estimatedTokens); if(b.budget.estimatedTokens>10593)process.exitCode=1"`
另：用 logs/sessions/a3-playtest/contract2 里录下的失败回合（真实试玩失败.json 的 input 与 sceneBefore），离线统计新候选生成器对这些回合"正确动作是否在候选里"的命中率，以及每回合给模型的输入 token 估算（新/旧对比），写进汇报。

## 汇报（≤400 字）
实现要点（候选如何生成、选择函数 schema、都不是路径、近似项防护）、改了哪些文件、命令与 pass/fail、候选命中率与 token 对比、静态 token、提示组装耗时、偏离与未解决。
