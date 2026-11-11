# 卡 p0a-review：交叉审查 P0a（有界执行器与可恢复采集）

工作区 F:/dnd-wt/GATEQ（分支 t-gateq，提交 9dd97498）。只读审查，不改任何文件。

## 审什么
P0a 由 Claude 子代理实现：tools/gate/runner.mjs、tools/gate/reporter.mjs、tools/gate/watchdog.ps1、tools/gate/test-impact/collect.mjs（改动见 `git show 9dd97498 -- tools/gate/test-impact/collect.mjs`）、测试在 tools/gate/test/ 与 tools/gate/test-impact/test/collect-host.test.mjs。设计依据：tools/gate/DESIGN.md §4.2、§6.1、§12 P0a 段、§14。

重点找会让"失败被当成通过"或"任务卡住无人发现"的缺陷：
1. classify() 的终态判定：有没有任何路径让 exit≠0、超时、崩溃、事件流截断、0 用例、未授权 skip/todo、取消、只有文件级失败、reporter 未加载、reporter 本身抛错 变成 PASS。
2. 断言指纹：同名不同断言是否能区分；行号漂移是否误判；actual/expected 为大对象/循环引用/undefined 时是否稳定。
3. 超时与杀进程：截止计时、grace、按 PID+创建时间核对、进程树结束、PID 复用、子进程已退出但孙进程仍占用 stdout 管道时会不会永远等待（exit 后 1.5 秒兜底是否足够）、`exitedForce` 在 let 声明前被闭包引用是否安全。
4. 心跳与 watchdog.ps1：心跳文件路径约定、90 秒阈值、告警去重、非零退出；安静但健康的长测试会不会误报；刷屏死循环是否最终由硬截止拦住。
5. collect：shard 写入原子性、恢复逻辑（哪些会重跑，哪些不重跑）、unavailable 记录是否一定被 select.mjs 选中（select.mjs:42 按 exitCode≠0）、commit 变化时的行为、map 每 10 文件更新的并发安全。
6. 测试本身：有没有只测"生成了文件"而不测真实断言；fixtures 是否覆盖了声明的场景。

可以在沙箱内单独运行纯逻辑测试 `node --test --test-isolation=none tools/gate/test/runner.test.mjs`（主机测试会 EPERM，列出即可，不要尝试绕过）。

## 汇报（≤300 字，F:/dnd/logs/sessions/p0a-review.final.md）
按严重程度列缺陷：文件:行、问题、能触发它的具体输入、建议改法。没有问题的项写"未发现"。不贴完整代码。
