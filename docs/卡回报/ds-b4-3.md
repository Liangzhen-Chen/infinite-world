# ds-b4-3 回报（4-3 衔接：接最新主线，判据指纹经登记器重盖，行为不变）

| # | 问题 | 是/否 | 证据（文件:行 或 命令+输出末行） |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 卷十二 :1230「**R12-14.3 修订要带两样东西**：……两样都满足，修订才能登记，判据版本号加一。检测器的判定逻辑变了而版本号没加，是 E-ACC-CRITERION-UNVERSIONED。」；卷十二 :467「`tools/accept/criteria.json` ｜ 每个扫描类别的判据版本号与修订记录 ｜ 登记器 ｜ 否」（登记器是唯一写者）；卷十二 :612「`rev` 自 1 起连续到现 `rev`，旧记录一条不删」。原句见下「依据原句」 |
| 2 | 没有按 id/名字/场景写特例 | 是 | 本卡只做 rebase 与登记器重盖；diff 仅 tools/accept/criteria.json 11 类的 log/rev/print 与本回报文件，无任何按 id、文件名、卷名的分支（`git diff --stat` 只列这两件） |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | seed_sites 需连升两级，登记器按"rev 只许不变或加一"当场拒跳级：`E-ACC-ITEM-FORM seed_sites: rev must stay or step by one with a log entry` 与 `E-ACC-CRITERION-UNVERSIONED seed_sites: detector code changed without rev`；改为两次登记各升一级后通过；指纹全由登记器按当前闭包算，未手改 |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 未加新测试、未改旧测试；criteria 的 print 由 `tools/accept/register.mjs` 现算现盖，不是抄仓库当前读数 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 4-3 的代码/测试/种子表一字未改：逐个文件 `git diff --stat 5316b7df HEAD -- <4-3 全部代码文件>` 只有 tests/accept/runner.test.mjs 的 9 行（主线自己的 hunks，自动合入），其余为空；criteria 只经登记器写盘 |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是 | diff 共 92 行：`tools/accept/criteria.json`（70 插入 22 删除，登记器写）；另本回报文件随提交更新。无第三件 |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | `node --test tests/*.test.mjs tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `ℹ tests 512 / ℹ pass 512 / ℹ fail 0`；`node tools/accept/run.mjs pre_commit` → `"verdict": "pass"` |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | 4-3 的种子键与骰值键实现重新接上主线，块 6 要用到的确定性求值基础不因主线推进脱节；行为零变化，未写死、未开特例、未跳规则引擎 |

## 依据原句

- `docs/统一底层设计/卷十二-验收与自动扫描.md:1230`（R12-14.3）：
  `**R12-14.3 修订要带两样东西**：一是把这处误报做成 must_pass 用例；二是原有全部 must_fail 用例仍然报出。两样都满足，修订才能登记，判据版本号加一。检测器的判定逻辑变了而版本号没加，是 E-ACC-CRITERION-UNVERSIONED。`
- `docs/统一底层设计/卷十二-验收与自动扫描.md:467`：
  `| tools/accept/criteria.json | 每个扫描类别的判据版本号与修订记录 | 登记器 | 否 |`
- `docs/统一底层设计/卷十二-验收与自动扫描.md:612`（S12-16 段内）：
  ``rev``（整数，首次登记为 1）加 `revisions` 列表（每条含 `rev`、日期、改动摘要、出处卡号，`rev` 自 1 起连续到现 `rev`，旧记录一条不删）

## 做了什么

- `git rebase origin/master`：4-3 的 8 个提交接到最新主线；冲突只在 `tools/accept/criteria.json`，按卡文取主线一侧（rebase 里 `--ours`），再用 `tools/accept/register.mjs` 重盖。
- 主线期间给同 11 个扫描类别各升过一级 rev（error-codes.mjs 入检测器闭包，卡头自查卡）。重盖时主线的旧修订记录原样保留，4-3 的条目顺延到其后：seed_sites 连升两级（rev 3→4→5，两次登记），其余 10 类各升一级；没删一条旧记录，没手写指纹。
- `docs/卡回报/ds-b4-3.md`：更新为本次衔接的实况。

## 验收命令与末行

- `node --test tests/*.test.mjs tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `ℹ tests 512 / ℹ pass 512 / ℹ fail 0`
- `node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`
- `node tools/accept/commit-hook.mjs`（回报文件在暂存区时，与提交关口同一调用）→ 退出码 0、`pre_commit pass`
- `git log --oneline origin/master..HEAD` → 9 条：4-3 的 8 个提交接在最新主线 c7868929 之后，末条为本衔接提交
