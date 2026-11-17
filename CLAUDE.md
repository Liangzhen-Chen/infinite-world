@AGENTS.md

# 每轮必守规矩（无限原野；李白 11-17 定，压缩后从磁盘重读）

只放规矩，不放进度。进度与裁定见 docs/当前状态.md、docs/PLAN.md 末节、docs/统一底层设计/审查/李白裁定-1117.md。项目通则另见 AGENTS.md。

## 分工

- 主会话只派卡、看结果、合并；具体活交执行者。
- 写或改：Sonnet 5.5 中档。难的（内核、加载器、跨三卷以上、同项错两次）：Opus 5.5 中档。不用 Fable。
- 派卡时写明模型全名与 effort（claude-sonnet-5-5 / claude-opus-5-5，medium）。

## 只核分档

- 写代码的卡、跨卷改动、牵涉裁定的卡：另一个 Opus 5.5 中档只核。
- 只改单个文档的小修（勘误、计数、措辞、记账）：另一个 Sonnet 5.5 中档只核。
- Sonnet 核两轮不过、或它自己报拿不准：升 Opus 5.5 中档再核。
- 只核判"必须改"的：改完至少派 Sonnet 5.5 中档复核一次再封，主会话不得改完不复核。
- 只核原始输出入库 docs/统一底层设计/审查/，路径写进提交说明。PLAN 记谁核、为何这一档。

## 开工与排期

- 每块开工前先做迁移体检（docs/迁移体检/块N.md），经另一个 Opus 只核放行后才派写码卡。
- 排期每条"谁先谁后、谁能并行"注明卷、节、行；没有出处的不排。
- 共用文件同一时段只由一路独占写，其他路只读；冲突即串行。

## 回报

- 每次回报李白写明照的是哪一卷，带卷标题（如"卷三甲《物质本源》"）。
- 每卡封进 master 都发通知：`D:/Anaconda/python.exe F:/dnd-tools/notify/enqueue.py <delivered|blocked|answer> "<≤300字>" "<≤300字>" < /dev/null`，再跑 `D:/Anaconda/python.exe F:/dnd-tools/notify/notify.py < /dev/null`（必须带 `< /dev/null`）。
- 卷文推不出、卷文矛盾、要改裁定方向的：停下报李白，不自补、不自选。

## API 派卡（周四 2026-11-19 10:00 前）

- 具体活一律 `claude -p` 带 API 密钥跑：`sh F:/dnd-tools/api/run-card.sh <模型全名> medium <worktree> <卡文文件>`。worktree 放 F:/dnd-wt/api-<卡名>，卡文放 F:/dnd-tmp/api-cards/。
- 密钥只从用户环境变量 CLAUDE_API_KEY 在子进程内读，不得打印、复制、写入仓库或日志。
- PLAN 记每卡花费（total_cost_usd）、写的模型、只核的模型及原因；每天报一次 API 累计，到 150 美元单独报李白一次。

## 仓库与环境

- 仓库只在 F 盘，不许用亮圳的 C 盘；临时文件放 F:/dnd-tmp。
- 不改 C 盘全局设置、全局 CLI、PATH 与钩子。
- 提交钩子已挂（.githooks/pre-commit），不许 --no-verify。
- 禁用：node -e、node -p、python -c、heredoc、sed -i、任何输出重定向写文件（含 > /dev/null、tee）。写文件只用 Write/Edit。
- 已封卷只走封卷后勘误：先追加"勘误前"快照、不覆盖旧快照、不升版本号、历史修订记录不回改。
- 不准硬编码：修复落在规则层或原语层，不按单个 id、文件名、卷名特判。
- 压缩只在块与块之间由亮圳或李白发 /compact（带要保留的重点），主会话不自行清空会话。

## 长期规矩（自旧记忆）

来源为旧项目记忆目录文件名；只列规矩，不列进度。

- 产品大原则：由世界状态能推出的值（价格、权限、额度）一律派生不写死；规则允许的意图须能做或得到合理反馈（拒绝附可行替代），不靠关键词或固定名单限定玩家（quality-and-acceptance）。
- 门槛不降、不为过关改题；机制测试的期望值按设计公式手算成数字字面量，不用被测函数算（quality-and-acceptance）。
- 进度如实、不粉饰；出错先认错、说清原因与改正，不辩解（quality-and-acceptance、reporting）。
- 技术问题自己定并直接做，写成"已定：…理由…"，不写"请你定"；只有花钱、删数据、扩权限、放宽亮圳硬规则才停下报李白；不采信执行者自设的防御性限制（decision-boundaries）。
- 默认在现有架构上渐进演化；必须迁移的改动单列理由、代价与不迁后果，交李白拍板（decision-boundaries）。
- 同一步失败两次先亲自读证据查到根因（文件:行），再定方向；查不到根因不拿去让人批准降标准或后移，不拿自设约束挡住病根（diagnose-before-deferring、decision-boundaries）。
- 难技术卡点（尤其 LLM 工程）二次补丁无效即先查 GitHub 与提供方接口的现成做法，再决定自研（prefer-existing-solutions）。
- 不为旧存档做兼容：规则只一版、不加复演版本标记、不保留新旧两套分支；只保同版确定性；"不动原存档"仅指不改不删存档文件（no-old-save-compat）。
- 流程或工具改版上线后清旧脚本、旧工作树（先删 junction）、旧日志，只留新版；清前列单核对（workspace-cleanup）。
- 世界出现系统性不现实结果按"缺底层规律"处理，修在规律层；规律给分布，允许个别离群，随机走种子保持确定性（unreal-outcome-means-missing-law）。
- 所有系统建在统一底层上：统一维度、统一入口、系统间走统一接口，禁为具体物品、神、地区写专项规则（unified-foundation-freeze）。
- 程序不读任何自然语言判逻辑，只读数值维度与固定代号；文字、画面、声音只是显示层，中英可互换；输入边只做"文字→封闭代号集合内的动作代号"，翻不出退回菜单，不猜（no-natural-language-logic）。
- 跨卷裁定前先全书 Grep 该概念的定义处；跨卷共用定义只一处，别处只引用；裁定附牵连清单一次改清；正在改的卷转交其作者（cross-volume-ruling-check、two-round-residual-rule）。
- 每卷最多审两轮：首轮列全真问题，二轮只核改好与新矛盾；小毛病记账；二轮后仍有真问题或要改结构，停报李白（two-round-residual-rule）。
- 全书扫描命中须在收卷前同批补完，不收卷后重开；修改轮不加新设计，确要加须写必要理由由李白核；依赖未落稿共用定义的卷，定义落稿并改引用前不收卷（no-reopen-after-seal）。
- 只核判"不可封卷"，改后须再派另一只核，书面写"可封卷"才封；提交说明不代替只核报告（seal-needs-written-pass）。
- 查不准的事实或概念定义可查 britannica.com 等可靠来源，标条目名与链接，查网只派 Opus 中档（britannica-source）。
- 派卡必写"文件所有权"段，以"不得改"为禁区；转述执行者交接里的事实进新卡前先 grep 核实（executor-playbook）。
- 派卡开头写明本机只准用的命令；写完正则或字符串转义后逐个核对 \d、\.、\s 是否被吃掉；只结束自己启动并记录的进程，不按名批量杀（executor-playbook）。
- 设计先过两轮独立审再交执行者实现，不自批后补审（executor-playbook）。
- 合并前逐分支核 git rev-parse 等于审过的提交；回归对比按失败用例名，不按文件（stage-workflow）。
- 阶段收尾先定 5～8 条可验证清单，清单外新问题登记后续阶段，除非正是某条不达标的根因（stage-workflow）。
- 失败必须带证据归四类：预期影响／真实错误／旧预期不适用／来源未明；守恒、账目、日程断言不得以"预期影响"为由改（batch-method）。
- 腾讯云跑测前须两轮审查，且至少一名独立于实现者的审查者批准，批准绑定实际内容哈希，内容变即重审；不绕门禁；执行者回报给理由、不变量、证据（independent-review-before-test）。
- 不在命令里用 & 挂后台，后台一律用 run_in_background；不写 until/sleep 轮询；预计超 15 分钟的任务写进度日志并设超时（machine-and-ops）。
- 腾讯云上传副本只在三条证据齐备（本机哈希一致、取代者在、无依赖）时清理，不通配（upload-lifecycle）。
- 推送前对新增提交扫密钥模式与 >50MB 文件；不读不输出 secrets（github-remote）。
- 汇报用用户的语言（中文）；预估要有实测依据；大任务先报花费；凡停下等李白决定必须入队 blocked 通知（reporting）。
