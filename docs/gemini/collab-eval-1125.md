# 《无限原野》AI 协作方案独立评估报告（2026-11-25 终稿）

- **评估角色**：独立评估者（Antigravity / Gemini，仅作方案评估并落盘本文，不改代码）
- **评估缘起**：
  - 亮圳 2026-11-25 15:28（伦敦）指示评估 AI 协作架构、层数边界、防信息失真机制、不同 AI 分工与模型族错开，以及 Claude 会员额度重置后的 Orca 落地与花法；
  - 15:29（伦敦）追加评估**拆卡粒度**与 **Sonnet 何时值得交给 DeepSeek** 的可执行判据（李白 `msg_2e8d188eeb77`）；
  - 18:13–18:19（伦敦）亮圳最终拍板定调：**拥有 Claude Ultra 会员、日常希望零额外现金支出；由主会话「靠实时可用额度派活」——Claude Ultra 额度充足时日常全走 Sonnet 主力，额度不足/告急时自动切回 DeepSeek 做写码主力；同时避免把全部审卡压给 Gemini 导致 Gemini 撞限**。
- **事实基线**：结合本仓实测（`CLAUDE.md`、`docs/派活卡头规矩.md`、`tools/dispatch/dispatch.mjs`、`tools/accept/lib/card-archive.mjs`、`docs/卡档案/_template/state.json`、`docs/gemini/daily/2026-11-25-audit.md`、本机 `orca` CLI 实测参数）及业界多智能体工程实证（Anthropic 2024–2025、Google Research / DeepMind `arXiv:2512.08296` 与 ADK 2025–2026、Cognition 2025–2026）。

---

## 核心结论（一屏先看）

1. **严格两层、绝不再加管理层**：`第 1 层：主会话（Claude Sonnet，只调度不写码） → 第 2 层：Orca 可见独立工作树会话/终端`。扩产能靠第 2 层横向并行（同时 2–3 条文件域不冲突的工作树），绝不纵向叠加“卷总监 / 模块组长”层级。
2. **核心调度总则：靠实时可用额度动态派活（双档自动切换）**：
   - **常态档（Claude Ultra 额度充足，零额外现金开销）**：日常写码全走 **`claude-sonnet`**（Orca 可见会话）+ 独立出题 **`claude-haiku`**（`test/<card>`）+ 独立审卡默认 **`claude-opus`（`--effort medium`）**；**Gemini（Antigravity）** 以每日全库独立审核为主阵地，仅在自身额度宽裕时分流 1–2 张关键/跨卷卡做跨厂商异构审卡（绝不把全部审卡压给 Gemini 防撞限）。此档是纯粹 2 层、零转派失真、DeepSeek 零花费。
   - **降级档（Claude Ultra 额度不足 / 逼近 5 小时或周上限）**：主会话自动切回 **DeepSeek (`deepseek-flash`) 做写码主力**（`tools/dispatch/dispatch.mjs` 挂在 Orca 可见终端），把剩余 Claude 额度集中留给主会话调度、出题与关键攻坚卡，确保研发不断档。
3. **用「传文件指针 + 死锁原文出处 + 机械原始输出」压住信息失真**：层间严禁口头转述，卡文写死 `卷:行` 原文、目标文件行号、公共部件与验收命令；交回只认 `git diff` 与未删改的命令退出码/输出；遇卷文矛盾或前置缺失立即停手写 `blocker`；审卡永远新开干净会话。
4. **拆卡按「完整可验证结果」切、严禁拆碎**：单卡固定流程税约 10–15 分钟、3–4 个会话，黄金体量应是 **1 个闭合功能/模块（约 150–800 行、3–10 同域文件，含入口接通与基线闭合）**，严禁拆出 <50 行半成品碎卡；平时全 Sonnet 档不瞎转派 DeepSeek，仅在降级/混跑遇到 **≥100 行或 ≥5 处同类改动 + 规格 100% 写死 + 可一键跑测** 的成批机械活时才叫 DeepSeek。
5. **切换落地前同步清 3 项规矩与工具对齐**：① 更新 `CLAUDE.md` 第 3 节与 `现行有效裁定.json` 为「按实时额度派活」新口径；② 统一 API 收据与 Orca 可见会话审计凭证；③ 修掉 Orca `dnd` 仓库的 `L-03` 雷区（`setup` 钩子由 `pnpm install` 改为 `npm ci --prefer-offline` 或留空）。

---

## 一、层级评估：现有两层够不够？要不要加层？

### 1.1 业界实证给出的硬边界

| 业界来源 | 核心实证结论 | 对《无限原野》的直接含义 |
|---|---|---|
| **Google Research / DeepMind & MIT**<br>*Towards a Science of Scaling Agent Systems* (`arXiv:2512.08296`, 2025.12 / v3 2026.04；180–260 组对照，含 SWE-bench Verified 与 Terminal-Bench) | ① 独立无监督多智能体把错误放大 **17.2×**，即使采用**中心化星型（主控+执行两层）**仍存在 **4.4×** 错误放大；<br>② 对**强顺序、强状态耦合**任务（PlanCraft），**所有**多智能体架构表现反而下降 **39%–70%**；<br>③ 单模型基线超过 **45%** 后，多智能体协调呈现显著边际递减甚至负收益（$\beta = -0.408, p < 0.001$）；工具密集型任务在固定预算下尤为吃亏。 | 写代码改共享引擎是典型的强状态耦合、工具密集任务。**星型两层已是错误放大与收益的上限**；再加第 3/4 层“中层经理”，错误会按跳数复利放大，收益为负。 |
| **Anthropic**<br>*Building effective AI agents* (2024.12) & *How we built our multi-agent research system* (2025.06) & *Context engineering* (2025.09) | ① 即使 Anthropic 自己面向宽广检索的生产研究系统，也严格保持**两层（Lead → 并行 Subagents）**，不搞递归多层树；<br>② 多智能体 token 消耗约为普通对话的 **15×**（单智能体约 **4×**），只适合**只读、可并行压缩**的高价值探索任务；<br>③ 调度者必须在派发前把计划写入外部持久记忆/文件，避免上下文截断失忆。 | 会员额度受 5 小时窗与周限约束。多加一层中间会话就会多烧一倍以上的上下文重复读取与协调 token，极快触发限流。 |
| **Cognition (Devin)**<br>*Don't Build Multi-Agents* (2025.06) & *Multi-Agents: What's Actually Working* (2026.04) | ① 写代码每一步都隐含架构与风格决策（Flappy Bird 冲突案例），把一个功能拆给多层或平行写者会导致全局不自洽；<br>② 2026 生产复盘确认：代码场景真正有效的多智能体只有三种——**单线程写者（一分支一写者）+ 干净上下文独立审校（Clean-Context Review Loop）+ 只读查证助手**。 | 完全吻合《无限原野》的三方分离（写码 / 出题 / 审卡各自独立工作树、干净上下文），而否定了“主会话 → 组长 → 写者”的层级传话模式。 |

### 1.2 对现状的诊断与明确裁断

- **结论 1：绝对不要再加任何管理/派活层（例如“卷总监”“模块组长”“子协调器”）**。
  - 《无限原野》的核心约束是 **29 卷设计文 + `contracts.json` + `entry-registry.json` + 严禁硬编码红线**的强一致性。每多一层中间 AI，就会把精确的 `卷:行` 规则压缩成一段走样的自然语言摘要。
  - 批量管理职能应当交给**外部确定性工具**——Git 分支、`state.json`、`card-archive.mjs`、CI、`entry-registry.json`、李白巡检。**用脚本和状态文件管规模，不要用更多 LLM 层级管 LLM**。
- **结论 2：不仅不加层，还要彻底压平到「严格 2 层」**。
  - **常态档（Ultra 额度充足）**：`主会话（Sonnet）→ 写码（Orca 可见 Sonnet 会话）`。**彻底去掉 Sonnet 再转派 DeepSeek 的第 3 跳**：零转述失真、代码一次过率更高、现金支出 0 元。
  - **降级档（Ultra 额度不足）**：常规卡由 `主会话 → DeepSeek API`（直接经 `dispatch.mjs` 跑在 Orca 可见终端，同样是严格 2 层）；仅极少数复杂耦合卡交 Sonnet 攻坚，且只有卡内遇到特大成批机械改动（满足第 5.2 节硬门槛）时才允许局部调一次 DeepSeek，**严禁 DeepSeek 再向下派活**。
- **结论 3：唯一该“加”的是横向能力，不是纵向层级**。
  - **横向并行**：主会话在同一时间并行推进 2–3 条文件域不重叠的工作树。
  - **侧翼监督（与派活链正交）**：李白（Grok Bot）做心跳巡检、阻塞叫醒与纯技术裁定；Gemini（Antigravity）做每日全库独立体检（以及额足时的关键卡异构复核）。

---

## 二、每多一层的信息失真风险与压制办法

### 2.1 五类具体失真风险（为什么多一层就会坏事）

| 失真类型 | 在多层交接里怎么发生 | 本项目已发生或极易发生的后果 |
|---|---|---|
| **1. 约束蒸发**<br>*(Constraint Evaporation)* | 上层转述时保留了“功能目标”，但顺手省掉了负面红线（不许硬编码、特殊值 `0/null/不限` 不得绕过、必须调公共部件）。Google ADK 工程文档专门警示协调器概括 prompt 最常丢约束。 | 下层写出能跑通 demo 但按 ID 分支写死、绕开公共部件的代码，审卡整轮打回重做。 |
| **2. 隐式决策断层**<br>*(Implicit Decision Drift)* | 中间层只把接口大意口头告诉下层，没传 `contracts.json`、真实依赖文件片段或前序设计取舍（Cognition Flappy Bird 效应）。 | 新写模块和主线入口接不上，或像此前 `chore/new-skeleton` 漏并 `L-17` 一样直接撞 `pre_commit`。 |
| **3. 出处漂移与幻觉叠加**<br>*(Citation & Spec Drift)* | 原文 `卷X:行Y` 经一层概括成“按卷 X 做法”，再经一层被脑补补全；遇到“卷文未写/矛盾”时，中间层出于讨好倾向自动编一个“合理实现”糊弄过去。 | 违背《无限原野》“照卷文写，不自补；矛盾即停报”铁律，错误以 4.4×+ 速度渗入主线。 |
| **4. 回报美颜失真**<br>*(Self-Report Compression)* | 下层把部分失败、未跑全量、跳过用例浓缩成“主体已完成，测试通过”，上层只看总结不再核原始输出。 | 重演历史 `Z-6` 教训（自查表填「是」却备注未跑），把红灯隐患带到合入前才爆发。 |
| **5. 基线版本漂移**<br>*(Stale Spec / State Skew)* | 多层串行排队耗时拉长期间，`origin/master`、`现行有效裁定.json` 或 `entry-registry.json` 已推进，下层仍在旧摘要上写代码。 | 合并时大面积冲突，或实现内容与刚落地的最新裁定冲突。 |

### 2.2 六条硬压制机制（「传文件不传转述、认原件不认总结」）

1. **卡文钉死「四件套原件」，禁止二次改写**：
   - 主会话写进 `docs/卡档案/<card>/派卡.md` 的四样必须全是**原文与精确指针**：① 逐字摘录的设计卷原文（带 `卷:行`）；② 目标改动 `文件:行` 或导出签名；③ 必须调用的公共部件（文件路径 + 导出名）；④ 可直接复制执行的验收命令与期望判据。
2. **层间只传「仓库文件路径 + 短信号」，严禁气泡长文转述**：
   - `orca orchestration send` 与 `--prompt` 只负责指路（如“读 `docs/卡档案/<card>/派卡.md` 与 `state.json`，按规矩在当前分支执行”），**不把需求在消息里重写一遍**。所有上下文以 Git 仓库内文件为唯一真相源（Pass-by-Reference），避免转抄走样，也天然抗主会话 `/compact` 失忆。
3. **交回必须附「原始机械输出」，零信任自然语言汇报**：
   - 任何写码/出题/审卡节点交回时，结论必须落盘并附三样原始证据：① `git rev-parse HEAD` 与 `git diff --stat`；② 验收/类型检查/门禁命令全文 + **未删改的原始退出码与输出末段**；③ 变动文件与行号清单。
   - 主会话只信 `git diff`、CI/单测退出码与审卡清单，不以子会话一句“已修好”作为合入依据。
4. **`state.json` 钉死基线提交 SHA（防版本漂移）**：
   - 复用现有 `docs/卡档案/_template/state.json`，增记 `baseCommit`（切分支时的 `origin/master` SHA）与 `sessionRef`（Orca 会话/终端标识）。合入前若 `origin/master` 改动了本卡依赖的契约/数据表，机械触发 rebase + 重跑验收，杜绝旧图施工。
5. **矛盾与缺前置强制熔断（Fail-Closed）**：
   - 任何执行层一旦遇到“卷文未找到/矛盾、依赖前置不存在、同一测试连修 2 轮不过”，**立刻停手**，把原始报错与冲突 `卷:行` 写进 `state.json.blocker` 交回主会话，禁止脑补绕过；涉及纯技术交李白裁、涉及产品方向按 `K1125-ESC` 标「产品拍板」转亮圳。
6. **物理隔离 + 零历史上下文审卡（防观点传染）**：
   - 写码分支（`feat/<card>`）与出题分支（`test/<card>`）物理隔离；**审卡永远新开干净会话**，只看「设计原文 + `git diff` + 验收测试原始运行结果」，**绝不把写码会话的聊天记录喂给审卡方**，彻底切断写码者的自我合理化偏见。

---

## 三、不同 AI 的分工与模型族错开（按额度双档动态切换）

### 3.1 必须先核对的现有门禁约束（代码实测）

`tools/accept/lib/card-archive.mjs:16-29, 289-298` 已实装三方模型族归一化硬核：

```js
// tools/accept/lib/card-archive.mjs:16-22
export const MODEL_FAMILIES = [
  ['deepseek', 'deepseek'],
  ['haiku', 'claude-haiku'],
  ['sonnet', 'claude-sonnet'],
  ['opus', 'claude-opus'],
  ['gemini', 'gemini'],
];
```

- 门禁硬规则：`写码` 模型族集合 $W$、`出题` 模型族集合 $T$、`审卡` 模型族集合 $R$ 必须满足 **$W \cap T = \varnothing$ 且 $R \cap (W \cup T) = \varnothing$**。
- **隐形代码细节**：若某卡在降级混跑时写码栏写成 `claude-sonnet + deepseek-flash`，`modelFamilies()` 会同时提取出 **`['deepseek', 'claude-sonnet']`** 两个族，此时出题与审卡不得再用 `deepseek` 或 `claude-sonnet`，只能配 `claude-haiku` + `claude-opus`（或 `gemini`）。

### 3.2 双档分工总表（靠当前可用额度派活）

| 角色 | 常态档（Claude Ultra 额度充足·零额外花钱） | 降级档（Claude Ultra 额度不足/告急） | 职责与边界 |
|---|---|---|---|
| **总调度（主会话）** | **Claude Sonnet**（Orca `main-session`） | **Claude Sonnet**（最省额模式：严禁读大文件、多用 `rg`） | 拆卡、核前置与闭包、先查额度再选档、落盘 `派卡.md`/`state.json`、读 diff 合入；**绝不亲自写业务代码**。 |
| **写码（`feat/<card>`）** | **全量 `claude-sonnet`**（Orca 可见会话，`--effort medium`） | **主力 `deepseek-flash`**（`dispatch.mjs` 挂 Orca 可见终端，覆盖 70%–80% 卡）；仅 20%–30% 强耦合/L0 卡留给 `claude-sonnet` | 常态档 0 额外花钱、0 转派失真；额度吃紧时立刻切 DeepSeek 顶住日常产出，不卡研发进度。 |
| **独立出题（`test/<card>`）** | **`claude-haiku`**（Orca 可见会话，`--effort medium`） | **`claude-haiku`**（Ultra 极省额；若 Ultra 彻底耗尽则由 `dispatch.mjs` 走 API 或冷备） | 物理隔离不看 `feat/<card>`，只照 `卷:行` 与 `contracts.json` 写黑盒行为验收测试。 |
| **独立审卡（全新干净会话）** | **默认 `claude-opus`（`--effort medium`）**<br>*(关键/跨卷卡在 Gemini 额足时可分流 1–2 张/天给 Gemini，不强求)* | **DeepSeek 写码卡 → `claude-sonnet`**（或 Gemini）；<br>**Sonnet 写码卡 → `gemini` 或 `claude-opus`** | 绝不复用写码或旧审卡会话；审卡只看 `派卡.md` + `git diff` + 验收原始输出；判「必须改」复核轮必开新会话。 |
| **每日全库独立审核** | **Gemini (Antigravity)** | **Gemini (Antigravity)** | 每日 1 次跨卡全局体检（门禁真生效、方向防偏移、架构防回潮）；**优先保证每日全库审核的 Gemini 额度，不因单卡审卡透支 Gemini**。 |
| **监工 / 巡检 / 裁定分流** | **李白 (Grok Bot)** | **李白 (Grok Bot)** | 第 4 模型族（xAI），读快照/看板/信箱，叫醒卡死会话、裁纯技术问题、转「产品拍板」给亮圳。 |

### 3.3 三方模型族错开矩阵（全部 100% 过 `card-archive.mjs` 硬核）

| 运行档位 / 卡类 | 写码（`feat/<card>`） | 出题（`test/<card>`） | 审卡（干净新会话） | 模型族校验结果 | 现金额外支出 |
|---|---|---|---|---|---|
| **常态档·默认卡（主力）** | `claude-sonnet` | `claude-haiku` | `claude-opus` (`medium`) | `{claude-sonnet}` / `{claude-haiku}` / `{claude-opus}` 全互异 ✓ | **0 元**（全 Ultra 闭环） |
| **常态档·关键/跨卷卡（Gemini 额足可选）** | `claude-sonnet` | `claude-haiku` | `gemini` (Antigravity) | `{claude-sonnet}` / `{claude-haiku}` / `{gemini}` 全互异 ✓ | **0 元**（跨厂商异构 + 省 Opus 额） |
| **降级档·常规卡（70–80%）** | `deepseek-flash` | `claude-haiku` | `claude-sonnet` | `{deepseek}` / `{claude-haiku}` / `{claude-sonnet}` 全互异 ✓ | 仅 DeepSeek 极低费用 |
| **降级档·高危/耦合卡（20–30%）** | `claude-sonnet` *(超阈可借 `deepseek`)* | `claude-haiku` | `gemini` 或 `claude-opus` | `{claude-sonnet[,deepseek]}` / `{claude-haiku}` / `{gemini\|claude-opus}` 全互异 ✓ | 极低（保质量不断档） |

---

## 四、推荐落地架构：靠额度派活与 Orca 操作流

### 4.1 总体拓扑图（严格扁平两层 + 额度开关 + 双侧翼）

```text
                       ┌──────────────────────┐
                       │  亮圳（产品拍板）    │
                       └──────────┬───────────┘
                                  │ （仅产品方向/大闸门）
                       ┌──────────▼───────────┐       ┌──────────────────────────┐
                       │ 李白 Grok Bot（监工） │◄─────►│ Gemini Antigravity       │
                       │ 巡检 / 叫醒 / 裁技术  │       │ 主责每日全库体检         │
                       └──────────┬───────────┘       │ (额足时可选分流关键审卡) │
                                  │ 读快照 / orchestration        ▲
┌─────────────────────────────────▼───────────────────────────────┴─────────────┐
│  第 1 层：主会话（Claude Sonnet · Orca `main-session` 工作树）                 │
│  派卡前必做：① 核前置/闭包 → ② 看当前 Claude Ultra 额度 → ③ 选常态档或降级档   │
└───────────────┬──────────────────────────────────────────┬────────────────────┘
                │                                          │
    [Ultra 额度充足 → 常态档·零额外花钱]       [Ultra 额度不足/受限 → 降级档·DS 主力]
                ▼                                          ▼
┌───────────────────────────────┐          ┌────────────────────────────────────┐
│ 写码 `feat/<card>`            │          │ 写码 `feat/<card>`                 │
│ Orca 可见 Claude Sonnet 会话  │          │ Orca 可见终端跑 `dispatch.mjs`     │
│ (`--model sonnet --effort med`)│         │ (`--model deepseek-flash`)         │
└───────────────┬───────────────┘          └──────────────────┬─────────────────┘
                │           ┌──────────────────────────┐      │
                │           │ 平行独立出题 `test/<card>`│      │
                │           │ Orca `claude --model haiku`      │
                │           └─────────────┬────────────┘      │
                └─────────────────────────┼───────────────────┘
                                          ▼
        ┌──────────────────────────────────────────────────────────┐
        │ 干净上下文审卡（全新会话，绝不复用旧会话）               │
        │ 常态档：默认 Opus (medium) / 关键卡额足时可选 Gemini     │
        │ 降级档：DS 卡用 Sonnet 审 / Sonnet 卡用 Gemini 或 Opus 审│
        └─────────────────────────────────┬────────────────────────┘
                                          ▼
        ┌──────────────────────────────────────────────────────────┐
        │ 硬机械门禁：.githooks + tsc --checkJs + CI + 零 mock E2E │
        └──────────────────────────────────────────────────────────┘
```

### 4.2 主会话「靠额度派活」硬切换表（每次立卡前 10 秒判定）

| 当前 Claude Ultra 实时额度状态 | 主会话应选档位 | 写码主力 | 审卡主力 | 说明 |
|---|---|---|---|---|
| **充裕**（5 小时窗未告警、周额余量充足、无需省着用） | **常态档（全 Ultra）** | **`claude-sonnet`**（全部卡） | **`claude-opus` (`medium`)**；每日最多分流 1–2 张关键卡给 Gemini（视 Gemini 余量） | 零额外现金开销，质量最高、零转派失真；同时严控 Claude 并发 ≤ 3–4 会话防打爆 5 小时窗。 |
| **紧张 / 告急 / 未重置空仓**（接近 5 小时限流、周额预警 ≥75%、或会员额暂时不可用/受限） | **降级档（DeepSeek 主力）** | **`deepseek-flash`**（70%–80% 卡直派，仅极难卡留 Sonnet） | DS 卡给 `sonnet`（或 Gemini）；Sonnet 卡给 Gemini / `opus` | 自动无缝切到 DeepSeek 扛日常写码，绝不因 Claude 额度不足停工，也不强烧稀缺额度。 |
| **Gemini 额度紧张时** | 任意档位均适用 | 不变 | **全部审卡切回 Claude（Opus/Sonnet）** | 永远优先保留 Gemini 每日 1 次全库独立审核额度；单卡审卡绝不依赖 Gemini 作为唯一通道。 |

### 4.3 在 Orca 里的标准落地命令（实测可用参数）

> **实测前置提醒（必做）**：本机 `orca repo list --json` 显示 `dnd` 仓库的 `setup` 钩子目前仍为 `pnpm install`（`L-03`）。**全面切到 Orca 可见工作树前，务必先在 Orca 仓库设置把 `setup` 改为 `npm ci --prefer-offline` 或置空**；在此之前，每条 `orca worktree create` 必须显式带 `--setup skip`。

#### 1. 立卡与落盘（主会话在 `main-session` 完成）
- 先生成 `docs/卡档案/<card>/派卡.md`（含四件套原件与 `三方标识`）与 `docs/卡档案/<card>/state.json`（含 `baseCommit`、`branches`、`parties`），提交或推送使各工作树按文件读取。

#### 2. 派发「写码」（按实时额度二选一）
- **常态档（Claude Ultra 充足 → 全走 `claude-sonnet` 可见会话）**：
  ```powershell
  orca worktree create --branch feat/<card> --base-branch origin/master --setup skip --agent claude --model sonnet --effort medium --comment "CODE|<card>|claude-sonnet" --prompt "你是本卡写码方。只读 docs/卡档案/<card>/派卡.md 并严格按其中卷:行原文、目标文件、公共部件与验收命令执行；禁止口头转述，完结时把 commit SHA 与原始命令输出写入开发.md/反思.md 与 state.json，再用 orca orchestration send 报主会话。若遇卷文矛盾或前置缺失，立即停手写 blocker。" --json
  ```
  *(返工/重开改用 `orca agent launch --agent claude --worktree branch:feat/<card> --model sonnet --effort medium --prompt "..." --json`。)*
- **降级档（Claude Ultra 不足 → `deepseek-flash` 做写码主力，挂 Orca 可见终端）**：
  ```powershell
  orca worktree create --branch feat/<card> --base-branch origin/master --setup skip --comment "CODE|<card>|deepseek-flash" --json
  orca terminal create --worktree branch:feat/<card> --title "CODE|<card>|ds" --keep-open --command "node tools/dispatch/dispatch.mjs --model deepseek-flash --wd . --card docs/卡档案/<card>/派卡.md --purpose code" --json
  ```

#### 3. 平行派发「独立出题」（物理隔离在 `test/<card>`，走 `claude-haiku`）
```powershell
orca worktree create --branch test/<card> --base-branch origin/master --setup skip --agent claude --model haiku --effort medium --comment "TEST|<card>|claude-haiku" --prompt "你是本卡独立出题方。严禁查看 feat/<card> 分支代码；只读 docs/卡档案/<card>/派卡.md 所列卷:行原文与 contracts.json，在 tests/acceptance/<card>/ 编写黑盒行为验收测试与出题.md，提交后用 orca orchestration send --type worker_done 回报主会话。" --json
```

#### 4. 派发「干净上下文审卡」（绝不复用旧会话）
- **常态档默认（Opus `medium` 审卡；降级档 DS 卡可换 `--model sonnet`）**：
  ```powershell
  orca agent launch --agent claude --worktree branch:feat/<card> --model opus --effort medium --prompt "你是本卡独立审卡方（全新上下文）。严禁采信口头总结；请直接运行 git diff origin/master...HEAD 与验收测试（拉取 test/<card> 测试跑原始结果），逐项核对北极星、严禁硬编码、公共部件与卷:行原文，写审查.md 并回报主会话。" --json
  ```
- **可选跨厂商异构审卡（仅关键/跨卷卡且 Gemini 额足，每天 ≤1–2 张）**：
  - 经 `orca agent launch --agent antigravity --worktree branch:feat/<card> ...` 或通知 Antigravity 席位直接审 diff 与验收原始输出；若 Gemini 额紧直接走上条 Opus 命令，零阻塞。
- **必须改的复核轮**：写码方修完后，**新开**一次 `orca agent launch`（新会话 ID，记入 `派卡.md` 三方标识审卡新一轮），绝不在旧审卡会话里接着聊。

#### 5. 回报、看板与回收（防遗忘、防积压）
- **结构化回报**：子会话完结统一发 `orca orchestration send --type worker_done --outcome succeeded --report-path docs/卡档案/<card>/state.json --files-modified "..." --subject "<card> 写码完成"`。
- **完结即清理**：合入 `master` 且 CI 绿灯后，立刻关闭子会话并清理已合工作树（防工作树积压）。

### 4.4 保额硬纪律（防 Claude 5 小时短窗 + 防 Gemini 透支）

1. **全线默认 `--effort medium`**：无论写码（Sonnet）、出题（Haiku）还是审卡（Opus），默认 `medium` 档；只有极难 L0 内核/并发死锁才临时升 `high`。
2. **严控 Claude 同时活跃并发 ≤ 3–4 个会话**（主会话 1 + 最多 2–3 个写码/出题/审卡子会话）：这是防止 Ultra 虽周额充裕却在 1–2 小时内打爆 **5 小时滑动窗口** 的最关键闸门。
3. **一卡一会话、完即关，不养“长寿胖会话”**：长会话每多一轮都重复计费全量历史上下文；单卡单会话既防审卡偏见，又省 50%+ 重复输入。
4. **能用机械脚本绝不问 LLM**：查依赖闭包、全仓引用、类型错误、基线违例一律跑 `rg`、`npx tsc --noEmit`、`node tools/accept/run.mjs`。
5. **保护 Gemini 额度红线**：Gemini 优先保 **每日 1 次全库独立审核**；单卡审卡只是“关键卡可选加分项”，每天不超过 1–2 张，绝不让全部单卡排队等 Gemini。

---

## 五、卡的粒度与 Sonnet → DeepSeek 委派判据（回应 15:29 追加）

> **亮圳 15:29 痛点切中要害**：在本项目的三方分离 + 独立工作树 + 卡档案 + 审卡合入流程下，**每立一张卡都有固定“流程税”（约 10–15 分钟、3–4 个会话、2 棵工作树与全套建档/合入）**。如果把卡拆得太碎，流程税比干活本身大 5–10 倍，既显得“不知道在拆什么”，又必然导致 Sonnet 看着手里几十行小活根本不值当再写 prompt 叫 DeepSeek。

### 5.1 一张卡多大才合理？（按「完整可验证结果」切，不按「零碎步骤」切）

核心原则：**一卡一闭合结果，不拆半成品、不拆动作步骤**。每张卡合入 `master` 后，仓库必须立刻处于**自洽绿灯态**，且游戏或门禁实打实多出一个**有真实消费者、可黑盒验收的完整能力**。

#### 1. 拆卡粒度红黄绿三区标尺（主会话立卡前 30 秒硬对照）

| 分区 | 体量与特征 | 典型反例 / 正例 | 处理规则 |
|---|---|---|---|
| **过碎（红区·禁止立卡）** | ① 有效代码/数据改动 **< ~50 行**，或仅改 1 个小函数 / 1 条数据 / 1 个配置文件；<br>② 合入后**无独立可观测行为变化**或无真实生产调用者（纯中间半成品）；<br>③ Sonnet 自己 3–5 分钟能写完自测，流程税远大于写码本身。 | ❌ 反例：把“燕麦粥/卖柴/盐”各拆 1 卡（违背 `AGENTS.md` 红线）；<br>❌ 反例：把 `L-15` 换新骨架和 `L-17` 锁基线拆成两卡，致 `chore/new-skeleton` 撞 `pre_commit` 交不上去；<br>❌ 反例：拆成“卡 1 写函数、卡 2 接入口、卡 3 补单测”。 | **一律拒拆**，合并进所属功能卡或同域加固卡。*（唯一例外：P0 线上/门禁阻断紧急止血小修。）* |
| **黄金粒度（绿区·标准单卡）** | ① **语义完整**：1 个竖切片、1 个独立子系统/模块（数据表 + 规则实现 + 接通生产入口 + 基线/登记表同步），或 1 批同类规则/检测器一次补齐；<br>② **体量参考**：有效改动约 **150–800 行**、涉及 **3–10 个紧密相关文件**（同一业务域）；<br>③ **验收闭合**：能用 **1 组独立黑盒验收测试**判对错，合入不留半吊子尾巴；<br>④ **耗时参考**：写码方单会话 **15–45 分钟** 内连写带自测闭合。 | ✅ 正例：`L-04 + L-05`（`typescript` + `jsconfig` + `ci.yml` 一次建完跑绿）；<br>✅ 正例：`L-09` 六项检测器加固同域一卡收口；<br>✅ 正例：`L-15 + L-16 + L-17 + L-18` 新骨架 + 清旧测 + 锁基线 + E2E 烟测桩一次闭合；<br>✅ 正例：一个完整玩法切片（如“基础交易：数据表 + 价格派生 + 提案事务 + 菜单入口 + E2E 存档一致”）。 | **标准立卡**：按主会话实时额度选档派发（常态全 Sonnet，额度不足走 DeepSeek 主力）。 |
| **过大（黄/红区·必须切分）** | ① 横跨 **≥2 个无强耦合的玩法子系统**或 **≥3 卷独立业务域**；<br>② 预估有效改动 **> 1,200 行** 或涉及 **> 15 个跨模块文件**，单会话上下文装不下完整规格、审卡无法逐行核 diff；<br>③ 验收需拆成多组互不相关的黑盒测试套。 | ❌ 反例：把“九省气候烘焙 + 全市场撮合 + NPC 日常 AI + 浏览器前端”塞进 1 张卡。 | 按**自然竖切片边界**拆成 2–3 张绿区卡，每张卡仍须各自闭合、各自带真实入口与验收。 |

#### 2. 拆卡防碎三条硬检查（主会话落盘 `派卡.md` 前必核）
1. **同因必同卡**：凡改完 A 必然触发门禁/基线/登记表/既有测试报错的配套改动，**强制绑在同一张卡里闭合**，严禁人为拆成两张卡互相卡死。
2. **同类必同卡**：同一类规则漏洞、同一批同类检测器加固、同一类数据表补齐，合并成一张卡按规则层一次覆盖，禁止“补一件立一卡”。
3. **有消费才成卡**：除纯基础设施/CI 卡外，任何业务卡若无法写出一句话回答“合入后玩家/生产入口多了什么可验证结果”，就是零碎步骤，**禁止立卡**。

---

### 5.2 什么样的活值得 Sonnet 交给 DeepSeek？什么样的不值得？

结合亮圳最新定调，先看大前提：
- **在常态档（Claude Ultra 额度充足）**：为了零额外现金支出、零层间失真，**默认 Sonnet 一口气把整张卡写完，不主动外包 DeepSeek**。
- **在降级档（Claude Ultra 额度不足 / 需要省 Claude 额度）**：
  - **路径 1（优先，主会话直派）**：整张绿区卡（150–800 行）规格已经写死的，**主会话直接派 DeepSeek API**，压根不经过 Sonnet。
  - **路径 2（仅在 Sonnet 攻坚卡内部）**：转派一次 DeepSeek 有约 **3–5 分钟固定摩擦成本**（写小卡 + 跑 `dispatch.mjs` + 等返回 + 复核 diff），**只有同时满足下面 4 条硬判据时才值得叫 DeepSeek**，否则 Sonnet 自己写完更快更稳：

| 判据维度 | ✅ **值得 Sonnet 交给 DeepSeek（可派）** | ❌ **不值得，Sonnet 直接自己写（禁止硬派）** |
|---|---|---|
| **1. 体量过盈亏线** | 该子任务有效改动 **≥ 100 行**，**或**需机械修改 **≥ 5 个文件 / ≥ 15 条同类数据或调用点**。 | 改动 **< 80 行**、**或**只改 **1–3 个文件**（Sonnet 2 分钟写完，写小卡字数快赶上代码本身）。 |
| **2. 规格 100% 写死** | 输入/输出形状、公式、数据表 schema、目标 `文件:行`、公共部件名与参考样例**已全部确定**，只需照图铺开。 | 需求或接口还在探索、根因未定位、需要边读代码边试错调整设计方案。 |
| **3. 属于成批/重复/样板活** | ① 按 schema 批量补几十行世界数据表/规则表；② 全仓批量替换/迁移同类旧 API 调用点；③ 按统一样板补齐大批边界单测/JSDoc 类型注释；④ 规格完全独立的纯函数模块。 | ① L0 核心事务/调度器/并发状态机；② 需同时权衡 4–5 个文件隐式约束的精细耦合改动（交给 DeepSeek 易漏一处致返工两轮）。 |
| **4. 验收可一键机械判对错** | 跑一条现成命令（`node --test ...`、`npx tsc --noEmit`、schema 校验）10 秒内直接出 pass/fail，Sonnet 只需抽查 diff。 | 必须靠人逐行语义推演才能判断对错的微妙业务边界。 |

---

## 六、规则与工具对齐清单（避免新旧规矩打架）

1. **更新 `CLAUDE.md` 第 3 节与 `现行有效裁定.json`**：
   - 将 11-24 临时条款「严禁把会员额度花在写码、出题、审卡」替换为亮圳 11-25 拍板新口径：「**靠实时可用会员额度动态派活**——Claude Ultra 额度充足时日常全走 Orca 可见会员会话（Sonnet 写 + Haiku 出题 + Opus `medium` 审，Gemini 主责每日全库审核、额足时可选分流关键审卡，零额外花钱）；Ultra 额度不足/受限时自动切回 DeepSeek (`deepseek-flash`) API 作写码主力（`dispatch.mjs` 挂 Orca 可见终端）。保留主会话只调度不写码、独立工作树可见可追查、三方模型族互异铁律。」
2. **对齐 `L-06`/`L-07` 审计收据口径**：
   - DeepSeek API 卡继续签发 `dispatch.mjs` 收据；Orca 可见 Claude 会话卡改为在 `state.json` 中记录 `orcaWorktreeId`、`sessionHandle/transcriptUri` 与 `commitSha` 作为等效审计凭证，避免 CI 收据检查误杀会员会话。
3. **立即修掉 `L-03`（Orca `dnd` 仓库 `setup` 钩子）**：
   - 在 Orca 把 `dnd` 的 `setup` 脚本从 `pnpm install` 改成 `npm ci --prefer-offline`（或留空），彻底消除每次开可见工作树忘加 `--setup skip` 报错的隐患。

---

## 参考依据

- **仓库内实证**：`CLAUDE.md:16-28`、`docs/派活卡头规矩.md:43-55, 135-137`、`tools/dispatch/dispatch.mjs:66-101`、`tools/accept/lib/card-archive.mjs:16-29, 289-298`、`docs/卡档案/_template/state.json`、`docs/gemini/daily/2026-11-25-audit.md:75-107`、本机 `orca agent launch / worktree create / terminal create / orchestration send --help` 实测。
- **业界工程文献**：
  - Anthropic, *Building effective AI agents* (Dec 2024), *How we built our multi-agent research system* (June 2025), *Effective context engineering for AI agents* (Sept 2025).
  - Yubin Kim, Xin Liu et al. (Google Research, Google DeepMind, MIT), *Towards a Science of Scaling Agent Systems* (`arXiv:2512.08296`, Dec 2025; v3 Apr 2026) & Google ADK Multi-Agent Context Engineering Guides (Dec 2025).
  - Walden Yan (Cognition), *Don't Build Multi-Agents* (June 2025) & *Multi-Agents: What's Actually Working* (Apr 2026).
