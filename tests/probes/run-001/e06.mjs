// E06 夏夜铁铺火：河湾铁匠铺 bld_hw_forge 替代；铁匠铺设为起火，河湾磨坊设为玩家所有且已毁（condition=0）并出租，
// 推进 3 天（租金到期日设在第 1 天后）。核对者 e06.mjs 同情境，缩短推进以控制时长。
import {setup,src,world,DAY,recs,once,ok,partial,wrong,missing,codeHas} from '../harness.mjs';

const forge='bld_hw_forge',mill='bld_hw_mill';
const scenario=once(async()=>{
 const S=setup();let c=structuredClone(S.doc);
 c.state.buildings??={};c.state.buildings[forge]={...(c.state.buildings[forge]??{}),burning:true,fireDepth:0,fireSince:c.state.minute,fireTick:c.state.minute,fireSpread:false};
 const tenant=world.npcs.find(n=>n.id.startsWith('npc_hw_')&&n.id!=='npc_hw_chenbai').id;
 c.state.buildings[mill]={...(c.state.buildings[mill]??{}),owner:'player',condition:0};
 c.state.npcs[tenant].coins=10000;
 c.state.records['asset_lease:probe']={category:'contract',kind:'asset_lease',id:'asset_lease:probe',subject:mill,tenant,owner:'player',use:'commercial',monthlyRent:400,paid:400,status:'有效',
  createdAt:c.state.minute,deadline:c.state.minute+120*DAY,nextRent:c.state.minute+DAY,location:mill,source:'probe'};
 const coins0=c.state.player.coins;
 c=await S.wait(c,1,'e06a');
 const touched=Object.entries(c.state.buildings).filter(([,b])=>b.burning||b.fireSince!==undefined).map(([k,b])=>({id:k,condition:b.condition,burning:b.burning}));
 c=await S.wait(c,2,'e06b');
 return {touched,rent:c.state.player.coins-coins0,lease:c.state.records['asset_lease:probe'],cases:recs(c,'legal_case').map(([,r])=>r)};
});

export default [
 {id:'E06-1',event:'E06',no:1,text:'蔓延受风向和间距影响，不会无差别烧全镇',async check(){
  const s=await scenario(),f=src('server-plugin/facilities.mjs');
  const direction=/wind\w*\.(?:direction|dir)\b|windDirection|风向/.test(f);
  return direction?ok(`按风向与间距蔓延；波及 ${s.touched.map(t=>t.id).join(',')}`):partial(`只按风速放大距离、不看风向；一天内波及 ${s.touched.map(t=>`${t.id}(${t.condition})`).join(',')}`);}},
 {id:'E06-2',event:'E06',no:2,text:'粮仓存粮损失，当地粮价短期上涨',async check(){
  const f=src('server-plugin/facilities.mjs');
  return /inventory|stock|库存|存粮/.test(f)?partial('火灾触及建筑存货，但未接价格'):missing('火灾只降建筑 condition，不影响存货与价格');}},
 {id:'E06-3',event:'E06',no:3,text:'租约按毁损条款处理，未修复期间停收租金',async check(){
  const s=await scenario();
  return s.rent>0?wrong(`建筑 condition=0 仍收租 ${s.rent} 铜`):ok(`毁损期间未收租（租约 ${s.lease?.status}）`);}},
 {id:'E06-4',event:'E06',no:4,text:'庙的偏殿受损后香火下降，可发起募捐修缮',async check(){
  const f=src('server-plugin/faith.mjs');
  if(/修缮等待设施接口/.test(f))return missing('寺观“修缮”用途直接报“修缮等待设施接口”；香火与建筑损毁无关');
  return /condition/.test(f)?ok('寺观修缮接到设施 condition'):partial('有寺观修缮入口，香火未随损毁变化');}},
 {id:'E06-5',event:'E06',no:5,text:'铁匠可能被追究失火责任，赔偿邻舍',async check(){
  const s=await scenario(),offense=Object.values(world.rules.law.templates).some(t=>t.penalties?.negligent_fire);
  if(s.cases.some(c=>/fire/.test(c.offense)))return ok('失火立案');
  return offense?partial('法典有失火罪，但本次火灾未立案'):missing(`无失火/纵火罪名，火灾后立案 ${s.cases.length} 起`);}},
 {id:'E06-6',event:'E06',no:6,text:'起火时铁匠按日程不在铺内（起火源接 NPC 日程）',async check(){
  return codeHas(/炉火未熄|forgeLeftLit|unattended/)?ok('起火源接 NPC 收工后炉火未熄'):partial('NPC 日程存在，但起火只能由玩家或魔法点燃，日程与火源对不上');}},
];
