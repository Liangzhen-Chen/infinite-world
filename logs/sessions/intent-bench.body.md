# 卡 intent-bench：离线对比"模型只做结构化意图解析 + 引擎校验"（只写脚本与空跑，不调用付费接口）

工作区 F:/dnd-wt/LLM1（分支 t-llm1，含 tools/candidate-replay.mjs 准确重放测量：28 会话、250 回合起点、161 可判回合）。先读 docs/产品原则.md 与 F:/dnd/logs/sessions/llm1b-candidates.final.md。

## 背景
引擎自己猜意思出候选只命中 37.3%（可直接确认 9.9%）。用户批准 ≤2 元离线对比：让懂语言的模型只做窄任务，引擎提供事实选项并校验。用户特别认为 Jev（TypeSafe System One 判断模型，只出 choice/score/noul，见下）可能比纯大模型更合适，需重点测。

## Jev 接口（已由主会话实测可用）
POST https://api.typesafe.ai/v1/systemone，Header Authorization: Bearer $TYPESAFE_API_KEY，body {model:'jev-1.14.0', state:<字符串或对象>, questions:{<id>:{type:'choice',instructions,criteria:{label:desc,...}}|{type:'noul',instructions,criteria?:{true,false}}|{type:'score',criteria:[...]}}}；choice 每题 1–255 个标签，每请求 1–128 题，state+最长题 ≤32k token，总 ≤64k；返回 answers[id].choice/probabilities/confidence 或 noul；usage.input_tokens；价格 $0.042/百万输入 token，输出免费。

## 要写 tools/intent-bench.mjs（复用 candidate-replay 的重放还原与判定口径）
对每个可判回合，基于还原的回合起点文档，引擎给出**事实选项集**（不猜意思）：当前可用动作族（来自动作目录 + 场景可执行性）、可去地点、在场人物、可交易物/库存、可学技能/老师、可做配方等，以及"都不是（开放提案）"。三种解析方式：
- **A. Jev**：state = 玩家原话 + 精简场景事实；一次请求多题：动作族 choice（含"都不是"）、各槽位 choice（选项来自上面的事实集，含"不涉及"）；如玩家一句含多步，增加"第 2 步动作族"题。用置信度阈值决定是否"没把握"。
- **B. DeepSeek flash**：非思考、strict 函数调用（tool_choice 指定函数），参数 enum 同上事实集，输出 1–3 步 {action, slots}；复用 tools/deepseek-client.mjs 的计费护栏。输入只含原话 + 精简事实（目标 ≤2k token），不含历史与长提示。
- **C. 混合**：先 A，置信度低于阈值的回合再走 B。
引擎校验：把解析结果映射为动作与参数，用与 candidate-replay 相同的判定（工具 + 关键参数）判命中；创意回合判是否进入"都不是"。

## 输出指标（按场景分组 + 总计）
命中率（第一步动作 + 关键参数全对）、多步回合的完整命中率、创意回合保留率、每回合平均输入 token、估算费用（元，DeepSeek 按其价格表：flash 输入未命中 2 元/百万、命中 0.04、输出 8；Jev 按 $0.042/百万 × 7.2）、每回合平均延迟（真实调用时记录）。

## 运行方式（必须实现）
- `--dry` 空跑：不发任何网络请求，打印每种方式的请求数、总输入 token 估算、预计费用；主会话据此确认不超 2 元。
- `--mode A|B|C --limit N`：真实调用；**费用硬上限**：累计估算费用（DeepSeek 用响应 usage 计，Jev 用 input_tokens 计）超过 `--budget` 元（默认 2）立即停止并写已完成部分。
- 密钥只从环境变量 DEEPSEEK_API_KEY（或 deepseek-client 现有约定）与 TYPESAFE_API_KEY 读取，不打印、不写文件。
- 结果写 F:/dnd/logs/sessions/intent-bench-<mode>.json。

## 本卡只做
写脚本 + 单元测试（tests/intent-bench.test.mjs：用桩响应验证映射与判定、预算硬停、--dry 不发请求）+ 跑 --dry 报数。**不得真实调用付费接口**（沙箱也不应有密钥）。不改游戏运行代码、不改冻结语料与 scorer。

## 汇报（≤300 字）
脚本用法、--dry 的请求数/token/预计费用（三种方式分别）、选项集如何从场景事实派生、多步与创意回合如何处理、测试 pass/fail、偏离。
