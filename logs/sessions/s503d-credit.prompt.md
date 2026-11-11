【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

# 卡 s503d-credit：修 S5-03 交卡门禁发现的 8 个真回归

门禁在 s5a 基线上对比（基线全过），以下 8 个测试文件在本工作区稳定复现失败（主会话已重跑两次确认）：

| 文件 | 失败用例 |
|---|---|
| tests/village-ledgers.test.mjs | 加载即失败：`发布骨架或引用事实已改变 loc_bs_yupo`（tools/content-pipeline.mjs:229，经 w1-village-profiles-content.mjs:80） |
| tests/w1-village-profiles.test.mjs | 同上 |
| tests/w1-villages-publish.test.mjs | 四村合并仅精确已审before/after可保留深度修订，fake凭证、后续冲突和错误旧版本仍拒绝 |
| tests/npc-depth.test.mjs | 三条已审核旧措辞可定点升级…；既有发布入口验证全部补充审核…；首次四村安装仍要求原候选与新补充逐条审核… |
| tests/npc-depth-next.test.mjs | 原入口逐批验证，重复不重写，篡改新一批不能覆写人物钱物 |
| tests/s3-obligation-state.test.mjs | 利息闭式仅查询；360天不逐日写，终止后不累计，提前还款保留旧取整口径（第 32 行 actual 61 expected 60） |
| tests/a1-daily-probes.test.mjs | D29 借小额钱款 / D30 按时还钱：…钱庄柜面按抵押放贷照旧判定，到期前还清无逾期 |
| tests/scale.test.mjs | 真实日/月推进、5000消息提示与存档读写守住大世界预算 |

## 主会话诊断（先核实再动手）
1. 前 5 个大概率同一根因：你改了 world/design/w1-village-profiles.mjs 的 villageLawCodes()，在 W1 已审核发布的村庄法典里直接加 recognition.legalTender。这改变了 W1 已发布内容的骨架，审批管线把它判为篡改。已发布内容只能经审批管线改。正确做法参照 S4 对村庄法典 procedure 的处理（trialProcedureFor：W1 骨架不变，后发布的 S5 层作为独立已审补充叠加，校验时与"原版"或"原版+已审补充"精确比对）。法定货币认可应作为 s5-credit 内容的一部分叠加，不要改 W1 的生成函数。另外 validateVillageLedger 里 `try{...}catch{comparable=null;}` 吞异常，删掉，出错要报出来。
2. s3-obligation-state：利息取整口径变了。查是不是 S5-03 的利率派生改动影响了旧债务的闭式利息。设计若要求旧口径保留，就改实现，不改测试。
3. a1-daily-probes D29/D30、scale：查失败断言与 S5-03 改动的关系。scale 若是性能预算超限，找出新增开销来源（比如每次推进重算汇率或存息），按需缓存或改成闭式计算，不要放宽预算。

## 要求
- 只改与上述回归相关的部分；不改测试断言，除非能逐处说明设计依据（写进汇报）。
- 修完把这 8 个文件逐个单独跑一遍，外加 tests/s5-03.test.mjs、tests/credit.test.mjs、tests/finance-bank.test.mjs、tests/a3-owner-ding.test.mjs。scale 若在沙箱内跑不了就列出来。
- 不要跑 F:/dnd-tools/slow-tests.tsv 里的慢档测试。

## 汇报（≤250 字，F:/dnd/logs/sessions/s503d-credit.final.md）
每个回归的根因与改法、跑过的测试与结果、偏离、未解决。
