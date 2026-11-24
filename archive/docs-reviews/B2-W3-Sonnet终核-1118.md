# B2-W3 Sonnet 中档终核（只读）

对象：分支 ds/b2w3（已接 origin/master），`git diff origin/master...ds/b2w3`。加载器卡，第 1 轮终核。（原文由主会话从 F:/dnd-tmp/review/ 原样入库。）

## 结论：可封

没有必须改的条目。两条拿不准都有判断，都不挡封，各附一条后续动作。

实跑：`node --test "tests/**/*.test.mjs"` 末行 `ℹ tests 549 / pass 549 / fail 0`。`tests/kernel/dimensions.test.mjs` 与 `material.test.mjs` 单跑 54/54。
说明：我先跑过 `node --test tests/kernel/`，它报 cancelled。这是 Windows 下把目录当入口的用法问题，不是用例失败，换用上面的 glob 命令后全过。

## 重点 1：两条拿不准

### ① 未建登记 `card` 字段的文法

`pre_first_reader_card` 合勘误条原句。卷二 §1.12 :389 写 `card`「未排期时写固定代号 `pre_first_reader_card`」，李白裁定第 3 条也只要求挂到"第一张真正读到它们的玩法卡前面一张"。五条登记（`_unbuilt-derived.json`）都用这个固定代号，当前能过校验。

文法本身有一处瑕疵：`dimensions-validate.mjs:155` 的 `CARD_CODE_RE = /^[a-z0-9][a-z0-9_-]{0,47}$/` 只收小写。卷二 :389 只说 `card` 写「卡号」，没有定义文法，所以这条正则是实现自补的（卡头第二节第 1 条"不自补"）。后果是：排期时写真卡号（本项目卡号有 `B2-W3`、`4-4a` 这类大写写法）会被 `E-DIM-STRUCT-FIELD` 拒收。

判断：不挡封。
- 当前五条都能过。
- 这是收窄方向的错误，不会放过坏数据。
- 补齐发生在 PLAN 挂账那张"补原语前一张"卡，那时顺手要改的就是这一行。

后续动作二选一，写进挂账：
- (a) 把正则放宽到项目卡号的实际写法（含大写）；
- (b) 在卷二 §1.12 勘误里补一句文法。

我倾向 (a)，因为不用再动卷文。由 PLAN 挂账时一并记下，不在本卡改。

### ② categories 进未建登记而非加载器索引

按卷三乙原句，进登记成立，且是裁定第 2 条"拿不准就进未建登记"的正当分支。依据：
- 卷三乙 :144 把 `categories` 定为「set<ref vocab matcat>，derived」，写的是 derived，不是反查索引。同行注明"改派生【请卷二回填】"，并且是"全部由 `rules.materials.matcatRules` 推出"。
- 卷三乙 :327 的 `matcatRules` 是 `{when, value}` 条件表。`when` 要读修正前的值、派生的 `producedBy` 和材料表组件类，求值依赖 RX 条件，结果是 set。
- 对照 :627 的 `producedBy` 就能看出差别：它是"加载期遍历一次材料表建成只读的反查索引"，形状是纯反查，所以能走 `.reverseIndex`。
- `categories` 缺三样东西：RX 的 set 结果原语、`matcatRules` 的规则数据（`world/rules/` 下尚无）、读 `producedBy` 的先后次序。所以登记 `missing:["data","primitive"]` 与裁定第 3 条"一次性设计整类原语、不零敲碎打"的口径一致。
- 由此推出：若现在硬做成加载器索引，就是在给 matcatRules 造一套卷文没有的求值路径，违反卡头第 1、2 条。

## 重点 2：勘误 1118k23

- 只此一处定义：§1.12 :389（未建登记）与 :390（反查索引）各为一条"唯一定义"。:40 文件布局只是引用，附录 :3163 是勘误记录，没有第二处另写白名单。
- 手续合规：勘误前快照 `版本快照/卷二-v17补26-勘误前-1118k23.md` 已存在；附录追加 1118k23 行，明写"不升版本号"，卷首仍是第十七版；现行快照已覆盖；第二轮只核已逐字节核过快照与正文。
- 附带情况：`现行.md` 里 78 行是同步此前正文落后的部分，不是新写内容，只核2 已说明，可接受。

## 重点 3：特判、放宽、造设施

- 在 `kernel/dimensions.mjs`、`validate/dimensions-validate.mjs`、`load/world.mjs` 里 grep `producedBy|categories|hardness|toughness|hydration|charYield|reactionProducts|'material'`，零命中，没有按维度名或表名特判。
- 反查索引走头部 `.reverseIndex` 的通用路径，任何满足形状的维度都走同一套。
- 测试期望值按卷文公式手算，没有抄仓库读数。测试按 `_unbuilt-derived.json` 同形状造输入，没有为测试造设施。
- 登记的 `unbuilt` 是跳过且不静默，读到即抛 `E-MOD-RX`，没有留"不限/空"之类的绕过口。
- 判据指纹：8 类 rev 各加一，经登记器重盖，全量测试通过，`pre_commit` 在只核2 中为 pass，我没有发现手改痕迹。

## 重点 4：接主线后 `load/world.mjs`

两边装配都在，且不重复：主线侧 `_distributions.json` 读取与 `installExpTable`、`installSampleDistributions` 装配（:62–:68）；本卡侧 `unbuiltDerived` 布局常量（:29）、`unbuilt` 读入（:78）。本卡对该文件的 diff 只有 3 处，且彼此独立。注释已更新为"编译树随加载结果交出"，没有留过期说法。

## 只核2 的记账项（不挡封，主会话封卡时办）

- `docs/问题.md:297–:298` 仍写"卡住，等李白裁定"，封卡后须按裁定第 5 条标已裁定。
- 未登记命名空间报 `E-RX-NS-UNKNOWN` 而非字面 `E-MOD-RX`。这是卷二 §1.12 :389、§2.9 :1183 与 RX 命名空间登记之间的措辞差，加载仍失败，不静默。我同意按只核2 记账，下次修订 §1.12 时择一。
- 反查索引只扫实体行，不含类别行；`agg` 编译通过但求值未建。两条当前数据无影响，补原语时一并定。
- 只核2 第 5 条（判据修订记录被删）：最终 rev 连续、`pre_commit` 通过，接主线后又经登记器重盖，可接受。
- 4-4a 执行者调试时用过一次 `sed -i`（PLAN 已记过），与本卡无关。
