K07 续做最后一块（主会话核对后划定所有权）：

**新增本卡所有权**：server-plugin/obligation-runtime.mjs 中实物 rent 义务的清偿段（你交接报告定位的那段）。PERFS6 已合入 s5a，未碰该文件；本卡工作树基于更早的 s5a，不影响。

要做：集体田（公共田）实物地租的清偿要把粮食真实转入聚落粮仓/公库库存账户（复用现有 granary/settlementStock 与 moveStock/transfer，不造第二份粮）；分次收获按累计应付差额结算、重放不重复入仓；减免仍只走 obligation-runtime 已有的修约/债权人减免途径。
新增该路径的手算用例并入 tests/s5-law-tenancy-sharing.test.mjs。

完成后按原卡验收全部重跑（含 s3-obligation-state、npc-obligations、invariants 四项），汇报同原卡。
