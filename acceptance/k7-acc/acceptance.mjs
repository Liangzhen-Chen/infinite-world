// K7 所有者处分权·独立验收。全部断言写成世界里的现象，只用真实动作（world_act / world_propose）驱动，
// 观察只读存档文档（state、ledger、holdings）与 tests/helpers/ledger-audit 的守恒对账，不调规律层内部函数。
// 用法：TEMP=F:/dnd-tmp TMP=F:/dnd-tmp node F:/dnd-tmp/k7-acc/acceptance.mjs   → acceptance.json，退出码 0=全过
// 三种结果：pass（现象成立）/ fail（现象不成立）/ blocked（前提现象没法用真实动作造出来，等同未过，单独计数便于定位）。
import fs from 'node:fs/promises';
import {execSync} from 'node:child_process';
import {world,newGame,fork,act,propose,auditLedger,holdingsOf,presentNpcs,acct,qty,trackOne,REPO} from './lib.mjs';
const {conservation}=await import(`file:///${REPO}/tests/helpers/ledger-audit.mjs`);
const OUT='F:/dnd-tmp/k7-acc/acceptance.json';
const monsters=world.monsters,M=new Map(monsters.map(m=>[m.id,m]));
const results=[];
function check(group,phenomenon,outcome,evidence){results.push({group,phenomenon,result:outcome===true?'pass':outcome===false?'fail':outcome,evidence});return outcome===true;}
const blocked=(group,phenomenon,evidence)=>check(group,phenomenon,'blocked',evidence);
const at=async(c,dest)=>(c.doc.state.location===dest?null:act(c,'core:move',{destination:dest}));
const say=r=>r?`${r.status}${r.reason?'：'+r.reason:''}${r.routed?` [${r.routed}]`:''}`:'无';
// 守恒：账本审计为空，且每种资源 Δ总量 = 源净流入 − 汇流出（tests/helpers/ledger-audit.conservation）。
function books(c,before){const a=auditLedger(c.doc.ledger),k=before?conservation(c.engine,before,c.doc):[];return {ok:!a.length&&!k.length,audit:a.slice(0,3),conservation:k.slice(0,3)};}
// "那是别人的 / 没有处分权"的语义；以及不许出现的"不是交锋对象 / 不支持 / 手段不能产生"之类答非所问。
const OWNERSHIP=/须.{0,4}本人.{0,4}持有|他人|别人|旁人|不属于你|不是你的|并非你|归.{0,6}所有|物主|主人|所有权|所有人|无权|没有.{0,8}(权|依据|资格)|须经.{0,8}同意|未经.{0,8}同意|未得.{0,6}同意|需要对方答应|属于/;
const OFFTOPIC=/不是交锋对象|不支持|不能产生这种效果|现有手段不能完成|没有已登记|未登记|不在你能确认/;
function refusedAsOthers(group,phenomenon,r){
  const ok=r.status==='rejected'&&OWNERSHIP.test(r.reason??'')&&!OFFTOPIC.test(r.reason??'');
  return check(group,phenomenon,ok,{status:r.status,reason:r.reason,code:r.code,applied:r.applied});
}
// —— 真实取得 ——
async function buyFromAnyone(c,item,n=1){
  const seller=Object.entries(c.doc.state.npcs).find(([,x])=>(x.inventory?.[item]?.quantity??x.inventory?.[item]??0)>=n);
  if(!seller)return {status:'rejected',reason:`世界里没有 NPC 库存有 ${item}`};
  await at(c,seller[1].location);return act(c,'core:trade.buy',{seller:seller[0],item,quantity:n});
}
async function equipForGather(c,species,backTo=null){
  const g=M.get(species)?.wildlife?.gather,log=[];if(!g)return log;
  const have=i=>(c.doc.state.inventory?.[i]?.quantity??0);
  if(g.tool&&!have(g.tool))log.push(`买工具 ${g.tool}：${say(await buyFromAnyone(c,g.tool))}`);
  for(const x of g.consumes??[])if(have(x.item)<x.amount)log.push(`买耗材 ${x.item}：${say(await buyFromAnyone(c,x.item,x.amount))}`);
  if(backTo&&c.doc.state.location!==backTo)log.push(`回到 ${backTo}：${say(await act(c,'core:move',{destination:backTo}))}`);
  return log;
}
const ownedLiving=(doc,sp)=>Object.entries(doc.state.creatures??{}).filter(([,x])=>x.owner==='player'&&x.hp>0&&(!sp||sp(M.get(x.species)??{}))).map(([id])=>id);
const herdsOf=(doc,f=()=>true)=>Object.values(doc.state.records).filter(r=>r.category==='husbandry'&&f(r));
const ownedPets=doc=>[...Object.keys(doc.state.pets??{}),...holdingsOf(doc,{holder:'player',kind:'tamed_by'}).map(h=>h.subject)];
// 取得一只某类自有活物：①向任何持有它的人买（NPC 库存里的活物物种，或别人名下的生灵）；②开局即有；③驯服本地栖地的野生个体。
async function acquireAnimal(c,filter,label){
  const path=[];
  const sellers=Object.entries(c.doc.state.npcs).filter(([,n])=>Object.keys(n.inventory??{}).some(k=>M.has(k)&&filter(M.get(k))));
  const otherOwned=Object.entries(c.doc.state.creatures??{}).filter(([,x])=>x.owner&&x.owner!=='player'&&x.hp>0&&filter(M.get(x.species)??{}));
  path.push(`①买：库存有${label}的 NPC ${sellers.length} 个，别人名下的${label} ${otherOwned.length} 只`);
  for(const [id,n] of sellers.slice(0,3)){const sp=Object.keys(n.inventory).find(k=>M.has(k)&&filter(M.get(k)));await at(c,n.location);
    path.push(`core:trade.buy 向 ${id} 买 ${sp}：${say(await act(c,'core:trade.buy',{seller:id,item:sp,quantity:1}))}`);
    const got=ownedLiving(c.doc,filter)[0];if(got)return {id:got,path,via:'买'};}
  for(const [cid,x] of otherOwned.slice(0,3)){await at(c,x.location);
    path.push(`core:trade.buy 向 ${x.owner} 买 ${cid}：${say(await act(c,'core:trade.buy',{seller:x.owner,item:cid,quantity:1}))}`);
    const got=ownedLiving(c.doc,filter)[0];if(got)return {id:got,path,via:'买'};}
  for(const h of herdsOf(c.doc,r=>r.owner!=='player'&&filter(M.get(r.species)??{})).slice(0,2)){const loc=c.doc.state.npcs[h.owner]?.location;if(loc)await at(c,loc);
    path.push(`core:trade.buy 向畜群主 ${h.owner} 买一只 ${h.species}：${say(await act(c,'core:trade.buy',{seller:h.owner,item:h.species,quantity:1}))}`);
    const got=ownedLiving(c.doc,filter)[0];if(got)return {id:got,path,via:'向畜群主买'};}
  const start=ownedLiving(c.doc,filter);path.push(`②开局：名下${label} ${start.length} 只`);if(start.length)return {id:start[0],path,via:'开局'};
  const local=monsters.filter(m=>filter(m)&&m.tamingRule&&world.rules.wildlife?.habitats?.some(h=>h.id===m.wildlife?.habitat));
  path.push(`③驯：可驯的${label}物种 ${local.length} 种（驯兽须先学艺练到 100，完整学习路径在 F 组实走）`);
  for(const sp of local.slice(0,2)){const h=world.rules.wildlife.habitats.find(x=>x.id===sp.wildlife.habitat);
    const mv=await at(c,h.location);if(mv?.status==='rejected'){path.push(`去 ${h.location}：${mv.reason}`);continue;}
    const g=await trackOne(c,sp.id,8);if(!g){path.push(`追踪 ${sp.name}：未遇到`);continue;}
    path.push(`core:pet.contact ${sp.name}：${say(await act(c,'core:pet.contact',{target:g}))}`);
    path.push(`core:pet.tame ${sp.name}：${say(await act(c,'core:pet.tame',{target:g}))}`);
    const got=ownedLiving(c.doc,filter)[0]??ownedPets(c.doc).find(p=>filter(M.get(c.doc.state.creatures?.[p]?.species)??{}));if(got)return {id:got,path,via:'驯服'};}
  path.push('缺：取得路径（属 K2/K1，不在 K7 期望）');return {id:null,path};
}
// 宰杀自有活物：先走登记动作 core:combat（真实回合），不行再提 world_propose 致死 vital。
async function slaughter(c,id){
  const tries=[];
  for(let i=0;i<30;i++){const r=await act(c,'core:combat',{target:id,intent:'attack'});if(i===0)tries.push(`core:combat：${say(r)}`);
    const x=c.doc.state.creatures?.[id];if(r.status==='rejected'||!x||x.hp<=0||x.corpse)break;}
  if(!(c.doc.state.creatures?.[id]?.hp<=0||c.doc.state.creatures?.[id]?.corpse)){
    for(let i=0;i<5;i++){const r=await propose(c,'宰了自家这头牲口',[{op:'vital',target:id,delta:-(c.doc.state.creatures?.[id]?.hp??999),type:'physical'}]);if(i===0)tries.push(`world_propose vital：${say(r)}`);if(r.status==='rejected'||c.doc.state.creatures?.[id]?.hp<=0)break;}
  }
  const x=c.doc.state.creatures?.[id];return {dead:!!x&&(x.hp<=0||!!x.corpse||x.status==='死亡'),tries,corpse:x?.corpse??null};
}
// 一整条"取得→宰杀→取材→守恒"现象链（山羊、牛、鸡共用，不分物种写特例）。
async function slaughterChain(group,label,filter){
  const c=newGame(`acc-${group}`);
  const got=await acquireAnimal(c,filter,label);
  if(!got.id){blocked(group,`玩家用真实动作得到一只自己的${label}`,{path:got.path});
    for(const p of [`宰杀自己的${label}后它死去并留下尸体`,`对尸体取材，行囊里多出该物种掉落表里的物品`,`宰杀与取材后账本审计为空、资源守恒`])blocked(group,p,'前提未成立：没有自己的'+label);return;}
  const species=c.doc.state.creatures[got.id]?.species,drops=M.get(species)?.drops??[];
  check(group,`玩家用真实动作得到一只自己的${label}（${got.via}）`,true,{creature:got.id,species,path:got.path});
  const xp0=c.doc.state.player.xp;
  const kill=await slaughter(c,got.id);
  check(group,`宰杀自己的${label}后它死去并留下尸体`,kill.dead&&!!kill.corpse,{tries:kill.tries,corpse:kill.corpse});
  if(!kill.dead){blocked(group,'对尸体取材，行囊里多出该物种掉落表里的物品','前提未成立：没宰成');blocked(group,'宰杀与取材后账本审计为空、资源守恒','前提未成立：没宰成');return;}
  const equip=await equipForGather(c,species,c.doc.state.creatures[got.id]?.location);
  const before=c.doc,inv0=Object.fromEntries(drops.map(d=>[d.item,c.doc.state.inventory?.[d.item]?.quantity??0]));
  const g=await act(c,'core:wildlife.gather',{target:got.id});
  const gained=drops.map(d=>({item:d.item,expect:d.amount,got:(c.doc.state.inventory?.[d.item]?.quantity??0)-inv0[d.item]}));
  check(group,`对尸体取材，行囊里多出该物种掉落表里的物品（${drops.map(d=>d.item+'×'+d.amount).join('、')||'掉落表为空'}）`,
    g.status==='committed'&&drops.length>0&&gained.every(x=>x.got===x.expect),{gather:say(g),equip,gained,note:drops.length?undefined:'物种掉落表为空：按现有数据不应得到任何东西（肉的派生属 K4）'});
  const harvest=Object.entries(c.doc.ledger?.flows??{}).filter(([k])=>k.startsWith('src:harvest')).reduce((n,[,v])=>n+v,0)-Object.entries(before.ledger?.flows??{}).filter(([k])=>k.startsWith('src:harvest')).reduce((n,[,v])=>n+v,0);
  const b=books(c,before);
  check(group,'宰杀与取材后账本审计为空、资源守恒（产物经 src:harvest 入账）',b.ok&&harvest===gained.reduce((n,x)=>n+x.got,0),{...b,harvestFlow:harvest});
  return {c,id:got.id};
}
const isGoat=m=>/羊/.test(m.name??''),isCow=m=>/牛/.test(m.name??''),isChicken=m=>/鸡(?!蛇)/.test(m.name??'');
// ========== A 山羊 ==========
await slaughterChain('A 山羊','山羊',isGoat);
// ========== B 牛、鸡与一切实际能拿到的活体 ==========
await slaughterChain('B 牛','牛',isCow);
await slaughterChain('B 鸡','鸡',isChicken);
{const c=newGame('acc-B-any'),got=await acquireAnimal(c,()=>true,'活物');
 const kinds=got.id?[c.doc.state.creatures[got.id]?.species]:[];
 check('B 全部活体','至少有一种活物能用真实动作成为玩家自己的',kinds.length>0,{path:got.path,species:kinds});
 if(got.id){const k=await slaughter(c,got.id);check('B 全部活体',`实际拿到的活物（${kinds[0]}）可宰`,k.dead,{tries:k.tries});}}
// ========== C 自家物品：卖、送、丢弃、毁坏、改装 ==========
// 单件用"一次买一把"的真实交易取得（买一件即登记单件）；卖、送走账户，丢弃、毁坏、改装作用于单件。
const knivesOf=(doc,owner)=>Object.values(doc.state.itemInstances??{}).filter(u=>u.owner===owner&&u.item==='item_kitchen_knife'&&u.status==='持有');
let soldKnife=null;
{
  const G='C 自家物品',c=newGame('acc-C');await at(c,'bld_hw_forge');const smith='npc_hw_duanyan';
  // 铁匠只有两把切刀：买两把切刀（一把卖、一把丢），再买一把锤、一把钳（一件砸、一件改）。
  for(const it of ['item_kitchen_knife','item_kitchen_knife','item_smith_hammer','item_smith_tongs'])await act(c,'core:trade.buy',{seller:smith,item:it,quantity:1});
  const mineOf=it=>Object.values(c.doc.state.itemInstances??{}).filter(u=>u.owner==='player'&&u.item===it&&u.status==='持有');
  check(G,'玩家一件一件买下两把切刀、一把锤、一把钳，名下有四件单件',mineOf('item_kitchen_knife').length===2&&mineOf('item_smith_hammer').length===1&&mineOf('item_smith_tongs').length===1,{instances:Object.values(c.doc.state.itemInstances??{}).filter(u=>u.owner==='player').map(u=>u.item+':'+u.id)});
  // 卖
  let before=c.doc;const pc=c.doc.state.player.coins,pk=qty(c.doc,acct('player','item_kitchen_knife')),sk=qty(c.doc,acct(smith,'item_kitchen_knife')),own0=new Set(knivesOf(c.doc,'player').map(u=>u.id));
  const sell=await act(c,'core:trade.sell_to',{buyer:smith,item:'item_kitchen_knife',quantity:1});
  soldKnife=[...own0].find(id=>c.doc.state.itemInstances?.[id]?.owner===smith)??null;
  check(G,'卖：把一把切刀卖给铁匠，玩家少一把、铁匠多一把，玩家钱变多',sell.status==='committed'&&qty(c.doc,acct('player','item_kitchen_knife'))===pk-1&&qty(c.doc,acct(smith,'item_kitchen_knife'))===sk+1&&c.doc.state.player.coins>pc,{sell:say(sell),coins:[pc,c.doc.state.player.coins],soldInstance:soldKnife});
  check(G,'卖之后账本审计为空、守恒',books(c,before).ok,books(c,before));
  // 送
  before=c.doc;const r0=qty(c.doc,acct('player','item_ration')),n0=qty(c.doc,acct(smith,'item_ration'));
  const gift=await propose(c,'把一份干粮送给铁匠',[{op:'transfer',from:acct('player','item_ration'),to:acct(smith,'item_ration'),qty:1}]);
  check(G,'送：把一份干粮送给铁匠，玩家少一份、铁匠多一份',gift.status==='committed'&&qty(c.doc,acct('player','item_ration'))===r0-1&&qty(c.doc,acct(smith,'item_ration'))===n0+1,{gift:say(gift)});
  check(G,'送之后账本审计为空、守恒',books(c,before).ok,books(c,before));
  // 丢弃：把一把自己的切刀丢在铺子地上——玩家不再持有它
  before=c.doc;let k=knivesOf(c.doc,'player')[0],p0=qty(c.doc,acct('player','item_kitchen_knife'));
  let drop=await propose(c,'把这把切刀丢在铺子里不要了',[{op:'move',entity:k?.id,to:c.doc.state.location,mode:'drop'}]);
  if(drop.status==='rejected')drop=await propose(c,'这把切刀我不要了',[{op:'holding.close',holding:holdingsOf(c.doc,{subject:k?.id,kind:'owns'})[0]?.id??`owns:${k?.id}`,reason:'abandoned'}]);
  check(G,'丢弃：玩家把自己的切刀丢下后不再持有它',drop.status==='committed'&&(c.doc.state.itemInstances?.[k?.id]?.owner!=='player'||qty(c.doc,acct('player','item_kitchen_knife'))===p0-1),{drop:say(drop)});
  check(G,'丢弃之后账本审计为空、守恒',drop.status==='committed'&&books(c,before).ok,books(c,before));
  // 毁坏
  before=c.doc;k=mineOf('item_smith_hammer')[0];
  const brk=await propose(c,'把我自己的锤子砸烂',[{op:'destroy',entity:k?.id}]);
  const after=c.doc.state.itemInstances?.[k?.id];
  check(G,'毁坏：砸烂自己的锤子后，它不再是一件可用的工具',brk.status==='committed'&&(!after||after.status!=='持有'||(after.durability??100)<=0),{destroy:say(brk),instance:after??null});
  check(G,'毁坏之后账本审计为空、守恒',brk.status==='committed'&&books(c,before).ok,books(c,before));
  // 改装
  before=c.doc;k=mineOf('item_smith_tongs')[0];const f0=JSON.stringify(c.doc.state.itemInstances?.[k?.id]);
  const mod=await propose(c,'把自己的铁钳钳口改窄，改成夹细件用的',[{op:'fact.set',entity:k?.id,field:'condition',value:80}]);
  // 改装只在有现成配方路径时属 K7 期望（主会话 11-04 第 5 条）；被拒且没有配方路由时如实标 blocked。
  const modOk=mod.status==='committed'&&mod.applied.length>0&&JSON.stringify(c.doc.state.itemInstances?.[k?.id])!==f0;
  if(modOk){check(G,'改装：改装自己的铁钳后，这件单件的状态确实改变',true,{modify:say(mod)});check(G,'改装之后账本审计为空、守恒',books(c,before).ok,books(c,before));}
  else{blocked(G,'改装：改装自己的铁钳后，这件单件的状态确实改变',{modify:say(mod),why:'缺：配方路由（通用门卡 4），不在 K7 期望'});blocked(G,'改装之后账本审计为空、守恒','前提未成立：改装没有配方路由');}
}
// ========== D 自家畜群：分群、宰其中一只、卖其中一只 ==========
{
  const G='D 自家畜群',c=newGame('acc-D');
  const herds=()=>Object.entries(c.doc.state.records).filter(([,r])=>r.category==='husbandry'&&(r.owner==='player'||r.holder==='player'||holdingsOf(c.doc,{holder:'player',kind:'owns'}).some(h=>h.subject===r.id)));
  const anyHerd=Object.values(c.doc.state.records).filter(r=>r.category==='husbandry');
  const popOwns=holdingsOf(c.doc,{holder:'player',kind:'owns'}).filter(h=>String(h.subject).startsWith('pop_'));
  const tries=[];
  for(const h of anyHerd.filter(r=>r.owner!=='player').slice(0,2)){const loc=c.doc.state.npcs[h.owner]?.location;if(loc)await at(c,loc);
    for(const item of [h.id,h.species])tries.push(`core:trade.buy 向 ${h.owner} 买 ${item}：${say(await act(c,'core:trade.buy',{seller:h.owner,item,quantity:h.count}))}`);
    if(herds().length)break;}
  if(!herds().length&&!popOwns.length){
    blocked(G,'玩家用真实动作得到一群自己的牲畜',{world:`畜群记录 ${anyHerd.length} 个（${anyHerd.map(h=>h.name+'属'+h.owner).join('、')}）；玩家名下 0 个`,tries,why:'缺：取得路径（动作目录没有买卖、分户或开立畜群的动作；属 K2/K1）'});
    for(const p of ['分群：从自家畜群里分出两只，畜群少两只、多出两只归玩家的个体','分群前后头数守恒：畜群减少数 = 个体化计数 = 新个体数','宰其中一只：分出的一只被宰后死去，畜群头数不再变','卖其中一只：另一只卖给别人后归买方，玩家得钱','畜群操作后账本审计为空、资源守恒'])blocked(G,p,'前提未成立：没有自家畜群');
  }else{
    check(G,'玩家用真实动作得到一群自己的牲畜',true,{tries});
    const [hid,h]=herds()[0]??[popOwns[0].subject,{}];const n0=h.count??0,before=c.doc,cr0=new Set(ownedLiving(c.doc));
    const acc=Object.keys(c.doc.ledger?.accounts??{}).find(k=>k.startsWith(hid+'|'))??Object.keys(c.doc.ledger?.accounts??{}).find(k=>k.includes(hid))??`${hid}|population|population`;
    const split=await propose(c,'从自家畜群里牵出两只单独看管',[{op:'transfer',from:acc,to:'sink:individuated|population|action',qty:2},{op:'create',kind:'creature',template:h.species},{op:'create',kind:'creature',template:h.species}]);
    const fresh=ownedLiving(c.doc).filter(x=>!cr0.has(x)),n1=c.doc.state.records[hid]?.count;
    check(G,'分群：从自家畜群里分出两只，畜群少两只、多出两只归玩家的个体',split.status==='committed'&&n1===n0-2&&fresh.length===2,{split:say(split),count:[n0,n1],fresh});
    const ind=(c.doc.ledger?.flows?.['sink:individuated|population|action']??0)-(before.ledger?.flows?.['sink:individuated|population|action']??0);
    check(G,'分群前后头数守恒：畜群减少数 = 个体化计数 = 新个体数',n0-n1===ind&&ind===fresh.length,{individuated:ind});
    if(fresh.length>=2){const k=await slaughter(c,fresh[0]);check(G,'宰其中一只：分出的一只被宰后死去，畜群头数不再变',k.dead&&c.doc.state.records[hid]?.count===n1,{tries:k.tries});
      const buyer=presentNpcs(c.doc)[0],pc=c.doc.state.player.coins,s=await act(c,'core:trade.sell_to',{buyer,item:fresh[1],quantity:1});
      check(G,'卖其中一只：另一只卖给别人后归买方，玩家得钱',s.status==='committed'&&c.doc.state.creatures?.[fresh[1]]?.owner===buyer&&c.doc.state.player.coins>pc,{sell:say(s)});}
    else{blocked(G,'宰其中一只：分出的一只被宰后死去，畜群头数不再变','前提未成立：没分出两只');blocked(G,'卖其中一只：另一只卖给别人后归买方，玩家得钱','前提未成立：没分出两只');}
    check(G,'畜群操作后账本审计为空、资源守恒',books(c,before).ok,books(c,before));
  }
}
// ========== E 他人所有：每一类都试一次，必须被拒绝，且理由是"那是别人的/没有处分权" ==========
{
  const G='E 他人所有',c=newGame('acc-E');await at(c,'bld_hw_forge');
  const smith='npc_hw_duanyan',item='item_kitchen_knife',A=acct(smith,item);
  // 先用真实交易让铁匠名下有一把登记过的单件（玩家买一把再卖回去），他人单件与自家单件用同一种提案形状。
  await act(c,'core:trade.buy',{seller:smith,item,quantity:1});const mine=knivesOf(c.doc,'player')[0]?.id;await act(c,'core:trade.sell_to',{buyer:smith,item,quantity:1});
  const theirs=c.doc.state.itemInstances?.[mine]?.owner===smith?mine:null;
  refusedAsOthers(G,'他人物品·送：把铁匠的切刀拿来给自己',await propose(c,'把铁匠的切刀拿来',[{op:'transfer',from:A,to:acct('player',item),qty:1}],{},{commit:false}));
  refusedAsOthers(G,'他人物品·毁坏：把铁匠的切刀砸了（毁损入汇）',await propose(c,'把铁匠的切刀砸了',[{op:'transfer',from:A,to:`sink:destroy|${item}|action`,qty:1}],{},{commit:false}));
  if(theirs){
    refusedAsOthers(G,'他人物品·毁坏：把铁匠名下那把登记过的切刀砸碎',await propose(c,'把铁匠那把切刀砸碎',[{op:'destroy',entity:theirs}],{},{commit:false}));
    refusedAsOthers(G,'他人物品·丢弃：把铁匠名下那把切刀扔掉',await propose(c,'把铁匠那把切刀扔掉',[{op:'move',entity:theirs,to:c.doc.state.location,mode:'drop'}],{},{commit:false}));
    refusedAsOthers(G,'他人物品·改装：改装铁匠名下那把切刀',await propose(c,'把铁匠那把切刀改成剥皮刀',[{op:'fact.set',entity:theirs,field:'condition',value:80}],{},{commit:false}));
  }else for(const v of ['毁坏','丢弃','改装'])blocked(G,`他人物品·${v}：铁匠名下那把登记过的切刀`,'前提未成立：卖回后没有登记成铁匠的单件');
  refusedAsOthers(G,'他人钱财·送：把铁匠的钱拿来给自己',await propose(c,'把铁匠的钱拿来',[{op:'transfer',from:acct(smith,'coin_river'),to:acct('player','coin_river'),qty:1}],{},{commit:false}));
  { const d=fork(c,'sell');await at(d,'bld_hw_qingdeng');
    refusedAsOthers(G,'他人物品·卖：把铁匠的切刀卖给酒馆的林穗',await act(d,'core:trade.sell_to',{buyer:'npc_hw_linsui',item,quantity:1},{commit:false})); }
  // 他人建筑：林穗的青灯酒馆
  await at(c,'bld_hw_qingdeng');const tavern='bld_hw_qingdeng',owner=c.doc.state.buildings?.[tavern]?.owner??'npc_hw_linsui',ownsT=holdingsOf(c.doc,{subject:tavern,kind:'owns'})[0]?.id??`owns:${tavern}`;
  refusedAsOthers(G,'他人建筑·毁坏：拆了林穗的酒馆',await propose(c,'把这间酒馆拆了',[{op:'destroy',entity:tavern}],{},{commit:false}));
  refusedAsOthers(G,'他人建筑·卖：把林穗的酒馆过户卖掉',await propose(c,'把这间酒馆过户给别人',[{op:'holding.transfer',holding:ownsT,newHolder:'player'}],{},{commit:false}));
  refusedAsOthers(G,'他人建筑·出租：把林穗的酒馆租出去',await act(c,'core:trade.rent_out',{seller:presentNpcs(c.doc).find(n=>n!==owner)??owner,business:tavern,days:1},{commit:false}));
  // 他人土地与作物：河湾村公田
  await at(c,'loc_hw_fields');
  refusedAsOthers(G,'他人田地·种植：在村里的公田上私自播种',await act(c,'core:farm.private_sow',{settlement:'loc_hw',areaMu:1},{commit:false}));
  refusedAsOthers(G,'他人作物·采收：私自收割村里的庄稼',await act(c,'core:farm.private_harvest',{settlement:'loc_hw'},{commit:false}));
  // 他人林木：公用果园
  await at(c,'loc_hw_orchard');
  refusedAsOthers(G,'他人林木·砍伐：砍公用果园的树',await act(c,'core:site.woodcut',{target:'loc_hw_orchard'},{commit:false}));
  // 他人活物：别人家的山羊、牛、鸡、驯兽、畜群
  for(const [label,filter] of [['山羊',isGoat],['牛',isCow],['鸡',isChicken],['任何活物',()=>true]]){
    const x=Object.entries(c.doc.state.creatures??{}).find(([,v])=>v.owner&&v.owner!=='player'&&v.hp>0&&filter(M.get(v.species)??{}));
    if(!x){blocked(G,`他人活物·宰杀：宰别人家的${label}`,`世界里没有别人名下的活${label}`);blocked(G,`他人活物·卖：卖别人家的${label}`,`世界里没有别人名下的活${label}`);continue;}
    const d=fork(c,'o');await at(d,x[1].location);
    refusedAsOthers(G,`他人活物·宰杀：宰别人家的${label}`,await act(d,'core:combat',{target:x[0],intent:'attack'},{commit:false}));
    refusedAsOthers(G,`他人活物·卖：卖别人家的${label}`,await act(d,'core:trade.sell_to',{buyer:presentNpcs(d.doc).find(n=>n!==x[1].owner)??smith,item:x[0],quantity:1},{commit:false}));
  }
  const otherPets=Object.entries(c.doc.state.creatures??{}).filter(([id,v])=>v.owner&&v.owner!=='player'&&holdingsOf(c.doc,{subject:id,kind:'tamed_by'}).length);
  if(!otherPets.length)blocked(G,'他人驯兽·宰杀：宰别人驯养的兽','世界里没有别人驯养的兽');
  const otherHerds=herdsOf(c.doc,r=>r.owner!=='player');
  if(!otherHerds.length){blocked(G,'他人畜群·分群：从别人家的畜群里牵走一只','世界里没有别人家的畜群');blocked(G,'他人畜群·宰杀：宰别人家畜群里的一只','世界里没有别人家的畜群');blocked(G,'他人畜群·卖：卖掉别人家畜群里的一只','世界里没有别人家的畜群');}
  else{const h=otherHerds[0],d=fork(c,'herd');await at(d,h.location);
    const pa=Object.keys(d.doc.ledger?.accounts??{}).find(k=>k.startsWith(h.id+'|'))??Object.keys(d.doc.ledger?.accounts??{}).find(k=>k.includes(h.id))??`${h.id}|population|population`;
    refusedAsOthers(G,`他人畜群·分群：从${h.name}里牵走一只`,await propose(d,'从别人家的羊群里牵走一只',[{op:'transfer',from:pa,to:'sink:individuated|population|action',qty:1},{op:'create',kind:'creature',template:h.species}],{},{commit:false}));
    refusedAsOthers(G,`他人畜群·宰杀：宰${h.name}里的一只`,await act(d,'core:combat',{target:h.id,intent:'attack'},{commit:false}));
    refusedAsOthers(G,`他人畜群·卖：把${h.name}里的一只卖给旁人`,await act(d,'core:trade.sell_to',{buyer:presentNpcs(d.doc).find(n=>n!==h.owner)??h.owner,item:h.species,quantity:1},{commit:false}));}
}
// ========== F 驯兽：宰了自家驯兽，不给野外经验 ==========
{
  // 完整的真实学习驯服路径：备饲料→去白石镇向梁驯学驯兽师基础手艺（检定不过就再上课）→逐日练到 100→回南田追踪麦斑野雉（玩家等级要求 1）→逐日接近、喂食、驯服。
  const G='F 驯兽',c=newGame('acc-F'),flog=[];
  const {buyFood,learnTaming,tameOne}=await import('./tame.mjs');
  await buyFood(c,'item_ration',flog,12);const learned=await learnTaming(c,flog);
  const tamed=learned?await tameOne(c,'monster_oat_pheasant','item_ration','loc_hw_fields',flog):null;
  if(!learned)flog.push('缺：学习来源（K3/R9）');else if(!tamed)flog.push('学会且练到 100，但信任按日累积要 3 天以上，追踪到的野雉个体每次 2–3 天内死亡，驯服没完成（缺：取得路径）');
  const got={path:flog,via:tamed?'驯服':null,id:tamed};
  const pet=ownedPets(c.doc)[0]??tamed;
  if(!pet){blocked(G,'玩家用真实动作驯服一只自己的兽',{path:got.path});blocked(G,'宰了自家驯兽后它死去','前提未成立：没有驯兽');blocked(G,'宰自家驯兽不给野外经验（经验与经验账不因此增加）','前提未成立：没有驯兽');}
  else{
    check(G,'玩家用真实动作驯服一只自己的兽',true,{pet,path:got.path});
    const xp0=c.doc.state.player.xp,el0=JSON.stringify(c.doc.state.experienceLedger??{});
    const k=await slaughter(c,pet);
    check(G,'宰了自家驯兽后它死去',k.dead,{tries:k.tries});
    check(G,'宰自家驯兽不给野外经验（经验与经验账不因此增加）',k.dead&&c.doc.state.player.xp===xp0&&JSON.stringify(c.doc.state.experienceLedger??{})===el0,{xp:[xp0,c.doc.state.player.xp]});
  }
}
// ========== 对照（不计入 K7 判定）：猎野物再取材，证明取材与守恒的量具本身可用 ==========
const control=[];
{
  const c=newGame('acc-ctl');control.push(...await equipForGather(c,'monster_leaf_hare'));await act(c,'core:time.rest',{minutes:600});control.push('白天备好刀和水，歇到傍晚（多数林兽夜里活动）');
  for(const [habitatLoc,sp] of [['loc_hw_northwood','monster_leaf_hare'],['loc_hw_northwood','monster_red_ear_fox'],['loc_hw_water','monster_round_marsh_beaver'],['loc_hw_fields','monster_oat_pheasant']]){
    await at(c,habitatLoc==='loc_hw_water'?'loc_hw_dock':habitatLoc);const g=await trackOne(c,sp,6);if(!g){control.push(`${sp}：未遇到`);continue;}
    const k=await slaughter(c,g);if(!k.dead){control.push(`${sp}：没打死（${k.tries.join('；')}）`);continue;}
    const eq=await equipForGather(c,sp,c.doc.state.creatures[g]?.location);const before=c.doc,drops=M.get(sp).drops??[],inv0=Object.fromEntries(drops.map(d=>[d.item,c.doc.state.inventory?.[d.item]?.quantity??0]));
    const r=await act(c,'core:wildlife.gather',{target:g});const b=books(c,before);
    control.push(`${sp}：猎杀成功；取材 ${say(r)}；掉落 ${JSON.stringify(drops)}；得到 ${JSON.stringify(drops.map(d=>(c.doc.state.inventory?.[d.item]?.quantity??0)-inv0[d.item]))}；账本 ${b.ok?'守恒':JSON.stringify(b)}；装备 ${eq.join('；')}`);
    if(drops.length)break;
  }
}
// —— 汇总 ——
const counts=results.reduce((m,r)=>(m[r.result]=(m[r.result]??0)+1,m),{});
const out={generatedAt:new Date().toISOString(),repo:REPO,commit:execSync(`git -C ${REPO} rev-parse --short HEAD`).toString().trim(),assertions:results.length,counts,byGroup:Object.fromEntries([...new Set(results.map(r=>r.group))].map(g=>[g,results.filter(r=>r.group===g).reduce((m,r)=>(m[r.result]=(m[r.result]??0)+1,m),{})])),results,control};
await fs.writeFile(OUT,JSON.stringify(out,null,1));
for(const r of results)console.log(`${r.result.padEnd(7)} ${r.group}｜${r.phenomenon}`);
console.log('对照：',control.join('\n      '));
console.log(JSON.stringify({assertions:results.length,counts}));
process.exitCode=counts.pass===results.length?0:1;
