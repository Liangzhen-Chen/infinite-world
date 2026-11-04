// K6 合法性是后果·独立验收。凡是物理上可行、只缺社会许可的行为：先发生，再由规范栈命中罪名并产生后果。
// 只用真实动作（world_act / world_propose）与推进时间驱动；观察只读存档（state、ledger、holdings），不调规律层内部函数。
// 用法：TEMP=F:/dnd-tmp TMP=F:/dnd-tmp node F:/dnd-tmp/k6-legality-acc/acceptance.mjs [--days N]
//   ACC_REPO=<仓库> 指定被验仓库（默认基线 F:/dnd-wt/S5FIX）。--days N：犯事后等待官府/失主后续反应的天数（默认 1；本机 ≤3，30 天交 Linux）。
// 结果：pass（现象成立）/ fail（现象不成立）/ blocked（前提现象没法用真实动作造出来，写明卡在哪条缺失的规律上）。
import fs from 'node:fs/promises';
import {execSync} from 'node:child_process';
import {world,base,loadRepo,newGame,fork,act,propose,holdingsOf,presentNpcs,acct,qty,REPO} from './lib.mjs';
const OUT_DIR='F:/dnd-tmp/k6-legality-acc',DAYS=process.argv.includes('--days')?Math.max(0,Number(process.argv[process.argv.indexOf('--days')+1])||1):1;
const results=[];const T0=Date.now();
function check(group,id,phenomenon,outcome,evidence){results.push({group,id,phenomenon,result:outcome===true?'pass':outcome===false?'fail':outcome,evidence});return outcome===true;}
const blocked=(g,id,p,ev)=>check(g,id,p,'blocked',ev);
const say=r=>r?`${r.status}${r.reason?'：'+r.reason:''}${r.routed?` [${r.routed}]`:''}${r.applied?.length?' {'+r.applied.join(',')+'}':''}`:'无';
const at=async(c,dest)=>(c.doc.state.location===dest?null:act(c,'core:move',{destination:dest}));
const sleepDay=c=>act(c,'core:time.sleep',{until:{dayOffset:1,hour:8,minute:30}});
// —— 判据的三种语义 ——
// 社会许可闸门（K6 要拆掉的）：理由是"没有许可、授权、同意、所有者、通缉、赏金、案件"等。
const PERMIT=/许可|授权|同意|所有者|物主|擅自|使用权限|田主|住户|赏金|缉拿|通缉|案件未登记|已登记的案件|物权|合法持有|不属于你|他人账户|他人|别人|归.{0,6}所有|未登记官职/;
// 物理理由（K6 之后仍应拒绝的）：力量、重量、工具、能力、距离、存在性。
const PHYSICAL=/不足|没有那么多|余额|力量|太重|重量|搬不动|载重|负重|工具|斧|没有可采|尚未学会|法力|材料|不可移动|无法移动|固定|不能搬|体积|距离|太远|够不着|不在场|不存在|located/;
// —— 罪名与后果观察（只读存档） ——
// 罪名：存档里新出现或变化的、以玩家为行为人的 offense 记录（罪名词汇见 world/ontology/offenses.json）。
const OFFENSES=new Map(JSON.parse(await fs.readFile(`${REPO}/world/ontology/offenses.json`,'utf8')).entries.map(e=>[e.id,e.label]));
function offensesNew(before,after){
  const out=[];
  for(const [id,r] of Object.entries(after.state.records??{})){
    if(!r||!r.offense)continue;const who=r.offender??r.actor??r.suspect;if(who!=='player')continue;
    if(JSON.stringify(before.state.records?.[id])===JSON.stringify(r))continue;
    out.push({id,offense:r.offense,label:OFFENSES.get(r.offense)??'(词汇外)',category:r.category,victim:r.victim??r.target??null,status:r.status??null,sourceEvent:r.sourceEvent??null});
  }
  for(const [id,r] of Object.entries(after.state.records??{}))if(r?.category==='world_event'&&!before.state.records?.[id]&&r.actor==='player'&&(r.tags??[]).some(t=>String(t).startsWith('offense:')))out.push({id,offense:r.tags.find(t=>String(t).startsWith('offense:')).slice(8),category:'world_event',tag:true});
  return out;
}
// 后果：与这次行为（eventId）相连的社会反应——旁人或失主记住、关系变差、声望下降、立案或通缉、追索。
function reactionsTo(before,after,eventIds){
  const ids=new Set(eventIds.filter(Boolean)),hit=s=>[...ids].some(e=>String(s).includes(e)),ev=[];
  for(const [nid,n] of Object.entries(after.state.npcs)){
    const old=new Set((before.state.npcs[nid]?.memoryStream??[]).map(m=>m.id));
    for(const m of n.memoryStream??[])if(!old.has(m.id)&&hit(JSON.stringify(m)))ev.push(`${nid} 记住：${m.content??m.kind}`);
    const r0=before.state.npcs[nid]?.relationships?.player,r1=n.relationships?.player;
    if(r1&&JSON.stringify(r0)!==JSON.stringify(r1)&&hit(JSON.stringify(r1.evidenceKeys??[]))&&((r1.trust??0)<(r0?.trust??0)||(r1.affection??0)<(r0?.affection??0)))ev.push(`${nid} 对玩家信任/好感下降`);
  }
  for(const [id,r] of Object.entries(after.state.records??{})){
    if(r?.category==='standing'&&r.target==='player'){const h0=before.state.records?.[id]?.history?.length??0;for(const h of (r.history??[]).slice(h0))if(h.delta<0&&hit(h.sourceEvent))ev.push(`声望 ${r.holder} ${h.delta}`);}
    if(r?.offense&&r.offender==='player'&&r.status&&r.status!=='未报案'&&before.state.records?.[id]?.status!==r.status)ev.push(`案件 ${id} 状态 ${r.status}`);
    if(!before.state.records?.[id]&&/wanted|bounty|pursuit|claim|recover/.test(r?.category??'')&&JSON.stringify(r).includes('player'))ev.push(`${r.category} ${id}`);
  }
  for(const h of Object.values(after.holdings?.rows??{}))if(h.kind==='wanted'&&(h.holder==='player'||h.subject==='player')&&!before.holdings?.rows?.[h.id])ev.push(`通缉 ${h.id}`);
  return ev;
}
function books(c,before){const a=c.env.auditLedger(c.doc.ledger),k=c.env.conservation(c.engine,before,c.doc);return {ok:!a.length&&!k.length,audit:a.slice(0,3),conservation:k.slice(0,3)};}
// 同一处境下的真实尝试：检定失败可能只是这一掷没成，换事件号重试最多 n 次（每次从同一存档出发）。
async function attempt(c,fn,n=5){let last;for(let i=0;i<n;i++){const d=fork(c,`t${i}`);const r=await fn(d);last={d,r};if(r.status==='committed'&&r.result?.checkSuccess!==false&&r.result?.success!==false)return last;if(r.status==='rejected')return last;}return last;}
// 让后果有时间发生：歇一个时辰再看即时反应。
async function settle(d){await act(d,'core:time.rest',{minutes:60});}
// —— 真实取得前提：学法术、买材料 ——
const spellOf=id=>world.spells.find(s=>s.id===id);
async function buyFromAnyone(c,item,n=1,log=[]){
  const have=()=>c.doc.state.inventory?.[item]?.quantity??0;if(have()>=n)return true;
  const here=String(c.doc.state.location).split('_').slice(0,2).join('_');
  const sellers=Object.entries(c.doc.state.npcs).filter(([,x])=>(x.inventory?.[item]?.quantity??x.inventory?.[item]??0)>=1).sort(([,a],[,b])=>(String(b.location).startsWith(here)?1:0)-(String(a.location).startsWith(here)?1:0));
  for(const [id,x] of sellers.slice(0,4)){const mv=await at(c,x.location);if(mv?.status==='rejected'){log.push(`去 ${x.location} 找 ${id} 买 ${item}：${mv.reason}`);continue;}
    const b=await act(c,'core:trade.buy',{seller:id,item,quantity:n-have()});log.push(`向 ${id} 买 ${item}：${say(b)}`);if(have()>=n)return true;}
  if(!sellers.length)log.push(`世界里没有 NPC 库存有 ${item}`);return have()>=n;
}
async function learnSpell(c,spellId,log){
  const sp=spellOf(spellId);if(c.doc.state.spells?.[spellId])return true;
  if(!sp?.teachers?.length){log.push(`${spellId}：没有登记教师，也没有书或学堂来源`);return false;}
  for(const t of sp.teachers){
    for(let i=0;i<10&&!c.doc.state.spells?.[spellId];i++){
      const loc=c.doc.state.npcs[t]?.location;
      if(loc!==c.doc.state.location){const mv=await act(c,'core:move',{destination:loc});if(mv.status==='rejected'){log.push(`去找 ${t}（${loc}）：${mv.reason}；等到次日`);await sleepDay(c);continue;}}
      const r=await act(c,'core:learn',{entity:spellId,source:t,kind:'spell'});
      if(r.status==='rejected'){log.push(`core:learn ${spellId}←${t}：${r.reason}`);if(/不在场|此刻|不提供|时段|营业|服务时间|休息|离开/.test(r.reason??''))await sleepDay(c);else break;}
      else if(!c.doc.state.spells?.[spellId])log.push(`core:learn ${spellId}←${t}：本课未学会（检定）`);
    }
    if(c.doc.state.spells?.[spellId]){log.push(`学会 ${spellId}（${sp.name}）`);return true;}
  }
  return false;
}
async function prepareSpell(c,spellId,log){
  const sp=spellOf(spellId);if(!await learnSpell(c,spellId,log))return false;
  for(const m of sp.materials??[])if(!await buyFromAnyone(c,m.item,m.amount,log)){log.push(`缺施法材料 ${m.item}`);return false;}
  return true;
}
// —— 现象判定的共同形状 ——
// 一次"缺社会许可"的行为：发生了吗、物理后果落地了吗、罪名命中了吗、有后果吗。
function judge(r,before,after,{effect}){
  const happened=r.status==='committed';const eff=happened?effect(before,after):false;
  const off=happened?offensesNew(before,after):[];const rea=happened?reactionsTo(before,after,[r.eventId]):[];
  return {happened,eff,off,rea,gate:!happened&&PERMIT.test(r.reason??'')};
}
const ev=(r,j,extra={})=>({attempt:say(r),gate:j.gate||undefined,offenses:j.off,reactions:j.rea.slice(0,6),...extra});
// 一组四条断言：发生且物理后果落地 / 守恒 / 罪名 / 后果
function four(G,id,label,r,j,b,extra={},{needReaction=true}={}){
  const pre=j.happened?null:(j.gate?false:'blocked');
  check(G,id+'.发生',`${label}：行为确实发生，物理后果落地`,j.happened&&j.eff?true:pre??false,ev(r,j,extra));
  check(G,id+'.守恒',`${label}：账本审计为空、资源守恒`,j.happened?(b?.ok??false):pre??false,j.happened?b:'前提未成立：行为没有发生');
  check(G,id+'.罪名',`${label}：规范栈命中罪名`,j.happened?j.off.length>0:pre??false,{offenses:j.off});
  if(needReaction)check(G,id+'.后果',`${label}：失主、旁人或官府有反应`,j.happened?j.rea.length>0:pre??false,{reactions:j.rea});
}
const followUps=[];// 交给 --days 浸泡后核对后续反应
// ======================================================================
// 一、拿别人的东西
// ======================================================================
const hw=newGame('acc-hw');{const l=[];await at(hw,'bld_hw_forge');await buyFromAnyone(hw,'item_singlebit_axe',1,l);hw.log0=l;}
{
  const G='一 拿别人的东西';
  // 1. 林穗的面包（他人库存）
  {const c=fork(hw,'bread');await at(c,'bld_hw_qingdeng');const A=acct('npc_hw_linsui','item_bread'),P=acct('player','item_bread');const before=c.doc;
   const {d,r}=await attempt(c,x=>propose(x,'趁林穗不注意把她柜上的一个面包拿走',[{op:'transfer',from:A,to:P,qty:1}]));
   const j=judge(r,before,d.doc,{effect:(b,a)=>qty(a,P)===qty(b,P)+1&&qty(a,A)===qty(b,A)-1});
   await settle(d);j.rea=reactionsTo(before,d.doc,[r.eventId]);
   four(G,'1.1',`拿走林穗的面包`,r,j,j.happened?books(d,before):null);if(j.happened)followUps.push({label:'林穗的面包',d,eventId:r.eventId});}
  // 2. 铁匠的钱
  {const c=fork(hw,'coin');await at(c,'bld_hw_forge');const A=acct('npc_hw_duanyan','coin_river'),P=acct('player','coin_river');const before=c.doc;
   const {d,r}=await attempt(c,x=>propose(x,'从铁匠钱匣里摸走五个铜钱',[{op:'transfer',from:A,to:P,qty:5}]));
   const j=judge(r,before,d.doc,{effect:(b,a)=>a.state.player.coins===b.state.player.coins+5});
   await settle(d);j.rea=reactionsTo(before,d.doc,[r.eventId]);
   four(G,'1.2',`拿走铁匠的五个铜钱`,r,j,j.happened?books(d,before):null);if(j.happened)followUps.push({label:'铁匠的钱',d,eventId:r.eventId});}
  // 3. 宰别人的羊：谢堇家的山羊群在她家院里
  {const c=fork(hw,'goat');const herd=Object.values(c.doc.state.records).find(r=>r.category==='husbandry'&&/羊/.test(world.monsters.find(m=>m.id===r.species)?.name??''));
   const path=[];
   if(!herd)blocked(G,'1.3.发生','宰别人的羊','世界里没有别人家的羊');
   else{
     const mv=await at(c,herd.location);path.push(`走进 ${herd.location}：${say(mv)}`);
     const acc=Object.keys(c.doc.ledger?.accounts??{}).find(k=>k.startsWith(herd.id+'|'))??`${herd.id}|${herd.species}|population`;
     const before=c.doc,n0=herd.count;
     // 先登记动作：直接对羊群交锋；不行再按原语提案"牵出一只并宰掉"。
     const ids=[];let r=await act(c,'core:combat',{target:herd.id,intent:'attack'});ids.push(r.eventId);path.push(`core:combat 羊群：${say(r)}`);
     let killed=false;
     if(r.status==='rejected'){
       const cr0=new Set(Object.keys(c.doc.state.creatures??{}));
       const s=await propose(c,'从谢堇家羊群里牵出一只',[{op:'transfer',from:acc,to:'sink:individuated|population|action',qty:1},{op:'create',kind:'creature',template:herd.species}]);ids.push(s.eventId);path.push(`world_propose 牵出一只：${say(s)}`);
       const fresh=Object.keys(c.doc.state.creatures??{}).find(id=>!cr0.has(id));
       if(s.status==='committed'&&fresh){for(let i=0;i<20;i++){const k=await act(c,'core:combat',{target:fresh,intent:'attack'});ids.push(k.eventId);if(i===0)path.push(`core:combat 牵出的羊：${say(k)}`);const x=c.doc.state.creatures?.[fresh];if(k.status==='rejected'||!x||x.hp<=0)break;}
         killed=c.doc.state.creatures?.[fresh]?.hp<=0;r={...s,status:'committed'};}
       else r=s;
     }else killed=true;
     const j=judge(r,before,c.doc,{effect:()=>killed});if(!j.happened&&mv?.status==='rejected'&&PERMIT.test(mv.reason??''))j.gate=true;
     await settle(c);j.rea=reactionsTo(before,c.doc,ids);j.off=offensesNew(before,c.doc);
     four(G,'1.3',`宰谢堇家的一只山羊`,r,j,j.happened?books(c,before):null,{path});
   }}
  // 4. 砍/采别人的林木与柴炭：榆坡北岗烽台（任博的据点）
  {const c=fork(hw,'wood'),path=[];await at(c,'loc_bs');
   path.push(...[]);const okAxe=await buyFromAnyone(c,'item_singlebit_axe',1,path);
   const mv=await at(c,'site_w5_yupo_beacon');path.push(`去烽台：${say(mv)}`);
   const site=world.locations.find(l=>l.id==='site_w5_yupo_beacon').site,res=site.resources.find(x=>x.owner!==null)??site.resources[0];
   const before=c.doc;
   let r=await act(c,'core:site.woodcut',{quantity:1},{commit:false});path.push(`core:site.woodcut：${say(r)}`);
   let pick='woodcut';
   if(r.status==='rejected'&&!PERMIT.test(r.reason??'')){pick='gather';blocked(G,'1.4w','砍别人的树（他人所有的林木）',{attempt:say(r),why:`缺：世界里没有他人所有、可伐的林木（${r.reason}）；北林边、果园无主或无林木`});}
   const {d,r:rr}=await attempt(c,x=>pick==='woodcut'?act(x,'core:site.woodcut',{quantity:1}):act(x,'core:site.gather',{target:res.id,quantity:1}));r=rr;
   if(pick==='gather')path.push(`core:site.gather ${res.name}：${say(r)}`);
   const item=pick==='woodcut'?'item_wood':res.item;
   const j=judge(r,before,d.doc,{effect:(b,a)=>(a.state.inventory?.[item]?.quantity??0)>(b.state.inventory?.[item]?.quantity??0)});
   await settle(d);j.rea=reactionsTo(before,d.doc,[r.eventId]);
   four(G,'1.4',`砍/采任博烽台的${pick==='woodcut'?'林木':res.name}（${okAxe?'带斧':'没买到斧'}）`,r,j,j.happened?books(d,before):null,{path});
   if(j.happened)followUps.push({label:'任博的林木',d,eventId:r.eventId});}
  // 5. 采别人的田：河湾村公田的庄稼
  {const c=fork(hw,'field');await at(c,'loc_hw_fields');const before=c.doc,inv=s=>Object.fromEntries(Object.entries(s.inventory??{}).map(([k,v])=>[k,v?.quantity??v]));
   const path=[];let {d,r}=await attempt(c,x=>act(x,'core:farm.private_harvest',{settlement:'loc_hw'}));path.push(`core:farm.private_harvest：${say(r)}`);
   if(r.status==='rejected'){const t=await attempt(c,x=>act(x,'core:farm.harvest',{settlement:'loc_hw'}));path.push(`core:farm.harvest：${say(t.r)}`);if(t.r.status==='committed'||!PERMIT.test(r.reason??'')){d=t.d;r=t.r;}}
   const j=judge(r,before,d.doc,{effect:(b,a)=>{const i0=inv(b.state),i1=inv(a.state);return Object.keys(i1).some(k=>(i1[k]??0)>(i0[k]??0));}});
   await settle(d);j.rea=reactionsTo(before,d.doc,[r.eventId]);
   four(G,'1.5',`私自收割村里公田的庄稼`,r,j,j.happened?books(d,before):null,{path});}
}
// ======================================================================
// 二、进私宅
// ======================================================================
{
  const G='二 进私宅',c=fork(hw,'home');const home=world.locations.find(l=>l.access?.mode==='private'&&l.parent==='loc_hw');
  const before=c.doc;const {d,r}=await attempt(c,x=>act(x,'core:move',{destination:home.id}));
  const j=judge(r,before,d.doc,{effect:(b,a)=>a.state.location===home.id});
  await settle(d);j.rea=reactionsTo(before,d.doc,[r.eventId]);
  check(G,'2.发生',`未经住户许可走进${home.name}：确实进入`,j.happened&&j.eff?true:j.gate?false:'blocked',ev(r,j,{home:home.id,residents:home.access.residents}));
  check(G,'2.罪名',`进${home.name}：记录侵入（擅入私宅一类罪名）`,j.happened?j.off.length>0:j.gate?false:'blocked',{offenses:j.off});
  check(G,'2.后果',`进${home.name}：住户有反应`,j.happened?j.rea.some(x=>home.access.residents.some(n=>x.includes(n)))||j.rea.length>0:j.gate?false:'blocked',{reactions:j.rea});
  if(j.happened)followUps.push({label:'进私宅',d,eventId:r.eventId});
}
// ======================================================================
// 三、无证施法（精神法术，当地没有颁发许可）
// ======================================================================
const bs=fork(hw,'bs');await at(bs,'loc_bs');
{
  const G='三 无证施法',c=fork(bs,'mind'),log=[];
  let spell=null;for(const s of ['spell_s3_still_mind','spell_s3_calm_guard','spell_s3_startle_ease'])if(await prepareSpell(c,s,log)){spell=s;break;}
  if(!spell){for(const p of ['3.发生','3.罪名'])blocked(G,p,'无证施法',{log,why:'缺：学习来源（精神类法术学不到）'});}
  else{
    await at(c,'bld_hw_qingdeng');let target=null,d,r;const before0=c.doc;
    for(let w=0;w<4&&!r;w++){for(const n of ['player',...presentNpcs(c.doc)]){const t=await attempt(c,x=>act(x,'core:cast',{spell,target:n}));log.push(`core:cast → ${n}：${say(t.r)}`);if(t.r.status==='committed'||PERMIT.test(t.r.reason??'')||!r){({d,r}=t);target=n;}if(t.r.status==='committed'||PERMIT.test(t.r.reason??''))break;}
      if(r&&(r.status==='committed'||PERMIT.test(r.reason??'')))break;r=null;await act(c,'core:time.rest',{minutes:60});}
    if(!r){r={status:'rejected',reason:'在场没有可施法的人',applied:[]};d=c;}
    const before=r.before??before0,mp0=before.state.player.mp;
    const j=judge(r,before,d.doc,{effect:(b,a)=>a.state.player.mp<mp0||r.applied.length>0});const cg=j.gate||PERMIT.test(r.reason??'');j.gate=cg;
    check(G,'3.发生',`对${target==='player'?'自己':target}施放${spellOf(spell).name}（当地没有施法许可）：确实施放`,j.happened&&j.eff?true:j.gate?false:'blocked',ev(r,j,{spell,target,log}));
    check(G,'3.罪名',`无证施法：记录无证施法一类罪名`,j.happened?j.off.length>0:j.gate?false:'blocked',{offenses:j.off});
  }
}
// ======================================================================
// 四、无通缉拘人
// ======================================================================
{
  const G='四 无通缉拘人',c=fork(hw,'detain');await at(c,'bld_hw_qingdeng');const who='npc_hw_linsui',before=c.doc,path=[];
  let {d,r}=await attempt(c,x=>act(x,'core:law.arrest',{target:who}));path.push(`core:law.arrest：${say(r)}`);
  if(r.status==='rejected'){const t=await attempt(c,x=>propose(x,'把林穗扣在酒馆里不让她走',[{op:'holding.open',kind:'guest_of',holder:who,subject:'player',terms:{mode:'detained',reason:'私自扣留'}}]));path.push(`world_propose 留置：${say(t.r)}`);if(t.r.status==='committed'||!PERMIT.test(r.reason??'')){d=t.d;r=t.r;}}
  const detained=a=>holdingsOf(a,{kind:'guest_of',holder:who}).some(h=>/detain/.test(JSON.stringify(h)))||(a.state.player.companions??[]).includes(who)||/拘|押|留置|囚/.test(a.state.npcs[who]?.status??'');
  const j=judge(r,before,d.doc,{effect:(b,a)=>detained(a)&&!detained(b)});
  await settle(d);j.rea=reactionsTo(before,d.doc,[r.eventId]);
  check(G,'4.发生',`没有通缉也没接赏金，扣下林穗：确实拘住`,j.happened&&j.eff?true:(j.gate||PERMIT.test(r.reason??'')||/手段不能|不能产生/.test(r.reason??''))?false:'blocked',ev(r,j,{path}));
  check(G,'4.罪名',`扣下林穗：记录非法拘禁一类罪名`,j.happened?j.off.length>0:false,{offenses:j.off});
  check(G,'4.后果',`扣下林穗：她本人、旁人或官府有反应`,j.happened?j.rea.length>0:false,{reactions:j.rea});
  if(j.happened)followUps.push({label:'扣人',d,eventId:r.eventId});
}
// ======================================================================
// 五、覆盖面：审计 C-b、C-c、C-d 的拒绝点逐一用真实动作复现
//   基线应为"被拒（社会许可理由）"；交付后应为"发生 + 罪名"。学不到法术等取得问题记 blocked 并写明缺什么。
// ======================================================================
const COV=[
 // [编号, 审计点, 审计消息, 组, 场景基, 准备, 尝试]
 {id:'magic-air:37',grp:'C-b',msg:'空气对象需要有效所有者授权',spells:['spell_s2_smoke_vent','spell_s2_hush'],place:'bld_bs_school',targets:['feature_s2_pill_room']},
 {id:'magic-care:50',grp:'C-b',msg:'照护对象需要所有者有效授权',spells:['spell_s3_herb_cool'],place:'bld_bs_still_temple',targets:['feature_s3_herb_cabinet']},
 {id:'magic-light:37',grp:'C-b',msg:'光学对象需要有效所有者授权',spells:['spell_s3_mirror_turn','spell_s3_lamp_focus'],place:'bld_bs_temple',targets:['feature_s3_bronze_mirror','feature_s3_offering_table']},
 {id:'magic-light:226',grp:'C-b',msg:'光源需要所有者授权',spells:['spell_s3_lamp_dim','spell_light'],place:'bld_bs_temple',targets:['feature_s3_altar_lamp']},
 {id:'magic-marks:27',grp:'C-b',msg:'刻记目标需要所有者授权',spells:['spell_earth_03'],place:'bld_hw_forge',targets:['feature_hw_forge_hearth'],from:'hw'},
 {id:'magic-mind-space:52',grp:'C-b',msg:'对象需要有效所有者许可',spells:['spell_s4_door_lock','spell_s4_door_alarm'],place:'bld_bs_school',targets:['feature_s4_iron_latch']},
 {id:'magic-movement:48',grp:'C-b',msg:'传送锚点需要所有者给本人及同行者的有效许可',spells:['spell_s1_anchor_cross'],place:'loc_hw_dock',targets:['feature_s1_anchor_school'],from:'hw',slot:'destination'},
 {id:'magic-movement:101',grp:'C-b',msg:'短移落脚点需要所有者有效许可',spells:['spell_s1_solo_step'],place:'bld_hw_school',targets:['feature_s1_landing'],from:'hw',slot:'destination'},
 {id:'magic-object:183',grp:'C-b',msg:'物件需要有效所有者授权',spells:['spell_s2_slow_fire','spell_s3_cool_cloth'],place:'bld_bs_school',targets:['feature_s2_pill_furnace']},
 {id:'magic-water-earth:45',grp:'C-b',msg:'水土对象需要有效所有者授权',spells:['spell_s2_seam_seal','spell_s2_water_veil'],place:'bld_bs_still_temple',targets:['feature_s3_herb_cabinet']},
 {id:'summons:47',grp:'C-b',msg:'水体所有者未授权',spells:['spell_summon_04'],place:'bld_hw_qingdeng',targets:['feature_hw_kitchen_bucket'],from:'hw',slot:'source'},
 {id:'magic-growth:51',grp:'C-b',msg:'田块生长需要田主有效同意；公用访问不授权施法',spells:['spell_s1_field_growth'],place:'bld_hw_school',targets:['feature_s1_seedling'],from:'hw'},
 {id:'pets:44',grp:'C-b',msg:'动物已有其他所有者，不能擅自操作',other:'animal',action:'core:pet.contact'},
 {id:'wildlife-awakening:176',grp:'C-b',msg:'动物归其他所有者，不能擅自施为',other:'animal',action:'core:wildlife.nurture'},
 {id:'wildlife:308',grp:'C-b',msg:'动物归其他所有者，不能擅自取材',other:'corpse',action:'core:wildlife.gather'},
 {id:'sites:250',grp:'C-b',msg:'采伐需所有者的采集许可',site:'site_w5_yupo_beacon',action:'core:site.gather',slots:{target:'bc_charcoal',quantity:1}},
 {id:'sites:467',grp:'C-b',msg:'采伐需所有者的采集许可',site:'site_w5_yupo_beacon',action:'core:site.woodcut',slots:{quantity:1},needs:['item_singlebit_axe']},
 {id:'sites:327',grp:'C-b',msg:'据点物权要求所有者的有效许可',site:'site_w5_yupo_beacon',action:'core:site.enter',slots:{target:'site_w5_yupo_beacon'}},
 {id:'sites:265',grp:'C-b',msg:'这里不是登记可潜入的据点；私宅与其他据点仍须许可',site:'site_w5_yupo_beacon',action:'core:site.infiltrate',slots:{target:'site_w5_yupo_beacon'}},
 {id:'location-access:23',grp:'C-b',msg:'进入私宅需要成年住户给本人及同行者的有效许可',from:'hw',action:'core:move',slots:{destination:'bld_hw_home_21'},place:'loc_hw'},
 {id:'manufacturing:86',grp:'C-b',msg:'工作台需要有效使用许可',from:'hw',place:'bld_hw_forge',craft:true},
 {id:'npc-obligations:143',grp:'C-b',msg:'（审计未摘消息）',unmapped:'审计只给了行号、没有消息；从公开动作目录找不到能确定命中这一行的玩家动作'},
 {id:'npc-autonomy:153',grp:'C-b',msg:'人物没有热源的使用权限',unmapped:'NPC 自主推进使用热源的闸门，玩家动作没有直接入口'},
 {id:'magic-object:289',grp:'C-b',msg:'人物没有同地热源的使用权限',unmapped:'NPC 侧热源准备（prepareNpcFurnace），玩家动作没有直接入口'},
 {id:'law:705',grp:'C-c',msg:'没有生效的通缉就不能擅自拘人',from:'hw',place:'bld_hw_qingdeng',action:'core:law.arrest',slots:{target:'npc_hw_linsui'}},
 {id:'law:702',grp:'C-c',msg:'须先在告示处接下这份赏金（world_quest accept）',wanted:true},
 {id:'law:891',grp:'C-c',msg:'此案被告是他人；你只能接下赏金后缉拿交付',othersCase:true},
 {id:'quest-board:144',grp:'C-c',msg:'未登记官职的私人任务只能发布D级，身份额度不足',undecided:'审计判"待人判"：发布委托的等级额度可能是制度构成性限制',from:'hw',place:'loc_hw',action:'core:quest.publish',slots:{publisher:'player',grade:'C',personal:true,reward:10,content:'帮我找回走失的山羊',objective:{kind:'deliver',item:'item_ration',quantity:1},settlement:'loc_hw'}},
 {id:'magic-targeting:37',grp:'C-d',msg:'精神施法需要当地实际颁发且仍有效的许可',spells:['spell_s3_still_mind','spell_s3_calm_guard','spell_s3_startle_ease'],place:'bld_hw_qingdeng',targets:['player','npc']},
 {id:'magic-movement:37',grp:'C-d',msg:'锚点偏移，须先取得许可校准',spells:['spell_s4_true_anchor'],place:'bld_bs_reed_dao',targets:['feature_s4_anchor_stone']},
 {id:'law:774-782',grp:'C-d',msg:'施法许可只限当前法域…机构或当事人没有颁发此施法许可的权限',undecided:'这几行是"谁能颁发许可"的构成性规则（类 C-f），不是"无证就不能施法"；颁发本身需要对方的承认',from:'hw',place:'bld_hw_qingdeng',action:'core:law.grant_magic_permit',slots:{authority:'npc_hw_linsui',subject:'player',action:'mental_magic',minutes:600,location:'bld_hw_qingdeng'}},
];
const animalsOfOthers=doc=>Object.entries(doc.state.creatures??{}).filter(([,x])=>x.owner&&x.owner!=='player');
for(const row of COV){
  const G='五 覆盖面',P=`${row.id}（${row.grp}）「${row.msg}」`;
  if(row.unmapped){blocked(G,row.id,P,{why:row.unmapped});continue;}
  const c=fork(row.from==='hw'?hw:bs,row.id.replace(/\W/g,'_')),log=[];let r=null,target=null;
  try{
    if(row.spells){
      let spell=null;for(const s of row.spells)if(await prepareSpell(c,s,log)){spell=s;break;}
      if(!spell){blocked(G,row.id,P,{log,why:`缺：学习来源（${row.spells.join('、')} 都学不到：没有登记教师或教师不授课）`});continue;}
      const mv=await at(c,row.place);if(mv?.status==='rejected')log.push(`去 ${row.place}：${mv.reason}`);
      const tl=row.targets.flatMap(t=>t==='npc'?presentNpcs(c.doc):[t]);
      for(const t of tl){target=t;
        r=(await attempt(c,x=>act(x,'core:cast',{spell,[row.slot??'target']:target}))).r;log.push(`core:cast ${spell} → ${target}：${say(r)}`);if(r.status==='committed'||PERMIT.test(r.reason??''))break;}
      if(!r)r={status:'rejected',reason:'在场没有可施法的对象',applied:[]};
      row._spell=spell;
    }else if(row.other){
      const xs=animalsOfOthers(c.doc);const herd=Object.values(c.doc.state.records).find(h=>h.category==='husbandry'&&h.owner!=='player');
      if(!xs.length&&herd){await at(c,herd.location);r=await act(c,row.action,{target:herd.id},{commit:false});log.push(`${row.action} → 别人家的畜群 ${herd.id}：${say(r)}`);}
      if(!xs.length&&(!r||!PERMIT.test(r.reason??''))){blocked(G,row.id,P,{log,why:row.other==='corpse'?'缺：世界里没有别人名下的动物尸体（取得路径属 K7/K2）':'缺：世界里没有别人名下的个体动物，畜群也不能作为该动作对象（取得路径属 K2/K1）'});continue;}
      if(xs.length){const [id,x]=xs[0];await at(c,x.location);r=(await attempt(c,d=>act(d,row.action,{target:id}))).r;log.push(`${row.action} → ${id}：${say(r)}`);}
    }else if(row.site){
      for(const it of row.needs??[])await buyFromAnyone(c,it,1,log);
      const mv=await at(c,row.site);log.push(`去 ${row.site}：${say(mv)}`);r=(await attempt(c,d=>act(d,row.action,row.slots))).r;log.push(`${row.action}：${say(r)}`);
    }else if(row.craft){
      await at(c,row.place);const rec=world.recipes.find(x=>(x.station??x.workstation??'')&&/smith|anvil|锻/.test(JSON.stringify(x)))??world.recipes[0];
      r=(await attempt(c,d=>act(d,'core:craft.manufacture',{recipe:rec.id}))).r;log.push(`core:craft.manufacture ${rec.id}：${say(r)}`);
      if(r.status==='rejected'&&/尚未学会/.test(r.reason??'')){blocked(G,row.id,P,{log,why:'缺：配方取得路径（玩家开局不会任何配方，不能复现工作台使用许可这一行）'});continue;}
    }else if(row.wanted){
      const w=holdingsOf(c.doc,{kind:'wanted'})[0]??Object.values(c.doc.state.records).find(x=>/wanted/.test(x.category??''));
      if(!w){blocked(G,row.id,P,{why:'开局世界里没有生效的通缉；造一份通缉需要 NPC 犯案并被官府受理，属司法程序前提，本卡不造'});continue;}
      r=await act(c,'core:law.arrest',{case:w.case??w.id},{commit:false});log.push(`core:law.arrest：${say(r)}`);
    }else if(row.othersCase){
      const cs=Object.values(c.doc.state.records).find(x=>x.offense&&x.offender&&x.offender!=='player');
      if(!cs){blocked(G,row.id,P,{why:'开局世界里没有他人为被告的案件；同上，属司法程序前提'});continue;}
      r=await act(c,'core:law.arrest',{case:cs.id},{commit:false});log.push(`core:law.arrest：${say(r)}`);
    }else{
      if(row.place)await at(c,row.place);r=(await attempt(c,d=>act(d,row.action,row.slots))).r;log.push(`${row.action}：${say(r)}`);
    }
  }catch(e){r={status:'rejected',reason:'脚本异常：'+e.message};}
  const happened=r?.status==='committed',before=r?.before??c.doc,after=r?.after??c.doc,off=happened?offensesNew(before,after):[];
  const gate=!happened&&PERMIT.test(r?.reason??'');
  row._base=happened?(off.length?'发生+罪名':'发生无罪名'):gate?'被拒（社会许可）':'被拒（其他）';
  const out=row.undecided?'blocked':happened?off.length>0:gate?false:'blocked';
  check(G,row.id,P,out,{baseline:row._base,attempt:say(r),offenses:off,log,undecided:row.undecided,why:out==='blocked'&&!row.undecided?`前提未成立：被拒理由不是社会许可，也没发生（${r?.reason}）`:undefined});
}
// ======================================================================
// 五（续）、物理上不可行的仍然拒绝，理由必须是物理理由
// ======================================================================
{
  const G='五b 物理不可行仍拒绝';
  const phys=(id,p,r,re=PHYSICAL)=>check(G,id,p,r.status==='rejected'&&re.test(r.reason??'')&&!PERMIT.test(r.reason??''),{attempt:say(r)});
  // 世界里没有他人所有的林地（见 1.4w），这里用北林边（无主）检验"缺工具"这一物理理由本身。
  {const c=newGame('acc-noaxe');await at(c,'loc_hw_northwood');phys('P1','没带斧头去北林边砍树：拒绝，理由是没有工具',await act(c,'core:site.woodcut',{quantity:1},{commit:false}),/工具|斧|刀具|需要.{0,6}(斧|锯)/);}
  {const c=fork(hw,'lift');await at(c,'bld_hw_qingdeng');phys('P2','把林穗的整间酒馆揣进行囊：拒绝，理由是搬不动/不可移动（不是所有权）',await propose(c,'把这间酒馆整个扛走',[{op:'move',entity:'bld_hw_qingdeng',to:'player',mode:'carry'}],{},{commit:false}));}
  {const c=fork(hw,'nospell');await at(c,'bld_hw_qingdeng');phys('P3','没学过的精神法术施在林穗身上：拒绝，理由是尚未学会（不是没有许可）',await act(c,'core:cast',{spell:'spell_s3_still_mind',target:'npc_hw_linsui'},{commit:false}));}
  {const c=fork(hw,'toomany');await at(c,'bld_hw_qingdeng');phys('P5','从林穗柜上拿走 999 个面包（她只有几个）：拒绝，理由是数量不足（不是所有权）',await propose(c,'把林穗的面包全拿走',[{op:'transfer',from:acct('npc_hw_linsui','item_bread'),to:acct('player','item_bread'),qty:999}],{},{commit:false}));}
  {const c=fork(hw,'hearth');await at(c,'bld_hw_forge');phys('P4','把铁匠铺的炉膛搬回自己行囊：拒绝，理由是搬不动/固定（不是所有权）',await propose(c,'把铁匠的炉膛搬走',[{op:'move',entity:'feature_hw_forge_hearth',to:'player',mode:'carry'}],{},{commit:false}));}
}
// ======================================================================
// 六、罪名派生通用：副本里加一种从没出现过的他人财产，拿它同样构成盗窃
// ======================================================================
const MUT=`${OUT_DIR}/mut`,NEW_ITEM='item_k6mut_amber_hairpin';
{
  const G='六 罪名派生通用';
  try{
    execSync(`robocopy "${REPO}" "${MUT}" /MIR /XD node_modules .git SillyTavern docs assets logs dist /XF .git /NFL /NDL /NJH /NJS /NP`,{stdio:'ignore'});
  }catch(e){if((e.status??8)>=8)throw e;}
  try{await fs.access(`${MUT}/node_modules`);}catch{execSync(`cmd /c mklink /J "${MUT.replaceAll('/','\\')}\\node_modules" "${REPO.replaceAll('/','\\')}\\node_modules"`,{stdio:'ignore'});}
  const itemsPath=`${MUT}/world/meta/items.json`,items=JSON.parse(await fs.readFile(itemsPath,'utf8'));
  const tpl=items.find(i=>i.id==='item_horn_comb')??items[0];
  if(!items.some(i=>i.id===NEW_ITEM))items.push({...tpl,id:NEW_ITEM,name:'琥珀发簪',aliases:[],basePrice:60,weight:0.02,origin:null,description:'一支河湾少见的琥珀发簪，簪头嵌一粒蜜色琥珀，是林穗压箱底的嫁妆。',use:'挽发。'});
  await fs.writeFile(itemsPath,JSON.stringify(items,null,1));
  const peoplePath=`${MUT}/world/people/baseline.json`,people=JSON.parse(await fs.readFile(peoplePath,'utf8'));
  const arr=Array.isArray(people)?people:people.npcs??people.entries;const L=arr.find(n=>n.id==='npc_hw_linsui');L.inventory[NEW_ITEM]=1;
  await fs.writeFile(peoplePath,JSON.stringify(people,null,2));
  let env;try{env=await loadRepo(MUT);}finally{process.chdir(REPO);}
  const c=newGame('acc-mut',env);await at(c,'bld_hw_qingdeng');
  const A=acct('npc_hw_linsui',NEW_ITEM),P=acct('player',NEW_ITEM),before=c.doc;
  check(G,'6.0','变异副本里林穗名下真的有这支从没出现过的琥珀发簪',qty(before,A)===1||(before.state.npcs.npc_hw_linsui.inventory?.[NEW_ITEM]?.quantity??before.state.npcs.npc_hw_linsui.inventory?.[NEW_ITEM])===1,{account:qty(before,A)});
  const {d,r}=await attempt(c,x=>propose(x,'把林穗的琥珀发簪揣进自己怀里',[{op:'transfer',from:A,to:P,qty:1}]));
  const j=judge(r,before,d.doc,{effect:(b,a)=>qty(a,P)===qty(b,P)+1&&qty(a,A)===qty(b,A)-1});
  four(G,'6.1','拿走林穗的琥珀发簪（新物品）',r,j,j.happened?books(d,before):null,{},{needReaction:false});
  const theft=j.off.find(o=>o.offense==='theft');
  check(G,'6.2','新物品构成的罪名就是盗窃（theft），与拿面包同名，按物品价值计',!!theft,{offenses:j.off});
  // 对照：同一副本里，登记的偷窃动作也能偷新物品（证明副本本身可用，不计判定）
  const ctl=await attempt(c,x=>act(x,'core:crime.steal',{target:'npc_hw_linsui',item:NEW_ITEM}));
  results.push({group:G,id:'6.ctl',phenomenon:'对照（不计）：core:crime.steal 偷新物品',result:'control',evidence:{attempt:say(ctl.r),offenses:ctl.r.status==='committed'?offensesNew(c.doc,ctl.d.doc):[]}});
}
// ======================================================================
// 七、后续反应（--days N）：犯事后过 N 天，失主或官府有没有追索、报案、通缉
// ======================================================================
{
  const G=`七 ${DAYS} 天内后续`;
  if(!followUps.length)blocked(G,'7','犯事后 N 天内官府或失主有后续（报案、通缉、追索、声望）','前提未成立：一、二、四组的行为都没有发生');
  for(const f of followUps){const before=f.d.doc;for(let i=0;i<DAYS;i++)await sleepDay(f.d);
    const rea=reactionsTo(before,f.d.doc,[f.eventId]);
    const offs=Object.values(f.d.doc.state.records).filter(r=>r.offense&&r.offender==='player'&&r.sourceEvent===f.eventId).map(r=>`${r.offense}:${r.status}`);
    check(G,`7.${f.label}`,`${f.label}：${DAYS} 天内出现后续（案件推进、通缉、追索或声望变化）`,rea.length>0||offs.some(s=>!/未报案/.test(s)),{reactions:rea.slice(0,6),cases:offs});}
}
// ======================================================================
// 对照（不计）：登记的偷窃动作是现成模板——先发生、后定罪
// ======================================================================
{const c=fork(hw,'ctl');await at(c,'bld_hw_qingdeng');const before=c.doc;const {d,r}=await attempt(c,x=>act(x,'core:crime.steal',{target:'npc_hw_linsui',item:'item_ration'}));
 results.push({group:'对照',id:'ctl',phenomenon:'对照（不计）：core:crime.steal 偷林穗一份干粮——发生、罪名、反应',result:'control',evidence:{attempt:say(r),offenses:offensesNew(before,d.doc),reactions:reactionsTo(before,d.doc,[r.eventId]).slice(0,4),books:books(d,before)}});}
// —— 汇总 ——
const counted=results.filter(r=>r.result!=='control');
const counts=counted.reduce((m,r)=>(m[r.result]=(m[r.result]??0)+1,m),{});
const out={generatedAt:new Date().toISOString(),repo:REPO,commit:execSync(`git -C ${REPO} rev-parse --short HEAD`).toString().trim(),days:DAYS,seconds:Math.round((Date.now()-T0)/1000),assertions:counted.length,counts,
  byGroup:Object.fromEntries([...new Set(counted.map(r=>r.group))].map(g=>[g,counted.filter(r=>r.group===g).reduce((m,r)=>(m[r.result]=(m[r.result]??0)+1,m),{})])),
  coverageBaseline:COV.map(r=>({id:r.id,grp:r.grp,baseline:r._base??'blocked：前提未成立',spell:r._spell})),results};
try{const exp=JSON.parse(await fs.readFile(`${OUT_DIR}/expected.json`,'utf8'));const got=new Map(results.map(r=>[r.id,r.result]));
  out.vsExpected=exp.expectations.filter(e=>e.expected==='pass').map(e=>({id:e.id,got:got.get(e.id)??'缺失'})).filter(x=>x.got!=='pass');
  out.expectedPass=exp.expectations.filter(e=>e.expected==='pass').length;}catch{}
await fs.writeFile(`${OUT_DIR}/acceptance${process.env.ACC_TAG?'-'+process.env.ACC_TAG:''}.json`,JSON.stringify(out,null,1));
for(const r of results)console.log(`${r.result.padEnd(7)} ${r.group}｜${r.id}｜${r.phenomenon}`);
console.log(JSON.stringify({assertions:counted.length,counts,seconds:out.seconds,expectedPass:out.expectedPass,expectedNotYetPass:out.vsExpected?.length}));
process.exitCode=counts.pass===counted.length?0:1;
