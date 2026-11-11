# 卡 W8a：把 A3 测试里"归 S5"的待办题改成正式用例

工作树 F:/dnd-wt/S5W8A（分支 t-s5w8a，基于 s5a 最新 f126a2f2）。你可以在本分支上自己提交（用 `sh F:/dnd-tools/guard-commit.sh F:/dnd-wt/S5W8A "<msg>" <路径...>`，它先跑 overfit-guard）；不要 merge、不要切分支、不要动其他工作树。另一位执行者在 F:/dnd-wt/S5W4 改经济代码（market/ledger/finance-*/credit/shop/business/transport/works 等 server-plugin 文件）——**本卡原则上只改 tests/**；如果某题必须改 server-plugin 才有真实生产者，停下汇报，不要改。

## 背景
fix4-prelude（3be17c52）把没有真实生产者的测试前提改成了 `test.todo` 并标了归属。S5 的 W1（具名存单、存款债权）和 W2（独立柜台：真实租约/开户动作、内部转账）之后，大部分"归 S5"的已经转回正式用例。目前仍剩 5 处标"归 S5"：
- tests/a3-owner-ding.test.mjs 第 392、398 行（N–Q 组合用例：全部前提载入；导出/导入与重放保留来源、余额、纸本、阶段）
- tests/a3-score-self.test.mjs 第 214 行（r9 角色端点用解析后的对手方与精确账户用途）
- tests/a3-setup-institutions.test.mjs 第 101、147 行（独立柜台开户与钱袋分离、无效来源保持未满足；旧存款/当物/罚款/交付/维持债权保留债权不重新出资）
阶段收口要求：本阶段负责的判据 100%。

## 先读
F:/dnd/docs/产品原则.md；F:/dnd/docs/无限原野_开发指南v3.md 的 C.5、C.8（测试前提用真实游戏动作产生，即 setup.prelude，不为测试造接口或内容）。

## 要做
1. 对每一处：读 todo 文字写的"前提待真实动作"，在代码里找现在是否已有真实动作能产生这个前提（柜台：W2 的租约/开户；存单：W1 的具名存单签发；罚款/在岗机构/S4 空间类不归 S5）。
2. 已有真实生产者的 → 改成正式 `test`，前提用 setup.prelude 里的真实动作建立，断言按 todo 文字的原意写全，不放宽。
3. 一题里混有 S5 与其他阶段（S4/A3）前提的 → 把 S5 能满足的部分拆成正式用例，其余部分保留 todo 并把归属改为准确的阶段，写明还缺哪个真实动作。
4. 没有真实生产者、且生产者属于 S5 范围的 → 不要自己补生产者，列出缺哪个动作、应在哪个文件，汇报给主会话。
5. 不得删除测试、不得为测试造设施或写死特判、不得直接改 state 伪造前提（除非该测试文件现有同类用例本来就这样做，并在汇报里说明）。

## 验证
每个改动的文件单独跑：`TEMP=F:/dnd-tmp TMP=F:/dnd-tmp node --test --test-reporter=tap <文件>`，只看 `# pass`/`# fail`/`# todo`/`not ok` 行，不把完整输出读进上下文。汇报每个文件改前改后的 pass/fail/todo 数。

## 进程规则
只结束你自己启动并记下 PID 的进程，禁止按名称或批量杀 node；同时最多 2 个 node 测试进程（机器内存紧）。临时文件放 F:/dnd-tmp，用完删掉。不要用 git stash。

## 汇报（≤300 字）
改了哪些文件；每处 todo 的去向（转正式/拆分/仍缺生产者及缺什么）；命令与 pass/fail/todo 数；偏离本卡的地方；未解决的问题。
