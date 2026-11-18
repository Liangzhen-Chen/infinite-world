# 卡回报 ds-fclean（无读者大文件与过时文档清理；审查目录合一）

## 交卷前自查（卡头第三节八项）

| # | 问题 | 是/否 | 证据（文件:行 或 命令+输出末行） |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 本卡是仓库清理，不引设计卷文改写规则；执行依据为卡文与 `CLAUDE.md`「环境」「长期规矩」各条（仓库只在 F 盘、删前核实、不 force-push、不改写历史）。删除/移动的都是历史报告、草稿与旧文档，不改任何卷文正文；卷文中的路径引用只按卡文改路径。 |
| 2 | 没有按 id/名字/场景写特例 | 是 | 删除对象按"有无程序或现行文档在读"逐项核实，不按文件名/卷名特判；唯一的按名保留是卡文点名的"版本快照勘误手续"与"docs/probes 题集"，均记了读者出处。 |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | 本卡不新增限额或校验，不改门禁实现；无"不限/0/空"旁路可试。 |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 未新增测试；验收只跑卡文命令。 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 无代码逻辑改动、无假常量；只删文件、改路径引用与 `.gitattributes` 失效行。 |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是 | 累计：`docs/测试报告/` 298 个文件（29057 行删除）、`logs/sessions/` 1251 个旧记录（35543 行删除）、零读者旧文档 8 个文件（572 行删除）、过时文档 25 个 `git mv` 进 `docs/归档/`、三个审查目录 1318 个文件合一（零重名，无需前缀）、相关路径行约 130 处、`.gitattributes` 1 行删除；均在卡文文件所有权内（"上列删除与移动对象、引用它们的路径行"）。 |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | `node --test tests/*.test.mjs tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `ℹ tests 480`、`ℹ pass 480`、`ℹ fail 0`；`node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`；`node tools/accept/commit-hook.mjs` → `pre_commit pass 1aca3bc1…`。 |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | 仓库去掉 551M 旧引擎回放、旧草稿与过时文档，审查记录只有一处，找现行规矩与证据更快；未写死、未加特例、未跳过规则引擎、未缩小世界规模。 |

## 逐项记录（滚动更新）

### 已完成

1. **docs/测试报告/**（551M，298 个跟踪文件）：`git grep -n "docs/测试报告"` 在 `tools/ tests/ server-plugin/ schemas/ .githooks/ package.json` 无命中，无程序读；引用只在历史文档与 `docs/待办.md:5` 的后续报告路径约定里，不读现有文件。`git rm -r` 删除；`.gitattributes:1` 的 `docs/测试报告/*.txt` 规则随之删除。
2. **logs/sessions/**（7.3M，1264 个跟踪文件，全是 `.md` 派卡 prompt/body）：`git grep -n "logs/sessions"` 在代码目录无命中；保留被尚未解决事项或现行文档点名的 13 个：`A3-astra-plan.md`、`A3-owner-plan2.md`、`A3D-sol.body.md`、`FABSCAN.body.md`、`MKTDESIGN.body.md`、`PR02-cc-001.deferred.md`、`S2C-astra-plan.md`、`S5CT.final.md`、`WM1-inclusion.md`、`a4llm-research.final.md`、`jev-audit.final.md`、`s5-plan.final.md`、`s5w8-survey.md`；其余 1251 个删除。被引用的 `.txt/.json` 证据本就不入库（`.gitignore` 只放行 `*.md`），不受影响。
3. **零读者旧文档**：`R35A-verify.md`、`R35C-verify.md`、`docs/A3-接点归属2.md`、`docs/S5-02-价格迁移.md`、`docs/Claude校准.md`、`docs/Claude校准_用量.json`、`.codex/`（2 文件）——`git grep` 均无外部路径引用（Claude校准的命中只在自身，随文件删除）。
4. **有引用的过时文档**：25 个 `git mv docs/归档/`——`交接.md`、`PROGRESS.md`、`无限原野_开发指南v2.md`、`模型对比.md`、`j2-audit-1..4.md`、`m26-*`（6）、`m27-*`（5）、`r15-trades-a/b.md`、`编造排查清单-1111.md/.json`、`波次评分-新细则重评-1111.md`、`可玩版本-S5.md`。当前文档的路径引用已改：`docs/CHANGELOG.md:68`、`docs/世界设计/_AI现状盘点.md:58/72/83/93/97/122`、`docs/世界设计/AI/AI-05-…:26`、`使用说明.md:5`、`docs/骨架可核实事实设计.md:60`、`logs/arch/astra-proposal.md`。`world/drafts/` 里回执/理由字段的历史引文不改（属已审内容，改了可能破坏授权指纹），记在清理记录。`docs/probes/` 保留：卷十二 `:1346` M12-9 明确"保留，登记为题集条目与工具数据"，`docs/事件推演测试.md` 仍以它为提示词与题集目录。
5. **三个审查目录合一**：`docs/审查`（16 文件）+ `docs/审查记录`（21 个顶层条目 / 47 文件）+ `docs/统一底层设计/审查`（约 765 个顶层条目 / 1255 文件）全部 `git mv` 进 `docs/审查/`，合计 1318 文件；顶层零重名，未覆盖任何文件。`docs/审查/李白裁定-1117.md` 已在 CLAUDE.md 指定的新位置。路径引用已改：`docs/交接-1117.md`（16 处）、`docs/待用户确认.md`（4 处）、`docs/问题.md`（2 处）、`docs/迁移体检/清理卡二-清单.md`、`docs/统一底层调研/10-成熟游戏系统总表与卷目.md:604`、`docs/门禁提交流程重设方案.md:3/:183`、`logs/sessions/MKTDESIGN.body.md:4`、卷零/卷一/卷二里的 `审查/` 相对引用（共 115 处，改为 `docs/审查/`）、脚本 `docs/统一底层设计/脚本/卷十一/diff-1115y10c.mjs`、`docs/统一底层设计/脚本/只核/check-verb-emitter.mjs`。
   - 仍留旧路径的仅历史材料：`docs/统一底层设计/版本快照/*`（历史快照）、`docs/审查/*`（审查原文自身）、`docs/归档/PLAN-历史-至1118.md`、`docs/卡回报/ds-err12s.md`、`docs/统一底层设计/脚本/全书/乙8-入口名候选.mjs`（`git show 664151c4:` 的历史 blob 路径，改了会让历史读取失败）、两份历史 `.diff`。逐个列在清理记录。

### 核过但按卡文保留（有读者）

6. **world/drafts/**（347M，7937 个跟踪文件）：有程序与现行文档在读——26 个 `world/design/*.mjs` 以它为 draftRoot/预算根（`docs/…` 里举了 6 条），`docs/待办.md:11`、`docs/待用户确认.md:27/:160`、`docs/问题.md:21`、`docs/新底子方案-v0.md:37`。卡文"有读者的不删"，已回报主会话。
7. **docs/统一底层设计/版本快照/**（409M，1372 个跟踪文件）：是勘误手续"勘误前快照"的存放处；`docs/新底子方案-v0.md:430` 定义手续，卷零/卷一/卷二大量按 `版本快照/<卷>…` 引用，CLAUDE.md 规定"追加勘误前快照、不升版本"。无程序读它，但属现行手续存储；按卡文"记读者、不删并回报"，存不存快照由主会话另定。
8. **docs/probes/**（1.2M）：卷十二 `:1346` M12-9 登记"保留，登记为题集条目与工具数据"；`docs/事件推演测试.md:6-8/:33` 仍用其提示词与题集。
