# L-12 `world/ontology/contracts.json` 数据与校验规格（2026-11-25）

> **定位**：本文档是 `kickoff-1125.md` 落地清单 **L-12** 的正式数据与校验规格，由独立设计/审核席（`antigravity`）基于现行主干 `origin/master`（`5bf1eca65`）定稿。写码方（DeepSeek）照本规格落地 `world/ontology/contracts.json` 与校验模块，出题方（Haiku）照本规格第 5 节编写正反单测，审卡方（Opus）逐条核对。
>
> **红线声明（`AGENTS.md`）**：本规格不针对单个意图或单条物品写特例；5 条首批契约全部落在**协议层 / 阶段绑定层 / 通用读视图层 / 空间亚区层 / 出处分级层**，让同一类跨卷问题一次收口。

---

## 1. 设计定位、文件落点与架构约束

1. **数据文件唯一落点**：`world/ontology/contracts.json`（全仓六份单一真相源第 5 项之一）。
2. **职责边界**：
   - 不复述整卷 Markdown，也不替代 `world/ontology/primitives.json`、`named-structs.json`、`state-owners.json`；
   - 只登记**跨卷共享不变量、执行阶段归属、读视图协议、空间分层例外与出处分级规则**，使写码、校验与跨卷勘误有唯一机器可读锚点。
3. **与 L-15 内核白名单（`kernel/files.json ≤ 15`）的隔离约束**：
   - `contracts.json` 的**引用校验**需要读取仓库内 `docs/统一底层设计/*.md`、`docs/审查/现行有效裁定.json` 与 `docs/问题.md`，按卷一 L-4 / 卷二 §2.9，运行时服务端（`server-plugin/`）**不得**读取 `docs/*.md`；
   - 同时 L-15 已锁死 `server-plugin/kernel/files.json ≤ 15`（现 6 零件闭包已占 14）。
   - **落码建议**：将校验模块放在 **`tools/accept/lib/contracts.mjs`**（离线门禁/加载校验组，不占 `server-plugin/kernel/` 名额），并把函数拆为两层：
     - **纯结构校验 `validateContractsSchema(doc)`**（零文件 I/O，纯内存对象校验，未来若 `server-plugin/` 经登记加载器消费 `contracts.json` 可直接复用或同口径实现）；
     - **仓库引用校验 `validateContractsRefs(doc, { repoRoot })`**（读取 `docs/` 核实卷文件、行号、摘录片段、裁定号与 `docs/问题.md` 行范围），接入 `tools/accept/` 门禁与单测（主会话可在派卡时最终定挂接路径，不改本规格数据结构与校验语义）。

---

## 2. `world/ontology/contracts.json` 顶层结构与字段规格

### 2.1 顶层结构（封闭键集）

顶层 JSON 必须是一个普通对象，**仅允许且必须包含**以下 4 个键（严禁多余未知键）：

| 字段 | 类型 | 必填 | 约束 |
|---|---|---|---|
| `version` | `integer` | 是 | 固定等于 `1` |
| `source` | `string` | 是 | 非空去首尾空白字符串，说明规格依据与主干基线 |
| `provenanceTiers` | `object` | 是 | 出处分级规则定义块，键集严格封闭为 `["literature", "design_spec"]`（详见 §2.2 与 §4） |
| `contracts` | `array<Contract>` | 是 | 非空数组（`length >= 1`），元素为跨卷契约对象（详见 §2.3） |

### 2.2 `provenanceTiers` 条目结构（封闭键集）

`provenanceTiers` 下每个档位键（`literature`、`design_spec`）的值必须是一个对象，键集严格封闭：

| 字段 | 类型 | 必填 | 约束 |
|---|---|---|---|
| `label` | `string` | 是 | 非空中文名 |
| `description` | `string` | 是 | 非空说明，定义该档位适用的数值类别 |
| `cellGrades` | `array<string>` | 是 | 非空去重数组，元素取自 `["measured", "referenced", "designed"]`，且两档的 `cellGrades` 必须两两不相交、并集覆盖全部三项 |
| `requiredFields` | `array<string>` | 是 | 非空去重数组，标明规则表/维度行在该档位下必填的出处元数据字段名 |
| `optionalFields` | `array<string>` | 是 | 去重数组（可空），标明允许为 `null` 或缺省的元数据字段名 |
| `anchorRules` | `array<string>` | 是 | 非空字符串数组，描述该档位合法锚点/引用来源规则 |
| `defaultDomains` | `array<string>` | 是 | 非空去重数组，按维度/领域类声明默认适用该档位的表或数据类（不按单条实体/物品特判） |
| `placeholderPolicy` | `string` | 是 | 封闭枚举：`reject_placeholder_only` 或 `require_external_citation`（见 §4.2） |

### 2.3 单条契约 `Contract` 结构（封闭键集）

`contracts[]` 中每个元素必须是对象，键集严格封闭为以下 **9 个键**：

| 字段 | 类型 | 必填 | 约束 |
|---|---|---|---|
| `id` | `string` | 是 | 匹配 `^ctr_[a-z][a-z0-9_]{1,43}$`（符合卷二 §1.9 代号文法 `^[a-z][a-z0-9_]{1,47}$`），在 `contracts[]` 中全局唯一 |
| `title` | `string` | 是 | 去首尾空白后长度 `4..80` 的简明中文标题 |
| `owner` | `string` | 是 | 仓库相对 POSIX 路径，匹配 `^docs/统一底层设计/[^/\\]+\.md$`，对应文件必须真实存在 |
| `consumers` | `array<string>` | 是 | 非空去重数组，每项匹配 `^docs/统一底层设计/[^/\\]+\.md$` 且对应文件真实存在；**不得包含 `owner` 自身** |
| `status` | `string` | 是 | 封闭枚举：`"active"` \| `"superseded"`（L-12 首批 5 条全为 `"active"`） |
| `supersededBy` | `string \| null` | 是 | 当 `status === "active"` 时必须为 `null`；当 `status === "superseded"` 时必须指向同表另一条 `status === "active"` 的契约 `id`（且不得指向自身） |
| `rulingIds` | `array<string>` | 是 | 去重字符串数组（可为空 `[]`）；非空时，每项必须在 `docs/审查/现行有效裁定.json#rulings` 中存在且 `status === "active"` |
| `statement` | `Statement` | 是 | 机器可读约束对象，封闭键集 `{ kind, summary, invariants, problemRefs }`（见下表） |
| `sources` | `array<SourceRef>` | 是 | 非空数组（`length >= 1`），元素为卷:行结构化锚点（见下表），按 `(file, line)` 去重 |

#### `statement` 结构（封闭键集）

| 字段 | 类型 | 必填 | 约束 |
|---|---|---|---|
| `kind` | `string` | 是 | 封闭枚举：`"protocol_split"` \| `"phase_binding"` \| `"read_view"` \| `"spatial_subzone"` \| `"provenance_grading"` |
| `summary` | `string` | 是 | 非空规范性结论，长度 `10..300` |
| `invariants` | `array<Invariant>` | 是 | 非空数组（`length >= 1`），每项为封闭键集 `{ id, target, assertion, params }`：`id` 匹配 `^[a-z][a-z0-9_]{1,47}$` 且在同契约内唯一；`target` 非空字符串；`assertion` 非空字符串；`params` 为普通对象（值只允许原始类型、原始类型数组或单层普通对象，不得含 `undefined`） |
| `problemRefs` | `array<string>` | 是 | 去重数组（可为空 `[]`），每项匹配 `^docs/问题\.md:(\d+)(?:-(\d+))?$`，且起止行号满足 `1 <= start <= end <= totalLines("docs/问题.md")` |

#### `sources[]` 单项 `SourceRef` 结构（封闭键集）

| 字段 | 类型 | 必填 | 约束 |
|---|---|---|---|
| `file` | `string` | 是 | 匹配 `^docs/统一底层设计/[^/\\]+\.md$`，文件必须真实存在 |
| `line` | `integer` | 是 | 1-indexed 正整数，满足 `1 <= line <= totalLines(file)` |
| `excerpt` | `string` | 是 | 非空字符串，长度 `4..80`；**必须逐字包含在 `file` 第 `line` 行原文中**（`lines[line - 1].includes(excerpt) === true`），防止卷文增删行造成静默行号漂移 |
| `role` | `string` | 是 | 封闭枚举：`"conflict"`（原死锁/冲突条文）\| `"basis"`（支撑依据条文）\| `"resolution_target"`（按本契约统一收口口径的待判/受影响条文） |

> **说明（为何用 `{ file, line, excerpt, role }` 而非裸字串 `"卷一:122"`）**：
> 核实 `origin/master`（`5bf1eca65`）时已实际抓到一次漂移：`docs/问题.md:29` 原记 `卷十二-验收与自动扫描.md:777`，而 `5bf1eca65` 上卷十二增改 2 行后，该条文（`【超自然】神迹预算...出处抽检对它与对粮价一视同仁`）已移至 **`:779`**（`:777` 现为 `【西陲】06a 给的十进制字面量...`）。如果只核 `line <= totalLines`，`:777` 会静默误过；强制校验 `excerpt` 子串命中即可在行号偏移时第一时间报 `E-CTR-SOURCE-EXCERPT-MISMATCH`。

---

## 3. 首批 5 条契约完整数据与 `docs/问题.md:26-31` 对照

### 3.1 `docs/问题.md:26-31` 五处待判卷文行收口对照表（亮圳 `K1125-P3` 拍板）

| `docs/问题.md` 行号 | 原文所指卷:行 | `5bf1eca65` 现行精确行号 | 归属契约与不变量 | 机械收口口径 |
|---|---|---|---|---|
| `:27` | `卷一-总纲与分层.md:155` | `:155`（一致） | `ctr_provenance_tiers` / `rule_table_basis_two_tier` | 规则表数值称「标定值」并带 `basis`；两档并存，物理/自然量走 `literature`，世界/玩法刻度走 `design_spec`，不强求后者附现实文献 |
| `:28` | `卷一-总纲与分层.md:339` | `:339`（一致） | `ctr_provenance_tiers` / `rule_table_basis_two_tier` | R-6 第 2 条规则表及 RX 常数须带非空可锚定 `basis`；按档位核验，不以缺失现实文献误杀 `design_spec` |
| `:29` | `卷十二-验收与自动扫描.md:777` | **`:779`**（`5bf1eca65` 后移 +2 行） | `ctr_provenance_tiers` / `audit_equal_rigor_by_tier` | 「出处抽检对超自然神迹预算与对粮价一视同仁」= 同样严查**真实可溯、非空非占位、禁伪造**；但判定标准按档位分：`literature` 核外部文献/数据源，`design_spec` 核仓库内设计册/现行裁定 ID + 设计理由 |
| `:30` | `卷七-信仰与文化.md:1947, :1949, :1955` | `:1947`, `:1949`, `:1955`（一致） | `ctr_provenance_tiers` / `culture_faith_design_spec` | 礼拜场所服务人口、多语者比例、供奉比例属文化/信仰刻度，归 `design_spec` 档，可锚定 `docs/世界设计/`、`docs/统一底层设计/` 或现行裁定，不再因缺外部现实文献而阻断加载 |
| `:31` | `卷二十-时间日历天气与环境.md:738` | `:738`（一致） | `ctr_provenance_tiers` / `rebuildable_baked_projection_allowed` | 「每次按求值分钟现算，不取任何按日缓存的值」仅约束随分钟变化的动态室外温度与逐分钟修正项，**不禁止**离线/加载期确定性可重建的静态烘焙投影（如郡级静态海拔均值），与 `卷一:128`、`卷二:395`、`卷二十七:626` 完全一致 |

### 3.2 `world/ontology/contracts.json` 完整目标文件内容（可直接按此落盘）

以下 JSON 的全部文件路径、行号、摘录片段与生效裁定 ID 均已在 `origin/master`（`5bf1eca65`）上逐条核真：

```json
{
  "version": 1,
  "source": "docs/gemini/contracts-spec-1125.md（基于 origin/master@5bf1eca65，承接 docs/gemini/kickoff-1125.md L-12 与 docs/审查/现行有效裁定.json#K1125-P3）",
  "provenanceTiers": {
    "literature": {
      "label": "现实文献档",
      "description": "现实物理、化学、材料、天文、人体基础生理及历史实证量，须可溯源至外部文献、权威数据集或标准，不得伪造引用。",
      "cellGrades": ["measured", "referenced"],
      "requiredFields": ["citation"],
      "optionalFields": ["basis", "sources", "selection"],
      "anchorRules": [
        "cellGrades 表中 grade=measured 必须带非空外部文献 citation；grade=referenced 必须指向同一表内 grade=measured 的参照行且数值相等。",
        "规则表或无 cellGrades 的维度行声明 basisKind=literature 时，必须带非空 citation 或 sources[].citation。",
        "严禁将伪造或空占位标注为 measured 或 literature；奇幻虚构材料在查无现实出处时须依 设定值可编-1117 显式降档记为 designed / design_spec。"
      ],
      "defaultDomains": [
        "material.physical",
        "units.si",
        "astronomy.calendar",
        "species.real_world_physiology",
        "climate.physical_constants"
      ],
      "placeholderPolicy": "require_external_citation"
    },
    "design_spec": {
      "label": "设计设定档",
      "description": "奇幻、修仙、神祇、文化、信仰、社会刻度、游戏节奏与平衡参数，须锚定仓库内设计册或现行裁定并写明理由，不要求外部现实文献。",
      "cellGrades": ["designed"],
      "requiredFields": ["basis"],
      "optionalFields": ["citation", "specRef"],
      "anchorRules": [
        "cellGrades 表中 grade=designed 必须带非空 basis 说明参照与设计理由，citation 允许为 null。",
        "规则表或维度行声明 basisKind=design_spec 时，必须带非空 basis，并建议经 specRef 锚定 docs/世界设计/...、docs/统一底层设计/... 或 docs/审查/现行有效裁定.json 中的现行裁定 id。",
        "只要 status 不为 literal placeholder 且 basis 非空，不得因 citation 为 null 触发 E-DIM-SOURCE-PLACEHOLDER。",
        "出处抽检时与 literature 一视同仁地核验真实可溯与非空非占位，但按本档锚点规则核验仓库设计源与理由，不强求现实文献。"
      ],
      "defaultDomains": [
        "faith.miracle_and_shrine",
        "culture.language_and_norms",
        "supernatural.cultivation_and_magic",
        "gameplay.balance_and_scales",
        "world.fictional_materials_and_species"
      ],
      "placeholderPolicy": "reject_placeholder_only"
    }
  },
  "contracts": [
    {
      "id": "ctr_post_commit_time",
      "title": "动作耗时提交后推进协议（postCommit.advanceMinutes）",
      "owner": "docs/统一底层设计/卷九-AI接口.md",
      "consumers": [
        "docs/统一底层设计/卷一-总纲与分层.md",
        "docs/统一底层设计/卷二十-时间日历天气与环境.md",
        "docs/统一底层设计/卷二十七-离屏性能存档与确定性.md"
      ],
      "status": "active",
      "supersededBy": null,
      "rulingIds": [],
      "statement": {
        "kind": "protocol_split",
        "summary": "解除单事务 execute 与自开事务 scheduler.advance 的嵌套死锁：动作事务内校验 time 原语并产出 postCommit.advanceMinutes，动作事务成功提交后由外层 submitProposal/调度入口调用 scheduler.advance 按刻独立事务推进；回滚则丢弃推进。",
        "invariants": [
          {
            "id": "no_nested_tx_for_time",
            "target": "execute",
            "assertion": "execute 在单次非嵌套内核事务内校验 time(minutes) 为非负整数并汇总至 commit 结果的 postCommit.advanceMinutes，事务内不得调用 scheduler.advance 或直写 state.clock.*",
            "params": {
              "primitive": "time",
              "field": "postCommit.advanceMinutes",
              "valueType": "non_negative_integer",
              "forbidClockWriteInActionTx": true
            }
          },
          {
            "id": "post_commit_advance_only_on_commit",
            "target": "submitProposal",
            "assertion": "仅当动作事务提交成功且 postCommit.advanceMinutes > 0 时，外层入口调用 scheduler.advance(state.clock.minute + postCommit.advanceMinutes)；动作事务回滚时丢弃 postCommit 且不推进时钟",
            "params": {
              "clockWriter": "kernel/scheduler.mjs",
              "onRollback": "discard"
            }
          },
          {
            "id": "replay_deterministic",
            "target": "replay_apply",
            "assertion": "复演重跑同一指令序列必须确定性再现相同的 postCommit.advanceMinutes 与每刻事务序列，saveDigest 逐字节一致",
            "params": {
              "digestMode": "byte_identical"
            }
          }
        ],
        "problemRefs": []
      },
      "sources": [
        {
          "file": "docs/统一底层设计/卷一-总纲与分层.md",
          "line": 122,
          "excerpt": "L-2 单写路",
          "role": "basis"
        },
        {
          "file": "docs/统一底层设计/卷九-AI接口.md",
          "line": 647,
          "excerpt": "| `time` | `time` | `minutes`（integer） | 声明写者 |",
          "role": "conflict"
        },
        {
          "file": "docs/统一底层设计/卷九-AI接口.md",
          "line": 663,
          "excerpt": "R9-2.3 一次事务",
          "role": "conflict"
        },
        {
          "file": "docs/统一底层设计/卷九-AI接口.md",
          "line": 711,
          "excerpt": "| `commit` | 执行器一次事务 |",
          "role": "conflict"
        },
        {
          "file": "docs/统一底层设计/卷九-AI接口.md",
          "line": 723,
          "excerpt": "R9-3.11 不读墙钟",
          "role": "basis"
        },
        {
          "file": "docs/统一底层设计/卷二十-时间日历天气与环境.md",
          "line": 498,
          "excerpt": "`kernel/scheduler.mjs` 是 `clock.*` 与 `due.*` 的唯一写者",
          "role": "conflict"
        },
        {
          "file": "docs/统一底层设计/卷二十-时间日历天气与环境.md",
          "line": 505,
          "excerpt": "`advance(target)` 反复取",
          "role": "conflict"
        },
        {
          "file": "docs/统一底层设计/卷二十七-离屏性能存档与确定性.md",
          "line": 740,
          "excerpt": "R27-7.2 两种复演",
          "role": "basis"
        }
      ]
    },
    {
      "id": "ctr_volume_cells_seed_bind",
      "title": "体积足迹几何核对归入开局绑种子阶段（checkVolumeCells）",
      "owner": "docs/统一底层设计/卷五-地点地形与资源场.md",
      "consumers": [
        "docs/统一底层设计/卷十-世界随机生成.md",
        "docs/统一底层设计/卷二十七-离屏性能存档与确定性.md"
      ],
      "status": "active",
      "supersededBy": null,
      "rulingIds": [],
      "statement": {
        "kind": "phase_binding",
        "summary": "将 comp_volume 校验拆为两阶段：静态 loadWorld 仅校验无种子字段形态；依赖 worldSeed 的 caveCellsOf 与顶面低于地表/不重叠核对（checkVolumeCells）归入 startGame / bindCampaignSeed 及世界生成后核对阶段执行，不得在 loadWorld 要求种子或静默跳过。",
        "invariants": [
          {
            "id": "load_world_seedless_schema_only",
            "target": "loadWorld",
            "assertion": "静态加载期仅校验 comp_volume 行的无种子约束（anchorElevationM 在定义域内、targetAreaM2 > 0、spanZ >= 1、禁填区域 coord），不调用依赖世界种子的 caveCellsOf",
            "params": {
              "phase": "loadWorld",
              "requiresSeed": false,
              "component": "comp_volume"
            }
          },
          {
            "id": "check_volume_cells_on_seed_bind",
            "target": "checkVolumeCells",
            "assertion": "绑定战役世界种子（startGame / worldgen post-check）时必须调用 checkVolumeCells，核对每个体积足迹顶面层号严格低于覆盖各列地表层号且与同父兄弟体积不相交；失败则拒绝开局或生成，严禁静默跳过",
            "params": {
              "phase": "startGame_or_worldgen_postcheck",
              "requiresSeed": true,
              "minRoofDepthLayersBelowSurface": 1,
              "allowSilentSkip": false
            }
          }
        ],
        "problemRefs": []
      },
      "sources": [
        {
          "file": "docs/统一底层设计/卷五-地点地形与资源场.md",
          "line": 103,
          "excerpt": "体积足迹：体积顶面的海拔，须低于所在列的地表",
          "role": "basis"
        },
        {
          "file": "docs/统一底层设计/卷五-地点地形与资源场.md",
          "line": 498,
          "excerpt": "顶面须至少比所在各列的地表低一层（否则加载报错）",
          "role": "conflict"
        },
        {
          "file": "docs/统一底层设计/卷十-世界随机生成.md",
          "line": 434,
          "excerpt": "R10-2.10 生成后核对",
          "role": "basis"
        },
        {
          "file": "docs/统一底层设计/卷十-世界随机生成.md",
          "line": 450,
          "excerpt": "R10-2.14 洞穴生成器",
          "role": "conflict"
        },
        {
          "file": "docs/统一底层设计/卷十-世界随机生成.md",
          "line": 913,
          "excerpt": "| `stream.gen.cave` | `site.gen.cave.grow` |",
          "role": "basis"
        },
        {
          "file": "docs/统一底层设计/卷二十七-离屏性能存档与确定性.md",
          "line": 636,
          "excerpt": "成分为世界种子、卷五登记的生成流代号",
          "role": "conflict"
        }
      ]
    },
    {
      "id": "ctr_map_nonnull_view",
      "title": "全族可空映射统一非 null 过滤读视图（tissueFractions 等）",
      "owner": "docs/统一底层设计/卷二-维度表规范与统一入口.md",
      "consumers": [
        "docs/统一底层设计/卷四-生物身体与人物.md"
      ],
      "status": "active",
      "supersededBy": null,
      "rulingIds": [],
      "statement": {
        "kind": "read_view",
        "summary": "所有按卷二 §1.6 全族展平且以显式 null 表达「该键没有」的映射（典型如 body_plan.tissueFractions 与 species.tissues），由加载器/读视图原语统一暴露过滤 null 键后的只读视图（按键码点序）；键集相等、子集与求和=1 不变量均在活跃非 null 键集上求值，rx 不把合法显式 null 当异常抛错。",
        "invariants": [
          {
            "id": "canonical_nonnull_map_view",
            "target": "loader_map_view",
            "assertion": "加载器与 view 层为全族可空 map 提供统一的过滤 null 只读视图，保留键的码点字典序，消费者不得直接假设 Object.keys(rawMap) 全部非 null",
            "params": {
              "appliesTo": "all_full_family_nullable_maps",
              "primaryExamples": ["body_plan.tissueFractions", "species.tissues"],
              "keyOrder": "codepoint_asc",
              "excludeValue": null
            }
          },
          {
            "id": "active_key_invariants",
            "target": "body_plan_and_species_validation",
            "assertion": "species.tissues 与 body_plan.tissueFractions 的键集一致、tissueOverride 键集为子集、tissueFractions 求和为 1，均按各自非 null 活跃键集核对；raw 表仍按全族覆盖核对缺键",
            "params": {
              "rawCoverageCheck": "full_family",
              "semanticEvalKeys": "non_null_only",
              "fractionSumTarget": 1
            }
          },
          {
            "id": "rx_explicit_null_is_known_absent",
            "target": "rx",
            "assertion": "表达式求值层将合法显式 null 视为「确知不存在」，不得抛运行异常 fail()，并按卷二 §1.6 未知/不适用传播规则处置",
            "params": {
              "explicitNullSemantics": "known_absent",
              "throwOnExplicitNull": false
            }
          }
        ],
        "problemRefs": []
      },
      "sources": [
        {
          "file": "docs/统一底层设计/卷二-维度表规范与统一入口.md",
          "line": 269,
          "excerpt": "要表达\"某键没有\"的，该键写 `null`",
          "role": "conflict"
        },
        {
          "file": "docs/统一底层设计/卷四-生物身体与人物.md",
          "line": 144,
          "excerpt": "键集 = 身体图 `tissueFractions` 的键集",
          "role": "conflict"
        },
        {
          "file": "docs/统一底层设计/卷四-生物身体与人物.md",
          "line": 197,
          "excerpt": "| `tissueFractions` | map<ref vocab tissue, fraction> | 和 = 1 |",
          "role": "conflict"
        },
        {
          "file": "docs/统一底层设计/卷四-生物身体与人物.md",
          "line": 202,
          "excerpt": "`tissueOverride` 的键 ⊆ `tissueFractions` 的键",
          "role": "basis"
        },
        {
          "file": "docs/统一底层设计/卷四-生物身体与人物.md",
          "line": 471,
          "excerpt": "`bodyDensity` = `wsum(身体图.tissueFractions 经 tissues 映射到材料",
          "role": "basis"
        },
        {
          "file": "docs/统一底层设计/卷四-生物身体与人物.md",
          "line": 543,
          "excerpt": "B-9 部位的质量与材料",
          "role": "basis"
        },
        {
          "file": "docs/统一底层设计/卷四-生物身体与人物.md",
          "line": 882,
          "excerpt": "材料构成 = 参与部位按大小加权的 Σ `tissueFractions[t]`",
          "role": "conflict"
        }
      ]
    },
    {
      "id": "ctr_settlement_subzone",
      "title": "聚落内住区/街坊为逻辑或细格亚区（豁免 100 m 区格冲突）",
      "owner": "docs/统一底层设计/卷五-地点地形与资源场.md",
      "consumers": [
        "docs/统一底层设计/卷十-世界随机生成.md"
      ],
      "status": "active",
      "supersededBy": null,
      "rulingIds": [],
      "statement": {
        "kind": "spatial_subzone",
        "summary": "聚落（comp_settlement）内部的住区/街坊/分片定义为逻辑亚区或细格（1 m）亚区，而非 100 m 粗区格区域足迹：豁免 100 m 区域足迹多源划分与同父同格种子冲突（E-GRID-SEED-SAME-CELL），允许建筑（comp_facility）挂于亚区之下并按聚落内细格粒度校验建筑不相交，恢复「聚落 → 住区 → 建筑」三层树。",
        "invariants": [
          {
            "id": "exempt_from_coarse_region_partition",
            "target": "place_footprint_validation",
            "assertion": "挂于 comp_settlement 下的聚落内住区/街坊亚区不作为 100 m 粗区格 region 足迹参与多源生长，也不触发同父区域种子同区格报错（E-GRID-SEED-SAME-CELL）",
            "params": {
              "parentComponent": "comp_settlement",
              "coarseRegionCellM": 100,
              "exemptErrorCode": "E-GRID-SEED-SAME-CELL"
            }
          },
          {
            "id": "subzone_geometry_mode",
            "target": "settlement_subzone",
            "assertion": "聚落亚区的空间范围采用逻辑分组（继承父聚落粗足迹）或在父聚落内的细格（1 m）子划分，不要求每个亚区独占至少 1 个 100 m 粗区格",
            "params": {
              "allowedModes": ["logical_group", "fine_cell_subpartition"],
              "fineCellM": 1,
              "requireCoarseCellPerSubzone": false
            }
          },
          {
            "id": "facility_mounting_and_fine_disjoint",
            "target": "place_tree_and_zoneAt",
            "assertion": "建筑（comp_facility）允许挂接在聚落亚区下形成「聚落→亚区→建筑」三层树；同属一父聚落的全部建筑足迹在细格（1 m）粒度两两不相交；zoneAt(pos) 仍按最深非逻辑足迹优先（房间/建筑→细格亚区→父聚落）解析",
            "params": {
              "allowFacilityUnderSubzone": true,
              "facilityOverlapGranularity": "fine_cell_1m",
              "zoneAtOrder": ["room", "building", "fine_subzone", "settlement"]
            }
          }
        ],
        "problemRefs": []
      },
      "sources": [
        {
          "file": "docs/统一底层设计/卷五-地点地形与资源场.md",
          "line": 461,
          "excerpt": "2. **层级与足迹种类不靠名字**",
          "role": "conflict"
        },
        {
          "file": "docs/统一底层设计/卷五-地点地形与资源场.md",
          "line": 462,
          "excerpt": "同父的兄弟足迹两两不相交（区域按区格，建筑、房间、体积按细格）",
          "role": "conflict"
        },
        {
          "file": "docs/统一底层设计/卷五-地点地形与资源场.md",
          "line": 492,
          "excerpt": "目标格数 = `targetAreaM2 ÷ regionCellM²` 向上取整",
          "role": "conflict"
        },
        {
          "file": "docs/统一底层设计/卷五-地点地形与资源场.md",
          "line": 493,
          "excerpt": "同父两个种子不在同一区格",
          "role": "conflict"
        },
        {
          "file": "docs/统一底层设计/卷十-世界随机生成.md",
          "line": 674,
          "excerpt": "R10-7.1 选模板",
          "role": "conflict"
        },
        {
          "file": "docs/统一底层设计/卷十-世界随机生成.md",
          "line": 683,
          "excerpt": "R10-7.5 站点面积由占地反推",
          "role": "conflict"
        },
        {
          "file": "docs/统一底层设计/卷十-世界随机生成.md",
          "line": 686,
          "excerpt": "R10-7.8 物化的三个阶段",
          "role": "conflict"
        }
      ]
    },
    {
      "id": "ctr_provenance_tiers",
      "title": "数值出处两档机械分级（literature / design_spec）与可重建烘焙层口径",
      "owner": "docs/统一底层设计/卷二-维度表规范与统一入口.md",
      "consumers": [
        "docs/统一底层设计/卷一-总纲与分层.md",
        "docs/统一底层设计/卷七-信仰与文化.md",
        "docs/统一底层设计/卷十二-验收与自动扫描.md",
        "docs/统一底层设计/卷二十-时间日历天气与环境.md",
        "docs/统一底层设计/卷二十七-离屏性能存档与确定性.md"
      ],
      "status": "active",
      "supersededBy": null,
      "rulingIds": [
        "设定值可编-1117",
        "K1125-P3"
      ],
      "statement": {
        "kind": "provenance_grading",
        "summary": "依据亮圳 设定值可编-1117 与 K1125-P3，将全部数值出处机械分为 literature 与 design_spec 两档（定义见顶层 provenanceTiers），收口 docs/问题.md:26-31 全部 5 处待判卷文行，并明确离线/加载期确定性可重建烘焙投影合法。",
        "invariants": [
          {
            "id": "rule_table_basis_two_tier",
            "target": "world_rules_and_dimensions",
            "assertion": "卷一:155 与 :339 要求的规则表数值与 RX 常数 basis 在两档体系下落地：现实物理量走 literature（核外部 citation），玩法/世界刻度走 design_spec（核仓库设计锚点与理由），均禁止空值或裸 placeholder",
            "params": {
              "tiers": ["literature", "design_spec"],
              "volumeRefs": [
                "docs/统一底层设计/卷一-总纲与分层.md:155",
                "docs/统一底层设计/卷一-总纲与分层.md:339"
              ]
            }
          },
          {
            "id": "audit_equal_rigor_by_tier",
            "target": "provenance_audit",
            "assertion": "卷十二:779（原 docs/问题.md:29 记 :777，5bf1eca65 后移至 :779）对神迹预算与粮价的出处抽检在「真实存在、非空非占位、禁伪造」上一视同仁，核验标准按档位分流（literature 核外部引用，design_spec 核仓库设计册/现行裁定 + 理由）",
            "params": {
              "originalProblemLineNote": "docs/问题.md:29 记为 卷十二:777，5bf1eca65 现行行为 779",
              "supernaturalTier": "design_spec",
              "commodityRealPriceTier": "literature"
            }
          },
          {
            "id": "culture_faith_design_spec",
            "target": "faith_and_culture_tables",
            "assertion": "卷七:1947、:1949、:1955 所列礼拜场所服务人口、多语者比例、供奉比例属文化/信仰刻度，按 design_spec 落地并带明确 basis 与仓库设计锚点，不得因无现实外部文献触发 E-DIM-SOURCE-PLACEHOLDER",
            "params": {
              "tier": "design_spec",
              "triggerPlaceholderErrorOnNullCitation": false
            }
          },
          {
            "id": "rebuildable_baked_projection_allowed",
            "target": "climate_and_static_projections",
            "assertion": "卷二十:738 的「每次按求值分钟现算，不取任何按日缓存的值」仅约束随分钟变化的动态室外温度与逐分钟修正项，不禁止离线/加载期确定性可重建静态烘焙层（不进 saveDigest、可丢弃重建并逐位验一致），与 卷一:128、卷二:395、卷二十七:626 一致",
            "params": {
              "dynamicMinuteEvalOnly": true,
              "allowDeterministicRebuildableBaking": true,
              "bakedIncludedInSaveDigest": false
            }
          }
        ],
        "problemRefs": [
          "docs/问题.md:26-31"
        ]
      },
      "sources": [
        {
          "file": "docs/统一底层设计/卷一-总纲与分层.md",
          "line": 128,
          "excerpt": "L-8 投影不落盘",
          "role": "basis"
        },
        {
          "file": "docs/统一底层设计/卷一-总纲与分层.md",
          "line": 155,
          "excerpt": "每个数值称\"标定值\"并带 `basis`",
          "role": "resolution_target"
        },
        {
          "file": "docs/统一底层设计/卷一-总纲与分层.md",
          "line": 339,
          "excerpt": "规则表每个数值条目带 `basis`（出处）",
          "role": "resolution_target"
        },
        {
          "file": "docs/统一底层设计/卷二-维度表规范与统一入口.md",
          "line": 283,
          "excerpt": "真实量须 `citation`；世界内量表 `calibrate:true`",
          "role": "basis"
        },
        {
          "file": "docs/统一底层设计/卷二-维度表规范与统一入口.md",
          "line": 395,
          "excerpt": "3. **索引是投影**：可随时丢弃、由状态全量重建",
          "role": "basis"
        },
        {
          "file": "docs/统一底层设计/卷七-信仰与文化.md",
          "line": 1947,
          "excerpt": "一座礼拜场所服务多少信众的现实参照",
          "role": "resolution_target"
        },
        {
          "file": "docs/统一底层设计/卷七-信仰与文化.md",
          "line": 1949,
          "excerpt": "多语者比例与一个人通常掌握几门语言的现实参照",
          "role": "resolution_target"
        },
        {
          "file": "docs/统一底层设计/卷七-信仰与文化.md",
          "line": 1955,
          "excerpt": "供奉与寺院经济的现实参照",
          "role": "resolution_target"
        },
        {
          "file": "docs/统一底层设计/卷十二-验收与自动扫描.md",
          "line": 779,
          "excerpt": "出处抽检对它与对粮价一视同仁",
          "role": "resolution_target"
        },
        {
          "file": "docs/统一底层设计/卷二十-时间日历天气与环境.md",
          "line": 738,
          "excerpt": "每次按求值分钟现算，不取任何按日缓存的值",
          "role": "resolution_target"
        },
        {
          "file": "docs/统一底层设计/卷二十七-离屏性能存档与确定性.md",
          "line": 626,
          "excerpt": "表值由 tools 组的生成脚本离线算出后入库并带摘要，运行时只读表、不现算",
          "role": "basis"
        }
      ]
    }
  ]
}
```

---

## 4. 出处分级 `literature` / `design_spec` 的精确定义与数据落点

本节直接回应主会话第 4 问：**出处分级定义在哪、业务数据里怎么落、与现有 `cellGrades` 如何无缝兼容**。

### 4.1 规则与分类定义落点（不另建孤立文件）

- **唯一定义落点**：`world/ontology/contracts.json#provenanceTiers`（见 §3.2）。
- **不另建 `world/ontology/provenance-tiers.json` 的理由**：
  1. 减少 `world/ontology/` 顶层零散文件数，维持「六份单一真相源」精简结构；
  2. `provenanceTiers` 与 `ctr_provenance_tiers` 同文件共存，由同一校验器一起保证非空、覆盖全部 `cell_grade` 且互不相交，不会发生两份文件口径漂移。

### 4.2 业务数据表的两类落法（零破坏兼容现行数据）

1. **带表头 `cellGrades` 的维度表**（如 `world/ontology/dimensions/material.json`，现由 `cell-grades.mjs` 校验）：
   - **保留现有三值 `cell_grade`（`measured` / `referenced` / `designed`），不改现有数据文件结构**；
   - 通过 `contracts.json#provenanceTiers.<tier>.cellGrades` 建立无损映射：
     - `literature` ↔ `grade === "measured"`（必填非空 `citation`）或 `grade === "referenced"`（指向本表同格 `grade === "measured"` 的参照行且值相等）；
     - `design_spec` ↔ `grade === "designed"`（必填非空 `basis`，`citation` 允许为 `null`）。
2. **规则表（`world/rules/tables/*.json`）与无 `cellGrades` 的维度表行**：
   - 在条目/行上支持可选显式字段 `basisKind: "literature" | "design_spec"` 与 `specRef?: string`（配合既有的 `basis`、`citation`、`status`）：
     - 若未显式写 `basisKind`，由该表/领域类对应的 `provenanceTiers.<tier>.defaultDomains` 决定默认档位（**按类决定，禁止按单个实体 id 或物品名特判**）；
     - 落入 `literature` 档的条目：`placeholderPolicy = "require_external_citation"` —— 必须带非空 `citation`（或 `sources[].citation`），缺外部引用或 `status === "placeholder"` 均拒载（`E-DIM-SOURCE-PLACEHOLDER`）；
     - 落入 `design_spec` 档的条目：`placeholderPolicy = "reject_placeholder_only"` —— 必须带非空 `basis`（且若写了 `specRef`，须指向存在的 `docs/世界设计/...`、`docs/统一底层设计/...` 文件或 `docs/审查/现行有效裁定.json` 中 `status === "active"` 的裁定 id）；`citation` 允许为 `null`；**只有当 `status === "placeholder"` 或 `basis` 为空/纯空白时才报 `E-DIM-SOURCE-PLACEHOLDER`**，绝不因缺外部现实文献而误杀奇幻/文化/修仙刻度。

---

## 5. 加载期校验规则与单测矩阵（给 DeepSeek / Haiku / Opus）

### 5.1 导出接口契约（建议模块：`tools/accept/lib/contracts.mjs`）

模块须为纯 ES Module（`.mjs`），零第三方依赖（仅用 `node:fs`、`node:path`），导出以下三个函数：

1. `validateContractsSchema(doc)`
   - **输入**：已解析的 JS 值 `doc`（`unknown`）。
   - **行为**：只做内存结构与不变量校验（规则 **V1–V10**），不碰文件系统。
   - **返回**：`{ ok: boolean, errors: Array<{ code: string, path: string, message: string }> }`。`ok === (errors.length === 0)`。
2. `validateContractsRefs(doc, { repoRoot })`
   - **输入**：已通过 Schema 校验的 `doc`，以及必填字符串 `repoRoot`（仓库根目录路径；不得写死本地盘符）。
   - **行为**：执行仓库引用交叉核对（规则 **V11–V14**），读取 `docs/统一底层设计/*.md`、`docs/审查/现行有效裁定.json`、`docs/问题.md`。
   - **返回**：`{ ok: boolean, errors: Array<{ code: string, path: string, message: string }> }`。
3. `loadAndValidateContracts({ repoRoot, contractsPath = 'world/ontology/contracts.json' })`
   - **行为**：读取并 `JSON.parse` 目标文件（读文件或 JSON 解析失败即返 `{ ok: false, doc: null, errors: [{ code: 'E-CTR-READ' | 'E-CTR-JSON-PARSE', ... }] }`）；先跑 `validateContractsSchema(doc)`，若结构有错直接返回错误（不把坏结构喂给引用校验），结构通过再跑 `validateContractsRefs(doc, { repoRoot })`；全过返 `{ ok: true, doc, errors: [] }`，否则返 `{ ok: false, doc: null, errors }`。
   - **严禁静默跳过**：文件缺失、`repoRoot` 缺失、裁定文件缺失、`docs/问题.md` 缺失、行号越界、摘录不匹配，**全部必须产出错误并令 `ok === false`**，绝不得 `try/catch` 吞错放行。

### 5.2 校验规则清单（V1–V14）与错误码表

| 编号 | 层级 | 错误码 | 校验内容 |
|---|---|---|---|
| **V1** | Read | `E-CTR-READ` / `E-CTR-JSON-PARSE` | 文件不可读或非法 JSON；`repoRoot` 非非空字符串 |
| **V2** | Schema | `E-CTR-ROOT-SHAPE` | 顶层必须是普通对象，键集严格等于 `["version", "source", "provenanceTiers", "contracts"]`（缺键或多余键均报错）；`version === 1`；`source` 去空白非空 |
| **V3** | Schema | `E-CTR-TIERS-SHAPE` | `provenanceTiers` 键集严格等于 `["literature", "design_spec"]`；每档键集严格等于 `["label", "description", "cellGrades", "requiredFields", "optionalFields", "anchorRules", "defaultDomains", "placeholderPolicy"]`；`placeholderPolicy` ∈ `["require_external_citation", "reject_placeholder_only"]`；非空字段与数组去重校验 |
| **V4** | Schema | `E-CTR-TIERS-COVERAGE` | 两档 `cellGrades` 全部元素须 ∈ `["measured", "referenced", "designed"]`，两档之间必须**两两不相交**，且并集**恰好覆盖全部三项** |
| **V5** | Schema | `E-CTR-LIST-EMPTY` | `contracts` 必须是非空数组（`Array.isArray && length >= 1`） |
| **V6** | Schema | `E-CTR-ITEM-SHAPE` | 每条契约必须是普通对象，键集严格等于 `["id", "title", "owner", "consumers", "status", "supersededBy", "rulingIds", "statement", "sources"]`；`title` 去空白长度 `4..80` |
| **V7** | Schema | `E-CTR-ID-INVALID` / `E-CTR-ID-DUP` | `id` 必须匹配 `^ctr_[a-z][a-z0-9_]{1,43}$` 且在 `contracts[]` 中全局唯一 |
| **V8** | Schema | `E-CTR-STATUS-INVALID` | `status` ∈ `["active", "superseded"]`；`status === "active"` 时 `supersededBy` 必须为 `null`；`status === "superseded"` 时 `supersededBy` 必须为非自身字符串且指向本表另一条 `status === "active"` 的契约 `id` |
| **V9** | Schema | `E-CTR-VOL-PATH` / `E-CTR-OWNER-IN-CONSUMERS` | `owner` 与 `consumers[]` 每项必须匹配 `^docs/统一底层设计/[^/\\]+\.md$`；`consumers` 非空、无重复且不含 `owner`；`rulingIds` 为去重非空字符串数组（可空） |
| **V10** | Schema | `E-CTR-STATEMENT-SHAPE` / `E-CTR-SOURCE-SHAPE` | `statement` 键集严格等于 `["kind", "summary", "invariants", "problemRefs"]`；`kind` ∈ 5 个封闭值；`summary` 去空白长度 `10..300`；`invariants` 非空，每项封闭键集 `{ id, target, assertion, params }` 且同契约内 `id` 唯一并匹配 `^[a-z][a-z0-9_]{1,47}$`；`problemRefs` 每项匹配 `^docs/问题\.md:(\d+)(?:-(\d+))?$` 且 `start >= 1 && start <= end`；`sources` 非空，每项封闭键集 `{ file, line, excerpt, role }`，`file` 匹配卷路径正则，`line` 为正整数，`excerpt` 长度 `4..80`，`role` ∈ `["conflict", "basis", "resolution_target"]`，同契约内 `(file, line)` 无重复 |
| **V11** | Refs | `E-CTR-VOL-NOT-FOUND` | `owner`、`consumers[]`、`sources[].file` 指向的文件在 `repoRoot` 下必须真实存在 |
| **V12** | Refs | `E-CTR-SOURCE-LINE-RANGE` / `E-CTR-SOURCE-EXCERPT-MISMATCH` | 对 `sources[]` 每项按 UTF-8 读 `file` 并以 `/\r?\n/` 分行：`1 <= line <= lines.length`，且 `lines[line - 1].includes(excerpt)` 必须为 `true` |
| **V13** | Refs | `E-CTR-RULING-INVALID` | 读取 `docs/审查/现行有效裁定.json`（文件不存在或解析失败报 `E-CTR-RULING-INVALID`），每条契约 `rulingIds[]` 中每个 id 必须存在于 `rulings[]` 且 `status === "active"` |
| **V14** | Refs | `E-CTR-PROBLEM-LINE-RANGE` | 若任意契约 `statement.problemRefs` 非空，读取 `docs/问题.md`，验证每个引用的 `end <= totalLines("docs/问题.md")` |

### 5.3 必须覆盖的正负向单测矩阵（供出题方 Haiku 编写验收测试）

出题方应至少覆盖以下 **14 条独立用例**（所有构造测试须在临时副本或内存深拷贝上运行，不污染仓库真实文件）：

1. **真实仓库端到端正向测试**：直接对真实仓库调用 `loadAndValidateContracts({ repoRoot })`，断言 `ok === true`、`errors.length === 0`、`doc.contracts.length >= 5`，且包含 `ctr_post_commit_time`、`ctr_volume_cells_seed_bind`、`ctr_map_nonnull_view`、`ctr_settlement_subzone`、`ctr_provenance_tiers` 五条活跃契约。
2. **顶层版本与多余键负向**：`version: 2` 或顶层加未知键 `extra: 1` → 必返 `E-CTR-ROOT-SHAPE`。
3. **出处档位覆盖缺口/重叠负向**：从 `provenanceTiers.literature.cellGrades` 删掉 `"referenced"`，或两档同时写 `"designed"` → 必返 `E-CTR-TIERS-COVERAGE`。
4. **重复 `id` 负向**：复制一条契约制造同 `id` → 必返 `E-CTR-ID-DUP`。
5. **非法 `id` 格式负向**：`id: "C1-bad"` 或不以 `ctr_` 开头 → 必返 `E-CTR-ID-INVALID`。
6. **`owner` 混入 `consumers` / `consumers` 重复负向**：`consumers` 含 `owner` 路径或含重复路径 → 必返 `E-CTR-OWNER-IN-CONSUMERS` / `E-CTR-VOL-PATH`。
7. **`status` 与 `supersededBy` 矛盾负向**：`status: "active"` 但 `supersededBy: "ctr_map_nonnull_view"`；以及 `status: "superseded"` 但 `supersededBy: null` 或指向不存在/自身 `id` → 必返 `E-CTR-STATUS-INVALID`。
8. **非法 `statement.kind` 或空 `invariants` 负向**：`kind: "custom_hack"` 或 `invariants: []` → 必返 `E-CTR-STATEMENT-SHAPE`。
9. **卷文件不存在负向**：`sources[0].file` 改为 `docs/统一底层设计/卷九十九-不存在.md` → 必返 `E-CTR-VOL-NOT-FOUND`。
10. **行号越界负向**：`sources[0].line` 设为 `0`（Schema 层 `E-CTR-SOURCE-SHAPE`）及 `999999`（Refs 层 `E-CTR-SOURCE-LINE-RANGE`）。
11. **摘录漂移负向（回归保护）**：将 `ctr_provenance_tiers` 中 `卷十二` 的 `line` 故意改回旧行号 `777`（保持 `excerpt: "出处抽检对它与对粮价一视同仁"`）→ 必返 `E-CTR-SOURCE-EXCERPT-MISMATCH`。
12. **无效或非活跃 `rulingId` 负向**：`rulingIds` 填入 `"NOT-EXIST-999"` → 必返 `E-CTR-RULING-INVALID`。
13. **`problemRefs` 越界负向**：`problemRefs` 填入 `"docs/问题.md:1-9999"` → 必返 `E-CTR-PROBLEM-LINE-RANGE`。
14. **文件缺失/坏 JSON 拒静默兜底负向**：传不存在的 `contractsPath` 或非法 JSON 临时文件 → 必返 `ok === false` 与 `E-CTR-READ` / `E-CTR-JSON-PARSE`，不得静默返回空列表。

---

## 6. 审卡方（Opus）核对要点清单

1. **红线审查**：确认校验代码零按具体契约 `id` 或具体卷名硬编码特判（所有规则基于顶层/契约 schema 与 `provenanceTiers` 数据驱动）。
2. **白名单保护**：确认 L-12 未向 `server-plugin/kernel/` 新增文件，未破坏 `kernel/files.json ≤ 15`。
3. **无静默兜底**：确认 `validateContractsRefs` 中无 `if (!fs.existsSync(...)) continue` 类静默放过。
4. **行号真值**：确认真实 `world/ontology/contracts.json` 经 `loadAndValidateContracts` 在 CI 干净环境下实跑通过，尤其核实 `卷十二-验收与自动扫描.md:779` 与 `docs/问题.md:26-31` 对照完整无误。
