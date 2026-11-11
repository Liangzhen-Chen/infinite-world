# K16 r3 性能未验收

最终生产代码同工具30日×2：9729614a基线121777ms、用户CPU138953ms；r2为589821/627765；r3最终514900/564906，墙钟较基线慢322.82%、CPU慢306.54%，不满足+3%。较r2墙钟减少12.70%，仍不能视为性能通过。中间正确择源版352637/392719、库存输入修正版389560/431937均非末版，不用最小值替代最终值。主会话外测perf-gate为最终门槛。

测量原始数据依次为K16-paired-base.json、K16-paired-balanced.json、K16-r3-paired-latest.json。工具输入仍为farm-pests-fixture的bench种子，连续两次30日等待，未缩小世界或参与家户。最多2个测试加1个测量Node；墙钟有并发噪声，CPU本身同样明显超限。最初旧bench-farm-pests的95.961秒数据与这里的配对工具不同，不混用。

临时测量脚本在交卡时删除；其完整核心如下，在对应树根目录、TEMP/TMP=F:/dnd-tmp下用Node模块模式运行。基线和当前采用相同方法，计时不含载入/建角；外测请保持相同并发条件。

```js
import {setup,wait} from './tests/farm-pests-fixture.mjs';
console.log({pid:process.pid});
const {c,run}=setup('bench');let state=c;
const start=Date.now(),cpu=process.cpuUsage();
for(let i=0;i<2;i++)state=await wait(run,state,30*1440,`b${i}`);
const used=process.cpuUsage(cpu);
console.log({elapsedMs:Date.now()-start,userCpuMs:Math.round(used.user/1000),systemCpuMs:Math.round(used.system/1000)});
```

最终30秒CPU采样30173ms，推进到minute8220，calendar调用253952。含子调用占比：约束buildPersonConstraints 0.28%、业务readPersonBusiness 0.88%、recordsMemo 2.90%；日程堆25.17%、dailyPlan21.17%、来源计划18.17%、readJourney15.56%、route6.18%、educationCourses18.79%、sameCourseInputs14.71%。包含子调用的百分比不可相加，窗口不代表整段60日的平均。原始K16-r3-latest-profile.json，比例K16-r3-latest-profile-percent.json，窗口K16-r3-latest-profile-window.json。中间final-profile命名历史保留，不能当最终剖析。

与r2最终K16-final-profile-percent.json比较：日程堆31.35→25.17%、dailyPlan25.93→21.17%、来源计划15.88→18.17%、readJourney8.99→15.56%、route8.58→6.18%、课程18.02→18.79%、recordsMemo1.42→2.90%。约束0.25→0.28%、业务0.77→0.88%，未重新出现最初的约束/业务排除名单缓存爆炸。不同采样窗口仅作热点定位，不把占比差当整段节约时间。

本轮已落地：先减私粮与公仓份额后排觅食；近水计家务、不生成日程或route调用；有限库存乘包含往返的每份效率选源，排除0库存；地理记忆随显式地理状态失效；当日水质/体积仍实时读取。没有用无限库存、降低真实工时、跳过家户或进程内每日决策缓存换速度。r2包含式依赖与远方懒生成修复保留。

教育投影修正仍有成本：库存及普通通勤变化先比较其实际家户日程；无关的口粮消耗/通勤不改变课程对象，真正日程变化和教师能力变化仍失效。普通行程投影扩展后的最终测比中间值慢；这是待主会话核对的责任路径线索，不能仅据单组并发数据断言全部差值由它造成。新旧数值摘要完全相同，相关普通及FIELDS测试单独验收。

依本卡AGENTS的止损规则，本轮不再增加性能修法。下一步交主会话据最终采样规划来源计划、行程和课程输入投影的调用频率；不得把本卡合并为已验收或通过性能。验收详细结果及当前未完项见K16-r3-validation.json，最终交接见K16.final.md。

具体依赖线索：household-subsistence的journeyInputs由取水与食物共同使用，包含household_forage；每次有限库存写入也会使取水的journey记忆失效，虽然后者不消费觅食库存。planInputs同样包含全体household_forage，近水/完整公仓户的家务读取仍经过dailyPlan。education-state.sameCourseInputs逐个比较变化人物的家户日程，包括课程无关人物；是否可按实际授课消费者及同户劳力缩小输入需主会话核对。以上是当前代码可见调用链，尚未量化各项单独耗时，也没有在本轮追加实施。

审计种子k16-audit的30日实际流水提供另一条规模线索（与bench种子不同，不当作bench调用计数）：取水9720条，其中9300条属于近水家务，不产生独立出行节点；觅食5348次，其中城镇4084、怪物640、无户/流动624。城镇觅食占用1700898分钟，其中往返1395918分钟（82.07%）。全部觅食流水quantity>0且等于其已分配工时的maximumHarvest，没有把0库存往返记成有效采获。城镇722个缺粮户日均无配置食品零售货架，供给链属主会话划出的TOWNFOOD范围；本卡仍保留其真实觅食行程，不能据此声称TOWNFOOD完成或当前性能合格。按类别工时见K16-r3-audit-summary.json。
