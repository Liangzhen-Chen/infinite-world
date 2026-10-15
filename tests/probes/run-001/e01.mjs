// E01 上游过伐，下游秋旱【离屏】：世界没有石坳/柳溪与上下游水系、伐木和矿场排污状态，情境不可构造；
// 以下检查读取现有机制（规则数据、模块导出与源码），机制出现后改为实测。
import {world,src,imp,ok,partial,missing,codeHas} from '../harness.mjs';

export default [
 {id:'E01-1',event:'E01',no:1,text:'下游水质下降，可追溯到上游伐木与矿场排污两个来源',async check(){
  if(codeHas(/waterQuality|水质|downstream|下游/))return partial('出现水质/下游机制，需补实测情境');
  return missing('没有水质、污染源或流域上下游状态（RW-04 未合入）');}},
 {id:'E01-2',event:'E01',no:2,text:'下游鱼价粮价上涨，上游柴价反而下跌',async check(){
  const w=await imp('server-plugin/wildlife.mjs');
  const fish=typeof w.wildlifePriceFactor==='function';
  const wood=/logging|伐木|timber/.test(src('server-plugin/settlement-trade.mjs'));
  return fish&&wood?ok('鱼价随种群、柴价随伐木'):fish?partial('鱼价只随野生种群稀缺度变化，粮价由灾害时钟掷骰；柴价与伐木无关联'):missing('无相关价格机制');}},
 {id:'E01-3',event:'E01',no:3,text:'腹泻病例集中在下游，药材需求上升',async check(){
  const water=(world.rules.hazardClock?.diseases??[]).some(d=>d.route==='water');
  return water?partial('有经水传播的病症（触发为洪水/饥荒/天气，与污染无关）；无药材需求机制'):missing('无水源传播病症');}},
 {id:'E01-4',event:'E01',no:4,text:'柳溪村民对石坳村的好感下降',async check(){
  return codeHas(/environmentalHarm|环境受损/)?partial('有环境受损立场'):missing('没有村对村、因环境受损而改变的立场');}},
 {id:'E01-5',event:'E01',no:5,text:'玩家回来后只能通过传闻知道“上游搞坏了水”，不知排污具体数字',async check(){
  const rs=src('server-plugin/return-summary.mjs');
  return /cognition/.test(rs)?partial('传闻与知情边界底座存在（返场汇总不给数字），但这件事本身不生成传闻'):missing('无知情边界');}},
];
