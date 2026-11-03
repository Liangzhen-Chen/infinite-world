【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

卡 A3-D 第 7 轮（返工：前置拒绝要通用，不能按语料报错文本列表）。工作区 F:/dnd-wt/A3D（分支 a3d；上一轮 A3D-sol6 的改动未提交，仍在工作区，在其上返工）。上一轮报告 F:/dnd/logs/sessions/A3D-sol6.final.txt。项目《无限原野》Node 规则引擎；依据 06 §6.9.3、§6.10.4、§6.9.5。
主会话审卡意见：server-plugin/action-rejection.mjs 用 15 条正则逐字匹配语料 24 条的中文报错，换一个未在语料里出现的前置失败（server-plugin 里约 739 处 throw new Error，大部分是业务校验）仍然裸抛——这是按测试集打补丁，不收。
要求：①建立类型化的动作拒绝：一个小的 ActionRejection（或同等）错误类 + reject(code, reason, {missing, repair}) 帮手；先把这 24 条涉及的处理器改为在源头抛类型化拒绝（稳定 code、缺失条件、修复建议写在源头）。②公共边界的通用规则：已路由的目录动作执行中抛出的类型化拒绝→结构化 rejected 回执；对尚未改写的旧业务校验（constructor===Error 且消息为面向世界的中文原因）同样转为结构化拒绝，code 用通用 E-ACTION-PRECONDITION，missing/repair 用通用形状（原因原文 + 当前场景可行替代：从现有 affordance/动作目录取，不编造）+ 兜底选项；TypeError/RangeError/英文内部不变量/原语策略异常照旧抛。③删除正则词表。④新增测试：挑 3 个不在语料里的处理器前置失败（不同模块），证明走通用路径得到结构化拒绝且零效果；程序错误仍抛的测试保留。⑤顺带：tests/a3-score-self.test.mjs「explicit trace alternative」现失败——兜底把原提案的 facts{name} 带进 open:leave_mark，被 mark-actions.mjs:55 E-MARK-FACT 拒绝；兜底转换应只传 intent/form/zone（原提案文字进 intent），查清是判分器还是引擎的兜底转换造成并在源头修，不放宽 mark 校验。
不改语料与判分口径。跑 tests/a3-*.test.mjs（浏览器 EPERM 如实记）、本卡相关模块测试、CORE；重跑 node tools/a3-score.mjs tests/fixtures/a3-intents-v2.json > F:/dnd/logs/sessions/A3D-r7-score.json。报告 F:/dnd/logs/sessions/A3D-r7.final.txt；回复 ≤150 字。
