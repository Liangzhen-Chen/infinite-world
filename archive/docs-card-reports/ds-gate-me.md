| # | 问题 | 是/否 | 证据（文件:行 或 命令+输出末行） |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 卷六 :398（transferable 等四字段只许账本读）；卷十八 :337（持有种类行同名字段）；李白 11-19 10:4x 裁定①（按行出自哪张表认） |
| 2 | 没有按 id/名字/场景写特例 | 是 | path_access.mjs isForeignRow：按链根绑定的函数体读词表记录（.family+.entry）且不碰 economyResources 判行出处，不认文件名/字段名 |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | 追不到绑定（参数、解构、跨文件）仍计；函数体同时碰 economyResources 仍计；tests/accept/api-callers.test.mjs 新增测试含 param.mjs、mixed.mjs 两例 |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 夹具与单测自造前提，断言命中文件名单 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 只改检测器，真实仓库代码未动 |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是 | diff 共约 130 行；path_access.mjs、cases.json、criteria.json（经登记器）、api-callers.test.mjs、bypass 夹具 35/43、本回报 |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs：tests 671 pass 671 fail 0；run.mjs pre_commit verdict pass，failed 仅余 A12-4.5、S12-2、S12-3（改前就有） |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | 去掉 vol6.A6-1.1.a 对持有种类行 transferable 的误报，门禁不再因 holdings.mjs:639 不过；未违背北极星 |

偏离/说明：path_access 是共用检测器，改动使 cross_write、display_read、dual_write、version_fork 指纹变，已经登记器各 rev+1（登记器整行替换，故补全各行原 log/criterion/source，旧记录一条未删）；module_edge rev 20；新增用例 module_edge-35（必报）、43（必不报）。判据按 readerSystems 参数启用（带它的读条目查的是资源种类行）。

追加（接主线 5-5 后）：rebase 时 criteria.json 取主线版，再经登记器给 module_edge、cross_write、display_read、dual_write、version_fork 各在主线号上 rev+1（记录“接主线 5-5 后重盖，判定口径不变”，旧记录未删）；path_access.mjs 的 `cond =params` 改为 `cond = params`。全量 node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs：692 pass 0 fail；pre_commit verdict pass，failed 仅 A12-4.5、S12-2、S12-3，不含 vol6.A6-1.1.a。
