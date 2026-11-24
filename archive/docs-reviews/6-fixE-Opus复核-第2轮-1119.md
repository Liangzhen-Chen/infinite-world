# 补值卡 E Opus 复核第 2 轮（1119）

核者：Claude Opus 5.5 中档（非写者）。对象：F:/dnd-wt/ds-b6fe HEAD b892e9b8e（合 origin/master a3df9fc6e，含补值卡 F）。看了 `git diff f03e7b666..HEAD`；本卡净改动按 `git diff a3df9fc6e HEAD` 看（11 文件，补值卡 F 的内容不在此列）。
依据：第 1 轮 docs/审查/6-fixE-Opus只核-1119.md 必须改 1；卷二 :105（"；"并列，任一成立即必填；byDigestible/byReader 为命名条件）、:152；卷三乙 :425、:675 M-1 ①。

## 结论：可封

### 必须改 1 已改对
- server-plugin/kernel/dimensions.mjs:119-130 `applicable()` 改为调 rows.mjs `requirement`（import 于 :19），删掉旧的单项 `REQUIRED_POLICY` 解析，没有第二份判定。运行期传给 `requirement` 的是有效行视图：值取展平行加偏离行 props（§1.3 覆盖顺序），成员关系取 `memberClasses`（已沿 broader 展开，所以 ancestors 给空，不重复展开）。返回 `!conditional || applicable`，与加载期 rows.mjs checkRequired 的"适用"判法相同。
- 多项条件必填已一致：新用例（item.test.mjs"多项条件必填"）木挂可燃、含水 0.4，铁三项条件都不满足；手算木铁各半 mean 只算木得 0.4。断言加载期类别命中 `>= 0.4`；运行期 `materialView` 全列读、只读 moisture 都给 0.4；铁的 moisture 为 `applicable:false`。这正是第 1 轮探针复现的那个分叉，现在已经合上。
- item.mjs:127 的"与运行期 dim 同口径"现在属实。

### 对其他维度没有副作用
- 全量测试通过（含 6-2 及以前各卡的 dimensions、item、物种读数用例）。
- 抽查真实 world 材料行的运行期结果（用临时探针，已 git clean，未提交），都符合表头策略：
  - mat_bone（只挂 comp_durable）：moisture、heatValue、energyDensity 不适用。
  - mat_bamboo（可燃）：moisture 0.12，heatValue 18；energyDensity 不适用。
  - mat_blood（可食）：moisture 0.8，energyDensity 23。
  - mat_black_powder（可燃、可爆燃）：deflagEnergy 2.8。

### 其余
- criteria：本卡相对 master 共 9 类各 1 条修订，ref 写明 item.mjs、rows.mjs、dimensions.mjs 与第 1 轮必须改 1，经 register.mjs 登记，判据本身未改。
- 第 1 轮通过的各项（变量域拒收、6-2 两条限制、勘误 1119k15 体例、手算期望）复看 diff 都没有变化。
- 亲跑：`node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` 末行 `ℹ tests 1091 / ℹ pass 1091 / ℹ fail 0`；`node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`。

## 备注（不阻封，建议记 docs/问题.md）
- rows.mjs:165 `namedOf` 把缓存挂在表对象上（`t.namedMemo ||=`）。运行期视图是 `{...t}`，会拿到加载期那张表的同一个 Map。所以命名条件（byDigestible、byReader）对偏离行（state.created）的判定，第一次求过后就固定下来：偏离行 props 再变、或同一进程里换一份存档，结果都不会重算。基础行与加载期的判定一致，不受影响；材料表目前不在运行期造偏离行，现在测不到。比起改前运行期完全不认命名条件，现在只会更准。要修可以在运行期视图里给一个新的缓存，或者对偏离行不读缓存。按"修改轮不加新设计"，本轮不要求改。
- 回报自查表第 6 项"diff 共 __ 行"仍未填。
