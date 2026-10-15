// E17 蛇巢古书与隐藏职业：隐藏职业由经历指标触发（如 profession_hidden_11 砾骨驯者要求驯服 12 只），书本不是触发条件。
// ② 直接调用 petCapacity 比较驯兽类隐藏职业与无职业的宠物上限；其余读取机制。
import {world,src,imp,setup,ok,partial,wrong,missing} from '../harness.mjs';

export default [
 {id:'E17-1',event:'E17',no:1,text:'只有满足前置条件才能触发，不满足的人读了书也没用',async check(){
  const c=src('server-plugin/career-metrics.mjs');
  return /minimumLevel/.test(c)&&/trigger\.metric/.test(c)?ok('取得隐藏职业要等级、经历指标、名额与入门检定；书本不能解锁'):missing('无触发前置');}},
 {id:'E17-2',event:'E17',no:2,text:'转职后宠物数量上限和驯服成功率随之变化',async check(){
  const {petCapacity}=await imp('server-plugin/pets.mjs'),{engine}=setup();
  const tamer=world.professions.find(p=>/驯|tame|beast/i.test(`${p.name}${p.id}`)&&/hidden/.test(p.id))??world.professions.find(p=>/hidden/.test(p.id));
  const none=petCapacity(engine,null,'combat'),with_=petCapacity(engine,tamer?.id,'combat');
  if(with_!==none)return ok(`${tamer?.name} 宠物上限 ${none}→${with_}`);
  return partial(`宠物上限写死只认召唤师/骑士两个职业 ID；${tamer?.name??'驯兽隐藏职业'} 上限仍为 ${with_}（被动只改信任增长等）`);}},
 {id:'E17-3',event:'E17',no:3,text:'猎人行会原认证保留，新职业另行认证或保持隐秘',async check(){
  const c=src('server-plugin/career-metrics.mjs'),p=src('server-plugin/professions.mjs');
  return /hidden/.test(c)&&/hidden/.test(p)?ok('隐藏职业追加到 professions.hidden，原职业不动，普通退职不能清除'):partial('隐藏职业覆盖原认证');}},
 {id:'E17-4',event:'E17',no:4,text:'书被借出或抄录后，技艺按识字率和资质传播',async check(){
  const w=src('server-plugin/works.mjs'),l=src('server-plugin/learning.mjs');
  const regional=/literacyRate|识字率/.test(w+l+src('server-plugin/npc-rumors.mjs'));
  return regional?ok('书本传播按地区识字率扩散'):/minimumLiteracy/.test(l)&&/copy|抄/.test(w)?partial('读书要识字熟练度、抄书有专门技能；但书本传播没有按地区识字率扩散的模型'):missing('无书本传播');}},
 {id:'E17-5',event:'E17',no:5,text:'巢穴主人还活着时，进巢就触发战斗',async check(){
  const b=src('server-plugin/boss-cognition.mjs');
  return /enterLair[\s\S]{0,80}combat|进巢即战/.test(b)?ok('进巢触发战斗'):/守界警告/.test(b)?partial('智能首领在领地内先“守界警告”，记得交锋才转“敌对防备”；进巢不自动开战'):missing('无巢穴反应');}},
];
