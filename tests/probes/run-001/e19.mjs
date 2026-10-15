// E19 名士诗作与识字率【离屏】：没有“NPC 名士作品在王国流传”的机制（作品只能由玩家创作，名士名录只登记玩家），情境不可完整构造；
// 检查读取作品传播、识字率派生、学馆工钱、名望与课程期限的实现。
import {src,world,ok,partial,wrong,missing} from '../harness.mjs';

export default [
 {id:'E19-1',event:'E19',no:1,text:'作品的传播速度随沿途识字率和驿传网络变化',async check(){
  const w=src('server-plugin/works.mjs');
  return /spread|传播/.test(w)&&/literacy|识字/.test(w)?ok('作品沿路线按识字率传播'):missing('没有 NPC 作品，也没有作品传播模型');}},
 {id:'E19-2',event:'E19',no:2,text:'执教后识字率按学生人数逐年上升，不一蹴而就',async check(){
  const e=src('server-plugin/education-state.mjs');
  return /knowledgeProficiency\(e,s,teacher,'skill_literacy'\)-e\.rules\.npcGrowth\.teach\.teacherMargin/.test(e)?ok('识字率由居民实际识字进度派生；开课有容量，先生须高出一截'):partial('识字率未由进度派生');}},
 {id:'E19-3',event:'E19',no:3,text:'沈砚俸金由公库或玩家私人支付，两者不重复扣款',async check(){
  const e=src('server-plugin/education.mjs');
  const publicFund=/spendPublic|公库拨款|publicFund/.test(e);
  return publicFund?ok('学馆可由公库或私人出资，不重复扣款'):/school_fund/.test(e)?partial('先生工钱只从学馆账户出（不重复扣）；资助学馆只能由玩家出钱，公库没有办学拨款入口'):missing('无学馆');}},
 {id:'E19-4',event:'E19',no:4,text:'作品名声让诗人和赞助人的好感、声望上升',async check(){
  const w=src('server-plugin/works.mjs'),n=src('server-plugin/notables.mjs');
  return /sponsor[\s\S]{0,80}fame|赞助人[\s\S]{0,40}名/.test(w+n)?ok('赞助人分享名声'):/fame/.test(w)?partial('只有玩家自己的作品给玩家加名望；赞助 NPC 名士无回报，NPC 也没有名望账'):missing('作品无名声');}},
 {id:'E19-5',event:'E19',no:5,text:'沈砚离开后学堂需要续聘老师，否则停办',async check(){
  const e=src('server-plugin/education.mjs');
  return /school_close/.test(e)&&/360/.test(e)?ok('课程有截止时间（≤360 天）并可停办，雇佣合同同时到期'):partial('课程无期限');}},
];
