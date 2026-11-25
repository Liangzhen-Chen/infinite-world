# 《无限原野》AI 协作方案独立评估报告（2026-11-25）

- **评估角色**：独立评估者（Antigravity / Gemini，仅作方案评估并落盘本文，不改代码）
- **评估缘起**：亮圳 2026-11-25 15:28（伦敦）指示评估 AI 协作架构、层数边界、防信息失真机制、不同 AI 分工与模型族错开，以及 **11-26 周四早上 Claude 会员额度重置后**在 Orca 内的落地方式与额度花法。
- **事实基线**：结合本仓实测（`CLAUDE.md`、`docs/派活卡头规矩.md`、`tools/dispatch/dispatch.mjs`、`tools/accept/lib/card-archive.mjs`、`docs/卡档案/_template/state.json`、`docs/gemini/daily/2026-11-25-audit.md`、本机 `orca` CLI 实测参数）及业界多智能体工程实证（Anthropic 2024–2025、Google Research / DeepMind `arXiv:2512.08296` 与 ADK 2025–2026、Cognition 2025–2026）。

---

## 核心结论（一屏先看）

1. **绝不再加管理层；不仅够用，反而要把「主会话 → Sonnet → DeepSeek」压平为「严格 2 层为主、仅难卡允许 2.5 层机械外包」**：
   - 70%–80% 边界清晰的小卡：**主会话直派 DeepSeek API**（严格 2 层，跳过 Sonnet 中间人，既省 Claude 会员额又少一跳信息失真）。
   - 20%–30% 复杂耦合/内核难卡：**主会话派 Orca 可见 Sonnet 会话**（2 层）；Sonnet 只把大段机械改动当作“零温工具”调用 `dispatch.mjs --model deepseek-flash`，且**禁止 DeepSeek 再向下派活**。
   - 扩产能靠**第 2 层横向并行（同时跑 2–3 条不冲突工作树）**，绝不靠纵向叠“卷总监 / 模块组长”层级。
2. **用「传文件指针 + 死锁原文出处 + 机械原始证据回传」压住失真**：层间严禁口头转述，只传仓库内文件与 `卷:行` 原文，回报只认 `git diff` 与原始命令退出码/输出，不认自然语言自夸。
3. **跨厂商错开模型族 + 兼容现有门禁**：主力组合是 **DeepSeek（大量写码）+ Claude Haiku（独立出题）+ Claude Sonnet（调度/难卡写码/常规审卡）+ Gemini（每日全库审 + 难卡异构审卡）+ 李白 Grok（监工巡检）**；`Opus` 严格留作极少数 L0 内核卡的最后王牌，守住周四重置后的会员周额。
4. **11-26 重置前必须先清 2 个前置坑**：① 修正 `CLAUDE.md` 第 3 节与 `K1125-P4` 口径（解除 11-24“禁会员额跑子任务”临时条款，改记 Orca 会话审计轨）；② 修掉 Orca `dnd` 仓库的 `L-03` 雷区（把 `setup` 钩子从 `pnpm install` 改成 `npm ci --prefer-offline` 或空），避免开 Claude 可见工作树时反复踩坑。

---

## 一、层级评估：现有两层够不够？要不要加层？

### 1.1 业界实证给出的硬边界

| 业界来源 | 核心实证结论 | 对《无限原野》的直接含义 |
|---|---|---|
| **Google Research / DeepMind & MIT**<br>*Towards a Science of Scaling Agent Systems* (`arXiv:2512.08296`, 2025.12 / v3 2026.04；180–260 组对照，含 SWE-bench Verified 与 Terminal-Bench) | ① 独立无监督多智能体把错误放大 **17.2×**，即使采用**中心化星型（主控+执行两层）**仍存在 **4.4×** 错误放大；<br>② 对**强顺序、强状态耦合**任务（PlanCraft），**所有**多智能体架构表现反而下降 **39%–70%**；<br>③ 单模型基线超过 **45%** 后，多智能体协调呈现显著边际递减甚至负收益（$\beta = -0.408, p < 0.001$）；工具密集型任务在固定预算下尤为吃亏。 | 写代码改共享引擎是典型的强状态耦合、工具密集任务。**星型两层已是错误放大与收益的上限**；再加第 3/4 层“中层经理”，错误会按跳数复利放大，收益为负。 |
| **Anthropic**<br>*Building effective AI agents* (2024.12) & *How we built our multi-agent research system* (2025.06) & *Context engineering* (2025.09) | ① 即使 Anthropic 自己面向宽广检索的生产研究系统，也严格保持**两层（Lead → 并行 Subagents）**，不搞递归多层树；<br>② 多智能体 token 消耗约为普通对话的 **15×**（单智能体约 **4×**），只适合**只读、可并行压缩**的高价值探索任务；<br>③ 调度者必须在派发前把计划写入外部持久记忆/文件，避免上下文截断失忆。 | 会员额度是硬预算。多加一层中间会话就会多烧一倍以上的上下文重复读取与协调 token，极快撞上 Claude 5 小时窗与周上限。 |
| **Cognition (Devin)**<br>*Don't Build Multi-Agents* (2025.06) & *Multi-Agents: What's Actually Working* (2026.04) | ① 写代码每一步都隐含架构与风格决策（Flappy Bird 冲突案例），把一个功能拆给多层或平行写者会导致全局不自洽；<br>② 2026 生产复盘确认：代码场景真正有效的多智能体只有三种——**单线程写者（一分支一写者）+ 干净上下文独立审校（Clean-Context Review Loop）+ 只读查证助手**。 | 完全吻合《无限原野》的三方分离（写码 / 出题 / 审卡各自独立工作树、干净上下文），而否定了“主会话 → 组长 → 写者”的层级传话模式。 |

### 1.2 对现状的诊断与明确裁断

先厘清一个容易被低估的事实：目前的「主会话 → Sonnet 卡会话 → Sonnet 自调 DeepSeek」表面叫“两层”，**在信息传递上实际已经是 3 跳**（亮圳/卷文 → 主会话 → Sonnet 卡会话 → DeepSeek）。

- **结论 1：绝对不要再加任何管理/派活层（例如“卷总监”“模块组长”“子协调器”）**。
  - **为什么不加**：
    1. 《无限原野》的核心难点不是“人手不够要多几级官”，而是 **29 卷设计文 + `contracts.json` + `entry-registry.json` + 严禁硬编码红线**的强一致性约束。每多一层中间 AI，就会把精确的 `卷:行` 规则压缩成一段容易走样的自然语言摘要。
    2. 仓库先前已验证过：DeepSeek 写错往往不是不会写，而是**卡文四要素没给清**（亮圳 11-22 原话：“就是你们 prompt 写不清楚”，见 `docs/派活卡头规矩.md:49`）。加一层只会让 prompt 经过两次转写，更模糊、更慢、更费 Claude 额度。
    3. 本项目已有**外部确定性工具**承担“批量管理”职能——Git 分支、`state.json`、`card-archive.mjs`、CI、`entry-registry.json`、李白巡检。**用确定性脚本和状态文件管规模，不要用更多 LLM 层级管 LLM**。
- **结论 2：不仅不加层，还要把“Sonnet 再调 DeepSeek”从常态降格为受限特例，把主流压平到严格 2 层**。
  - **常规卡（占 70%–80%）压平为 2 层**：`主会话 → DeepSeek API`（直接经 `dispatch.mjs` 跑在 Orca 独立 worktree 的可见终端里）。彻底省掉 Sonnet 中间会话：少 1 跳失真、零消耗 Claude 会员额。
  - **攻坚卡（占 20%–30%）维持 2 层（必要时局部 2.5 层工具调用）**：`主会话 → Sonnet 可见卡会话`。只有当该卡内部遇到 ≥50 行纯机械/批量修改（例如按表补齐几十条数据、批量改字段名、生成机械测试样板）时，Sonnet 才把明确文件与行号写成小卡文件调一次 `dispatch.mjs --model deepseek-flash`，拿到 diff 后立即自己验测；**严禁 DeepSeek 再派任何下级代理**。
- **结论 3：唯一该“加”的是横向能力，不是纵向层级**。
  - **横向并行**：主会话在同一时间并行推进 2–3 条文件域不重叠的工作树（如 1 条 Sonnet 攻坚卡 + 1–2 条 DeepSeek 快道卡 + 1 条 Haiku 出题卡）。
  - **侧翼监督（与派活链正交、不插在上下级之间）**：李白（Grok Bot）做心跳巡检与阻塞叫醒；Gemini（Antigravity）做每日全库独立体检与关键难卡异构审卡。

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
   - **Sonnet 若内部调 DeepSeek**：同样禁止在命令行拼口语摘要，必须先落盘小卡文件（只摘必要原文片段与精确行号），再经 `compose-card.mjs` + `dispatch.mjs` 执行。
2. **层间只传「仓库文件路径 + 短信号」，严禁气泡长文转述**：
   - `orca orchestration send` 与 `--prompt` 只负责指路（如“读 `docs/卡档案/<card>/派卡.md` 与 `state.json`，按规矩在当前分支执行”），**不把需求在消息里重写一遍**。所有上下文以 Git 仓库内的文件为唯一真相源（Pass-by-Reference），避免转抄走样，也天然抗主会话 `/compact` 失忆。
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

## 三、不同 AI 的分工与模型族错开

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
- **极易踩的一个隐形代码细节**：如果某张攻坚卡在 `派卡.md` 的写码模型栏写成 `claude-sonnet + deepseek-flash`，`modelFamilies()` 会同时提取出 **`['deepseek', 'claude-sonnet']`** 两个族！这意味着该卡的 `出题` 与 `审卡` 都不能再用 `deepseek` 或 `claude-sonnet`，必须用 `claude-haiku` + `gemini`（或 `claude-opus`）。提前按这套规则排班，永不撞门禁。

### 3.2 角色分工总表（11-26 会员重置后）

| 角色 | 主力模型 | 通道 / 计费方式 | 职责边界 |
|---|---|---|---|
| **总调度（主会话）** | **Claude Sonnet**（常规唯一主力）<br>*(仅极端跨卷架构大拆卡时临时切 Opus，拆完即切回)* | Orca 主工作树 `main-session`（Claude 会员额） | 只管拆竖切片、查 `entry-registry.json` 闭包、写 `派卡.md`/`state.json`、启动与收回第 2 层、读 diff 解冲突与合入；**绝不亲自写业务代码**。 |
| **写码·赛道 A（常规/数据/工具/单模块，70%–80%）** | **DeepSeek (`deepseek-flash`)** | `tools/dispatch/dispatch.mjs`（DeepSeek API，挂在 Orca 可见终端） | 几毛钱/卡、**零占 Claude 会员额**、温度 `0.0` 稳健执行明确卡文；专注按表写码、单测补齐、批量重构。 |
| **写码·赛道 B（复杂耦合/L0 骨架/E2E 联调，20%–30%）** | **Claude Sonnet**<br>*(卡内大段机械改动可调用 DeepSeek 工具)* | Orca 独立 worktree + 可见 Claude 会话（会员额，`--model sonnet`） | 单线程深度推理、跨文件接口对齐、疑难根因定位；把机械苦力外包给 DeepSeek API，避免白烧 Sonnet 上下文。 |
| **独立出题（黑盒验收测试）** | **Claude Haiku**（默认主力）<br>*(若赛道 B 没借 DeepSeek 且为大批量公式/表校验，亦可用 `deepseek-flash`)* | Orca 独立 worktree（`test/<card>`）+ `--agent claude --model haiku`（会员额极省） | **物理不看写码分支**，仅照 `卷:行` 与 `contracts.json` 写行为级黑盒测试到 `tests/acceptance/<card>/` 与 `出题.md`。Haiku 速度快、耗额极低，且天然与 `deepseek`/`sonnet`/`opus`/`gemini` 四族全互异。 |
| **独立审卡（首轮 + 必须改复核轮）** | **赛道 A 卡**：**Claude Sonnet**（常规）/ **Gemini** 或 **Claude Opus**（高危）<br>**赛道 B 卡**：**Gemini (Antigravity)**（默认首选，真正跨厂商异构 + 零耗 Claude 额）/ **Claude Opus**（仅 L0 内核极难卡） | 全新干净上下文会话：Claude 走 Orca 可见会话（会员额）；Gemini 走 Antigravity 席位 | 对照北极星、严禁硬编码、公共部件复用、验收原始结果逐项审 diff；判「必须改」后的复核轮**必须重开全新干净会话**。 |
| **每日全库独立审核** | **Gemini (Antigravity)** | `antigravity` 独立工作树（不占 Claude 额） | 跨卡全局体检：核查门禁是否真生效、方向是否漂移、架构是否回潮；只读不写业务代码。 |
| **监工 / 巡检 / 裁定分流** | **李白 (Grok Bot)** | Orca 插件 `tourbut.grokbot-notify` + `orca orchestration` | 第 4 模型族（xAI），读快照/看板/信箱，叫醒卡死会话、裁纯技术问题、转交「产品拍板」给亮圳，不介入写码传话。 |

### 3.3 三方模型族错开矩阵（全部 100% 过 `card-archive.mjs` 硬核）

| 卡片档位 | 占比 | 写码（`feat/<card>`） | 出题（`test/<card>`） | 审卡（干净新会话） | 模型族校验结果 | 跨厂商异构度 |
|---|---:|---|---|---|---|---|
| **赛道 A·常规卡** | ~70% | `deepseek` (`deepseek-flash`) | `claude-haiku` | `claude-sonnet` | `{deepseek}` / `{claude-haiku}` / `{claude-sonnet}` 全互异 ✓ | 中高（写与审测跨厂商） |
| **赛道 A·关键规则卡** | ~10% | `deepseek` (`deepseek-flash`) | `claude-haiku` | `gemini` (Antigravity) | `{deepseek}` / `{claude-haiku}` / `{gemini}` 全互异 ✓ | **最高（三方三家不同厂商！）** |
| **赛道 B·复杂耦合卡** | ~15% | `claude-sonnet` *(可局部调 `deepseek`)* | `claude-haiku` | `gemini` (Antigravity) | `{claude-sonnet[,deepseek]}` / `{claude-haiku}` / `{gemini}` 全互异 ✓ | **高（写与审跨厂商，零烧 Opus 额）** |
| **赛道 B·L0 内核极难卡** | ~5% | `claude-sonnet` *(可局部调 `deepseek`)* | `claude-haiku` | `claude-opus` *(必要时 Gemini 二审)* | `{claude-sonnet[,deepseek]}` / `{claude-haiku}` / `{claude-opus}` 全互异 ✓ | 满足门禁 ✓（留给最高风险内核） |

> **关键亮点**：把 **Gemini (Antigravity)** 从“仅每日全库审核”扩展一步，兼任 **赛道 B（Sonnet 写码）的默认异构审卡席位**，一举解决三个痛点：① 避免同属 Anthropic 的“Sonnet 写、Opus 审”同源盲区；② 避开 Sonnet 借用 DeepSeek 时 `card-archive.mjs` 族冲突；③ **省下原本最烧 Claude 周额的 Opus 审卡开销**！

---

## 四、推荐落地架构：Orca 操作流与 11-26 重置后额度花法

### 4.1 总体拓扑图（严格扁平两层 + 双侧翼）

```text
                       ┌──────────────────────┐
                       │  亮圳（产品拍板）    │
                       └──────────┬───────────┘
                                  │ （仅产品方向/大闸门）
                       ┌──────────▼───────────┐       ┌─────────────────────────┐
                       │ 李白 Grok Bot（监工） │◄─────►│ Gemini Antigravity      │
                       │ 巡检 / 叫醒 / 裁技术  │       │ 每日全库体检 + 难卡异构审 │
                       └──────────┬───────────┘       └────────────▲────────────┘
                                  │ 读快照 / orchestration          │ 独立复核
┌─────────────────────────────────▼────────────────────────────────┴────────────┐
│  第 1 层：主会话（Claude Sonnet · Orca `main-session` 工作树）                 │
│  职责：拆卡 → 核前置/闭包 → 落盘 `派卡.md` + `state.json` → 并发派发 → 合入   │
└───────┬──────────────────────────┬────────────────────────────┬───────────────┘
        │ 赛道 A（70–80%，直派）    │ 赛道 B（20–30%，攻坚）      │ 平行隔离验证
        ▼                          ▼                            ▼
┌───────────────────┐   ┌─────────────────────────┐   ┌─────────────────────────┐
│ Orca Worktree     │   │ Orca Worktree           │   │ Orca Worktree           │
│ `feat/<card>`     │   │ `feat/<card>`           │   │ `test/<card>`（出题）   │
│ 可见终端跑        │   │ 可见 Claude 会话        │   │ 可见 Claude 会话        │
│ `dispatch.mjs`    │   │ `--model sonnet`        │   │ `--model haiku`         │
│ (`deepseek-flash`)│   │  └─(可选)机械子任务     │   │ 仅写 `tests/acceptance/`│
│                   │   │    调 `dispatch.mjs`    │   │                         │
└────────┬──────────┘   └────────────┬────────────┘   └────────────┬────────────┘
         │                           │                             │
         └──────────────┬────────────┴─────────────────────────────┘
                        ▼
        ┌───────────────────────────────────────────────┐
        │ 干净上下文审卡（全新会话，不看写码聊天记录）  │
        │ 常规卡：Orca `--agent claude --model sonnet`  │
        │ 攻坚卡：Gemini (`--agent antigravity`) / Opus │
        └───────────────────────┬───────────────────────┘
                                ▼
        ┌───────────────────────────────────────────────┐
        │ 硬机械门禁：.githooks + tsc + CI + 零 mock E2E│
        └───────────────────────────────────────────────┘
```

### 4.2 在 Orca 里的标准落地命令（实测可用参数）

> **实测前置提醒（必做）**：本机 `orca repo list --json` 显示 `dnd` 仓库的 `setup` 钩子目前仍为 `pnpm install`（`L-03`）。**11-26 早上切回 Orca 派 Claude 会话前，务必先在 Orca 仓库设置把 `setup` 改为 `npm ci --prefer-offline` 或置空**；在此之前，每条 `orca worktree create` 必须显式带 `--setup skip`。

#### 1. 立卡与落盘（主会话在 `main-session` 完成）
- 先生成 `docs/卡档案/<card>/派卡.md`（含四件套原件与 `三方标识`）与 `docs/卡档案/<card>/state.json`（含 `baseCommit`、`branches`、`parties`），提交或推送使各工作树按文件读取。

#### 2. 派发「写码」（按赛道二选一）
- **赛道 A（70%–80% 常规卡，DeepSeek API，严格 2 层，零占 Claude 额）**：
  ```powershell
  # 1) 建独立工作树（不带 --agent，不消耗会员额）
  orca worktree create --branch feat/<card> --base-branch origin/master --setup skip --comment "CODE|<card>|deepseek-flash" --json
  # 2) 在该工作树里开可见终端跑 dispatch.mjs（亮圳与李白全程可见输出）
  orca terminal create --worktree branch:feat/<card> --title "CODE|<card>|ds" --keep-open --command "node tools/dispatch/dispatch.mjs --model deepseek-flash --wd . --card docs/卡档案/<card>/派卡.md --purpose code" --json
  ```
- **赛道 B（20%–30% 攻坚卡，Orca 可见 Claude Sonnet 会话，走 11-26 重置后的会员额）**：
  ```powershell
  orca worktree create --branch feat/<card> --base-branch origin/master --setup skip --agent claude --model sonnet --effort medium --comment "CODE|<card>|claude-sonnet" --prompt "你是本卡写码方。只读 docs/卡档案/<card>/派卡.md 并严格按其中卷:行原文、目标文件、公共部件与验收命令执行；禁止口头转述，完结时把 commit SHA 与原始命令输出写入开发.md/反思.md 与 state.json，再用 orca orchestration send 报主会话。若遇卷文矛盾或前置缺失，立即停手写 blocker。" --json
  ```
  *(注：若在已有工作树重开/返工，改用 `orca agent launch --agent claude --worktree branch:feat/<card> --model sonnet --effort medium --prompt "..." --json`。)*

#### 3. 平行派发「独立出题」（物理隔离在 `test/<card>`，走 Haiku 会员额）
```powershell
orca worktree create --branch test/<card> --base-branch origin/master --setup skip --agent claude --model haiku --effort medium --comment "TEST|<card>|claude-haiku" --prompt "你是本卡独立出题方。严禁查看 feat/<card> 分支代码；只读 docs/卡档案/<card>/派卡.md 所列卷:行原文与 contracts.json，在 tests/acceptance/<card>/ 编写黑盒行为验收测试与出题.md，提交后用 orca orchestration send --type worker_done 回报主会话。" --json
```

#### 4. 派发「干净上下文审卡」（绝不复用旧会话）
- **赛道 A 卡（Sonnet 审卡）**：
  ```powershell
  orca agent launch --agent claude --worktree branch:feat/<card> --model sonnet --effort medium --prompt "你是本卡独立审卡方（全新上下文）。严禁采信口头总结；请直接运行 git diff origin/master...HEAD 与验收测试（先合并/拉取 test/<card> 测试跑原始结果），逐项核对北极星、严禁硬编码、公共部件与卷:行原文，写审查.md 并回报主会话。" --json
  ```
- **赛道 B 卡（Gemini 异构审卡优先，省 Opus 额）**：
  - 由主会话经 `orca orchestration send`（或 `orca agent launch --agent antigravity --worktree branch:feat/<card> ...`）通知 Antigravity 席位直接审 `feat/<card>` diff 与 `test/<card>` 原始测试输出；仅 L0 内核高危卡改为 `--agent claude --model opus --effort medium`。
- **必须改的复核轮**：写码方修完后，**新开**一次 `orca agent launch`（新会话 ID，记入 `派卡.md` 三方标识的审卡新一轮），绝不在旧审卡会话里接着聊。

#### 5. 回报、看板与回收（防遗忘、防积压）
- **结构化回报**：子会话完结统一发 `orca orchestration send --type worker_done --outcome succeeded --report-path docs/卡档案/<card>/state.json --files-modified "..." --subject "<card> 写码完成"`（只传路径和机械摘要，不传大段 prose）。
- **完结即清理**：主会话合入 `master` 且 CI 绿灯后，立即关闭子会话并清理已合工作树（防重演 `new-session-8e4637` 残留）。

### 4.3 11-26 重置后的 Claude 会员额度花法（防周中撞限）

Claude 会员额同时受 **5 小时滑动窗口** 与 **每周总限额** 双重约束，且同一次任务中 **Opus 约消耗 Sonnet 的 3–5×、Haiku 的 15× 左右**；结合 Anthropic 多智能体 4×–15× 的上下文倍率，重置后应按以下配比与纪律花额度：

#### 1. 会员额度分配目标（每周总池 100%）

| 用途 | 目标占比 | 选用模型 | 控额抓手 |
|---|---:|---|---|
| **攻坚卡写码（20%–30% 卡）** | **30%–35%** | `sonnet` (`--effort medium`) | 其余 70%–80% 卡全部直派 DeepSeek API，**绝不拿 Sonnet 写机械搬砖卡**；卡内机械重活甩给 `dispatch.mjs`。 |
| **独立审卡（常规卡 + 少数内核卡）** | **25%–30%** | 常规 `sonnet`；内核极难卡 `opus` | 赛道 B 卡优先交给 **Gemini (Antigravity)** 异构审卡，大幅削减 Opus 消耗。 |
| **主会话总调度** | **20%–25%** | `sonnet` | 启动只读 3 文件，检索用本地 `rg`/`git grep` 不喂整仓大文件，禁止主会话亲自写码。 |
| **独立出题（验收测试）** | **5%–10%** | `haiku` (`--effort medium`) | Haiku 极省额且最契合“照卷文翻断言”，几乎不占周池。 |
| **应急缓冲（冲刺/返工/解冲突）** | **10%–15%** | 按需 `sonnet`/`opus` | 留给 11-30 最小可玩版联调或突发连环返工。 |

#### 2. 五条保额硬纪律
1. **默认 `--effort medium`，禁止常驻 Opus**：Opus 仅限 3 种白名单场景——① L0 内核/事务骨架审卡；② 跨 ≥3 卷架构冲突裁决；③ 同一张卡 Sonnet 返工 2 轮仍卡死。日常全线默认 Sonnet + medium。
2. **严控 Claude 同时并发 ≤ 3 个会话**（主会话 1 + 最多 2 个 Claude 卡/审会话；同时可挂 2–3 个 DeepSeek 终端）。这是防止 1–2 小时内瞬间打爆 **5 小时滑动窗口** 的最关键闸门。
3. **一卡一会话，完即关，不复用“长寿胖会话”**：长会话每多一轮都重复计费全量历史上下文；一卡一干净会话既防审卡偏见，又省 50%+ 重复输入消耗。
4. **能用机械脚本绝不问 LLM**：查依赖闭包、查全仓引用、查类型错误、查基线违例一律跑 `rg`、`tsc --noEmit`、`node tools/accept/run.mjs`，把 Claude 额度 100% 花在“需要理解与判断”的环节。
5. **保留 `dispatch.mjs` 作热备切换**：如果冲刺期周额意外逼近 85%，无需改任何工作流——只要把赛道 B 的审卡/出题切回 `dispatch.mjs --model claude-*`（API）或把更多写码切到 DeepSeek + Gemini 审卡即可无缝续跑。

---

## 五、11-26 早上切换前必做的 3 项规则/工具对齐清单

为免“实际改用会员额跑 Orca 会话，但仓库旧规矩还在拦截或打架”，建议 11-26 重置前由主会话/李白同步落定三件事：

1. **更新 `CLAUDE.md` 第 3 节与 `现行有效裁定.json`（需亮圳确认）**：
   - 将 11-24 临时条款「严禁把会员额度花在写码、出题、审卡」更新为 11-26 新口径：「**主力走 Claude 会员额（Orca 可见独立工作树会话）+ DeepSeek API（`dispatch.mjs` 挂 Orca 可见终端），不再常规调用 Claude API**；保留主会话禁止亲自写码与禁用黑盒内置子代理写码（仍须独立工作树、可见可追查）」。
2. **对齐 `L-06`/`L-07` 审计收据口径**：
   - DeepSeek API 卡继续签发 `dispatch.mjs` 收据；Orca 可见 Claude 会话卡改为在 `state.json` 中记录 `orcaWorktreeId`、`sessionHandle/transcriptUri` 与 `commitSha` 作为等效审计凭证，避免未来 CI 收据检查误杀 Orca 会员会话。
3. **立即修掉 `L-03`（Orca `dnd` 仓库 `setup` 钩子）**：
   - 在 Orca 把 `dnd` 的 `setup` 脚本从 `pnpm install` 改成 `npm ci --prefer-offline`（或留空），彻底消除每次开 Claude 可见工作树忘加 `--setup skip` 报错的隐患。

---

## 参考依据

- **仓库内实证**：`CLAUDE.md:16-28`、`docs/派活卡头规矩.md:43-55, 135-137`、`tools/dispatch/dispatch.mjs:66-101`、`tools/accept/lib/card-archive.mjs:16-29, 289-298`、`docs/卡档案/_template/state.json`、`docs/gemini/daily/2026-11-25-audit.md:75-107`、本机 `orca agent launch / worktree create / terminal create / orchestration send --help` 实测。
- **业界工程文献**：
  - Anthropic, *Building effective AI agents* (Dec 2024), *How we built our multi-agent research system* (June 2025), *Effective context engineering for AI agents* (Sept 2025).
  - Yubin Kim, Xin Liu et al. (Google Research, Google DeepMind, MIT), *Towards a Science of Scaling Agent Systems* (`arXiv:2512.08296`, Dec 2025; v3 Apr 2026) & Google ADK Multi-Agent Context Engineering Guides (Dec 2025).
  - Walden Yan (Cognition), *Don't Build Multi-Agents* (June 2025) & *Multi-Agents: What's Actually Working* (Apr 2026).
