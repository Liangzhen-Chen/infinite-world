| # | 问题 | 是/否 | 证据（文件:行 或 命令+输出末行） |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 本卡为门禁小卡，依据卡文原句"证据含占位下划线或为空即拒；第 6 项证据须写出确定的 diff 总行数（共 N 行）"，无卷文行号可引 |
| 2 | 没有按 id/名字/场景写特例 | 是 | tools/accept/lib/card-selfcheck.mjs：以题面是否含占位下划线判定，不按项号 6 特判；题面仍只读 docs/派活卡头规矩.md |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | tests/accept/card-selfcheck.test.mjs 新增：空证据、占位下划线、"约 +175 −20"、"diff 约 300 行"、"共约 300 行"、"共 300 行左右"、纯增删分量均拒 |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 测试用字面量证据串，题面取自规矩文件，不读仓库计数 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | diff 只含判据正则与对应测试 |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是 | card-selfcheck.mjs、card-selfcheck.test.mjs、本回报；diff 共 40 行（+38 −2） |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → pass 1094 / fail 0；`node tools/accept/run.mjs pre_commit` → "verdict": "pass" |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | 子代理回报的 diff 行数证据不再能含糊过关，卡交付可核；未违背北极星 |
