# K16 r3 已收尾，性能未验收

结束时间2026-11-01 03:16 UTC。本轮未提交。生产实现和验收已经停止，不要重新启动已过队列。主报告K16.final.md、逐文件K16-validation.md/K16-final-results.json；性能K16-perf-block.md；外跑K16-r3-outside-pending.txt。

按缺口觅食、近水30分钟算家务、有限库存乘含路程效率择源均已实现；r2包含式依赖、不推进展开、纯状态输入记忆保留。严格月/长短步/重载的私有逾期通知在实际边界生成。最后生产改动后仅修固定在场夹具和精确价格锚点，未再改实现。

卡内64：60完整通过，教育普通10通过而追加FIELDS40分钟未完，record-index FIELDS40分钟未完，remote-generation基线同名失败1文件，advance-registry金差2项/运行断言3通过。CORE、invariants、全部s5-law-*、最新npc-schedule12（334.68s）、family7（429.19s）、health7（767.15s）、migration7（424.94s）、I31 18、T1648、save6、monster-content33（2377s含T162）均过；原TODO保留。怪物价格最终S4/D14，供给2+(4−2)=4，限幅3，基价3×3=9，整文件已过。

30日r2→r3缺粮/缺水户日：公仓0/30→0/30，城镇1366/0→722/0，怪物63/0→0/0，无户113/60→60/60，远方0/60→0/30；305/305覆盖，unknown2人60/60不展开，有限库存账差0。30日取水9720中9300近水，觅食5348中城镇4084、82.07%时间路程。最终审计及summary JSON保留。

性能未通过：30日×2基线121777/CPU138953ms，r2 589821/627765，r3最终514900/564906（+322.82%/+306.54%）。不要改用中间352637或389560冒充末版。最终latest-profile；依赖线索是journey/plan共用全体forage依赖及课程无关人物日程比较，主会话规划后续。

金表12297字段，完整JSON值；numeric functions基线全同，full/quiet状态摘要变化；没有重生成快照。最终affected253（最后健康夹具改后已重跑，集合不变），卡内64有3额外不在affected，主会话余192见merge-gate-pending。禁区空、unexpected untracked空、git diff --check通过。

已清42件临时脚本/检查副本/原始V8日志；自有Node0、待启动Python wrapper0。过程一次短时4th Node约6秒已披露，排除验收；之后启动门控制并发。8125个本轮base-src副本已清，保留原有.base/.base-index/.base-src。保留K16-audit.mjs及审计/剖析/数值/金表/测试/进程记录。清理见K16-r3-cleanup.json；所有K16-r3-*.mjs/.py/.lock均已删除，别再调用旧临时脚本。

下一步由主会话：处理性能阻碍；外跑两个FIELDS文件；按逐项字段表审核金差异；192文件合并关卡按子测名对照。TOWNFOOD负责城镇零售供给，本卡没有改market/shop或FIXT164生产函数/agriculture。不能按已验收卡合并。
