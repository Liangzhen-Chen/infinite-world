续做 FIXK08（正文 fixk08.body.md，共同规则 s5law-common.md）。你上一轮已提交为 t-fixk08@7bbd2a18（主会话代提交），合并关卡按**子测名**对比 s5a 拦下：

tests/s5-09.test.mjs 在 s5a 上只有 1 个子测失败（three native county round trips…），在本分支多出 3 个：
- :163 first arrival borrows private stock once…：census.rostered 期望 2132 实际 2141（本卡新增的 9 名到场行商进入登记人口）；
- :239 a keeper that a memory refers to stays individual…：期望 268 实际 204；
- :298 three statistics downgrades restore…：期望 1188 实际 1191。

上一轮你把"文件在 .base 也失败"当成同败，没有比到子测——以后同一文件在 .base 也失败时，要按子测名逐项对照（`node --test --test-reporter=tap` 的 not ok 名单）。

## 要做
逐项查清：是新增行商的真实后果（人口登记、掌柜正午向行商进货付钱、降级/升级往返时行商的统计口径），还是本卡改动带来的 bug（例如行商在统计降级时没有像其他具名人物一样折叠/恢复，导致往返不守恒）。真实后果就按新规律手算更新锚点并写推导注释；bug 修代码。往返守恒（钱、货、人口在降级→升级后一致）是硬要求，不能改成近似。
确认 s5-09 只剩 s5a 原有的那 1 项，再按共同规则跑清单（注意同文件逐子测对照）。汇报 ≤300 字。
