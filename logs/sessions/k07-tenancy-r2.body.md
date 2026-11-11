K07 续做（主会话核对后划定所有权，可以开工实现）：

**新增本卡所有权**（PERFS6 不碰这些文件）：
- world/actions/core.json:38–39 的 rent_in / rent_out 槽位：加租制（定额/分成）、毛产/净产基数、分成比例、投入承担、期末未收作物安排等必要槽位；只走动态目录，复用现有 world_trade 租约处理器，**不扩 extension/tools.mjs 静态参数**；静态提示必须仍 ≤10593（tests/a3-tool-surface.test.mjs、a3-owner2-T、action-registry 中的预算断言）。
- tests/action-registry.test.mjs:150–168 的槽位允许表：登记有意新增的参数，保留逐项 deepEqual 与未知槽位拒绝。
- server-plugin/action-consent.mjs:32–37,53–66,137–151：扩展同意条款白名单与匹配，保证旧的定额租同意不能替代新的分成租，也不能替没谈过的作物处分条款作数。

其余按你交接报告里已定位的卡内位置实施（finance-assets 签约/到期分开定额与分成、分成在真实收成后派生且先付只抵一次、到期未收作物不再无依据转给出租人；contract-state 纳入真实条款投影；agriculture 收成事件接租金基数、按累计应付差额处理分次与重放；household-budget 扣除未结算分成负担；减免复用 obligation-runtime 修约/债权人减免，不另建灾害自动免租）。

验收按原卡；另加 a3-tool-surface、a3-owner2-T（静态提示预算）、actions-catalog、action-registry。汇报同原卡，附五个手算锚点实测。
