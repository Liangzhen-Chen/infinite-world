// E13 部盟与郡交战，玩家护送使节：赭牙部盟与鹿原郡有势力与法典，交战靠 warDiplomacy；
// 检查读取战事封锁、议和结算（endWar）、爵位派生与成对立场的实现。
import {world,src,imp,ok,partial,wrong,missing} from '../harness.mjs';

const war=()=>src('server-plugin/war-diplomacy.mjs');
export default [
 {id:'E13-1',event:'E13',no:1,text:'战时边关封闭，商队滞留，边境盐价铁价上涨',async check(){
  const byItem=/priceFactor\s*:\s*\{|itemFactors|byCategory/.test(war())||typeof world.rules.warDiplomacy?.priceFactor==='object';
  return byItem?ok('封路且按品类涨价'):/war-disruption/.test(war())&&/routes/.test(war())?partial(`开战封锁路线；价格乘统一倍率 ${world.rules.warDiplomacy?.priceFactor}，不分盐铁品类`):missing('战事不封路');}},
 {id:'E13-2',event:'E13',no:2,text:'护送途中按敌对立场触发拦截战斗',async check(){
  return /hostile[\s\S]{0,120}intercept|ambush|伏击/.test(src('server-plugin/transport.mjs')+war())?ok('敌对立场触发拦截'):missing('运输与护送没有按敌对立场的拦截或伏击；war_danger 只用于劫掠村庄（transport 的 intercept 是行动者主动扣货）');}},
 {id:'E13-3',event:'E13',no:3,text:'议和后关卡逐步重开，物价逐步回落',async check(){
  const w=await imp('server-plugin/war-diplomacy.mjs'),body=w.endWar?.toString()??'';
  if(/d\.remove\(path\(`war-disruption:/.test(body))return wrong('议和/停战 endWar 直接删除 war-disruption：路线与价格当场恢复战前');
  return /decay|回落|until/.test(body)?ok('议和后按天回落'):partial('议和处理未知');}},
 {id:'E13-4',event:'E13',no:4,text:'子爵的俸禄、封地、权限从册封日起生效（因功受封）',async check(){
  const t=src('server-plugin/titles.mjs'),grant=/title_grant|grantTitle|titleFor/.test(war());
  return grant?ok('议和功劳可受封，效果自册封日派生'):/grantedAt/.test(t)?partial('爵位效果由 title 记录从 grantedAt 起实时派生；但取得爵位只能走请封，调停议和不会因功受封'):missing('无爵位');}},
 {id:'E13-5',event:'E13',no:5,text:'部盟对玩家个人的好感与对王国的好感分开计算',async check(){
  return /standing:\$\{holder\}:\$\{target\}|`standing:\$\{/.test(src('server-plugin/standing.mjs'))?ok('立场按 (主体, 对象) 成对记录'):partial('立场不成对');}},
];
