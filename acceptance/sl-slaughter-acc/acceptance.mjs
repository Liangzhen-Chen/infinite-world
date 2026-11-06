// 卡 SL 宰杀自家牲畜、活畜取毛：独立验收。每条断言输出 pass / fail / blocked。
// 用法：ACC_REPO=<树> node acceptance.mjs [--days 3] [--trials 10] [--rebuild] [--no-mut]
import fs from 'node:fs';
import {BASE,MUT,arg,has,write,openRepo,fork,call,farm,wait,premise,untilSuccess,inv,books,mean,itemOf,kgOf,tagsOf} from './lib.mjs';
import {build,NEW} from './mutate.mjs';

const DAYS=Number(arg('--days',3)),TRIALS=Number(arg('--trials',10)),T0=Date.now();
const log=(...a)=>console.log(`[${((Date.now()-T0)/1000).toFixed(0)}s]`,...a);
const R=[],ALL=[];
const A=(id,title)=>{const a={id,title,cells:[]};R.push(a);return a;};
const P=(a,label,ok,note='')=>a.cells.push({label,st:ok?'pass':'fail',note:String(note).slice(0,300)});
const B=(a,label,note)=>a.cells.push({label,st:'blocked',note:String(note).slice(0,300)});
const verdict=a=>a.cells.some(c=>c.st==='fail')?'fail':(!a.cells.length||a.cells.some(c=>c.st==='blocked'))?'blocked':'pass';
const safe=async(a,label,fn)=>{try{await fn();}catch(e){B(a,label,`脚本异常：${String(e?.stack??e).split('\n').slice(0,2).join(' ')}`);}};

// ———— 开树 ————
let useMut=!has('--no-mut'),W;
if(useMut){try{await build({rebuild:has('--rebuild')});}catch(e){log('变异副本建立失败',e.message);useMut=false;}}
let mutErr=null;
if(useMut){try{W=await openRepo(MUT);}catch(e){mutErr=String(e?.stack??e).split('\n').slice(0,3).join(' ');useMut=false;}}
if(!W)W=await openRepo(BASE);
const T=W,world=T.world;
log('树',T.repo,'变异',useMut,mutErr??'');

// ———— 从数据推出要测什么（不按名单） ————
const takes=world.husbandryTakes?.takes??{};
const skillC=takes.carcass?.skill,skillS=takes.coat?.skill;
const mon=id=>world.monsters.find(m=>m.id===id);
const mass=id=>mon(id)?.husbandry?.bodyMassKg,coatOf=id=>mon(id)?.husbandry?.coat;
const SP=['monster_bent_horn_goat','monster_oat_pheasant',...(useMut?['sheepS','sheepL','hare','pig'].map(k=>NEW.species[k].id):[])];
const OX=NEW.species.ox.id;
const cutItems=world.items.filter(i=>(i.tags??[]).includes('cut')).map(i=>i.id);
const nonCutTools=world.items.filter(i=>(i.tags??[]).includes('tool')&&!(i.tags??[]).includes('cut')&&!(i.tags??[]).includes('weapon')).map(i=>i.id).slice(0,3);
const KNIFE='item_kitchen_knife',SHEARS='item_leather_shears',BLADE=NEW.blade;
const wmNames=(world.rules?.equipment?.workmanship??[]).map(w=>w.name);
const wmIdx=n=>wmNames.indexOf(n);
let noSkillCap=null,shortfallKeys=[];
try{const j=JSON.parse(fs.readFileSync(`${T.repo}/world/rules/tables/balance/crafting.json`,'utf8'));const rows=Array.isArray(j)?j:(j.params??j.rows??Object.values(j).find(Array.isArray)??[]);const sf=rows.find(r=>r.id==='workmanship.shortfall')?.value??{};noSkillCap=sf.noSkill??null;shortfallKeys=Object.keys(sf);}catch{}
const TIERS=[null,120,400,900];
const sd2=xs=>{const m=mean(xs);return xs.length>1?xs.reduce((a,b)=>a+(b-m)**2,0)/(xs.length-1):NaN;};
// 两组均值之差 hi-lo 的 z 值（样本方差估计；两组都零方差且差>0 记为无穷大，差=0 记 0；样本<2 返回 NaN）
const zdiff=(lo,hi)=>{if(lo.length<2||hi.length<2)return NaN;const d=mean(hi)-mean(lo),se=Math.sqrt(sd2(lo)/lo.length+sd2(hi)/hi.length);return se===0?(d>0?Infinity:d<0?-Infinity:0):d/se;};
const MIN_N=30; // 每档至少这么多样本，才有资格判"差异不显著=fail"；不足则 blocked 并写明要加 --trials
const HID='population_acc_sl';
const herdRow=(id,species,count,owner='player',location='loc_hw')=>({id,name:'验收畜群',owner,location,species,count,capacity:Math.max(20,count*3)});
const tierSkills=t=>t==null?{}:{[skillC]:t,[skillS]:t};
let seq=0;
function mk(o={}){
  const sp=o.species??'monster_bent_horn_goat',count=o.count??8;
  const tools=Object.fromEntries((o.tools??[KNIFE,SHEARS]).map(t=>[t,1]));
  const ctx=T.game({id:`a${++seq}`,herds:[herdRow(HID,sp,count,o.owner??'player'),...(o.herds??[])],
    setup:{minute:o.minute??1200,location:o.location??'loc_hw',inventory:{...tools,...(o.inventory??{})},abilities:{skills:tierSkills(o.tier===undefined?900:o.tier)}},mutateWorld:o.mutateWorld});
  ALL.push(ctx);return ctx;
}
const rec=(ctx,id=HID)=>ctx.doc.state.records[`husbandry:${id}`];
const parts=r=>[...(r.obtained??[]),...(r.leftBehind??[])];
const whole=r=>[...parts(r),...(r.lost??[])];
const keptShare=(ctx,r)=>{const t=kgOf(ctx.engine,parts(r)),w=kgOf(ctx.engine,whole(r));return w>0?t/w:NaN;};
const kind=(ctx,item)=>{const it=itemOf(ctx.engine,item),p=it?.animalProduct?.part,tg=it?.tags??[];return p??(tg.includes('meat')||/meat|mutton|pork|beef/.test(item)?'meat':tg.includes('bone')?'bone':tg.includes('feather')?'feather':tg.includes('hide')?'hide':'other');};
// 饲料是主人备的前提：推进 n 天前补足，之后清掉，避免背包被饲料占满
async function grow(ctx,days,tag='g'){
  const sp=rec(ctx).species,f=Math.ceil(rec(ctx).count*(mon(sp)?.husbandry?.feed?.perHead??0.25)*(days+1));
  premise(ctx,{inventory:{item_oats:f}});
  const r=await wait(ctx,days*1440,tag);premise(ctx,{inventory:{item_oats:0}});return r;
}
const coatItemOf=(ctx,id=HID)=>Object.keys(rec(ctx,id)?.produce??{}).find(k=>{const t=tagsOf(ctx.engine,k);return t.includes('hair')||t.includes('wool');});

// ———— 采样：每物种 × 每技能档，从同一快照分叉做 TRIALS 次宰杀一头 ————
log('采样宰杀…');
const SL={};
for(const sp of SP){
  SL[sp]={};
  for(const tier of TIERS){
    const base=mk({species:sp,tier,count:6}),n0=rec(base).count,xp0=base.doc.state.player.xp,lv0=base.doc.state.player.level;
    const o={kept:[],idx:[],standing:[],wholeKg:[],minutes:[],rej:[],n:0,bookBad:[],xpBad:0,prov:0,headsBad:0};
    for(let i=0;i<TRIALS;i++){
      const c=fork(base);
      const r=await farm(c,{operation:'husbandry_slaughter',target:HID},`sl${i}`);
      if(!r.ok){o.rej.push(r.reason);continue;}
      o.n++;const res=r.result;
      o.kept.push(keptShare(c,res));o.wholeKg.push(kgOf(c.engine,whole(res)));o.minutes.push(res.minutes);o.standing.push(res.standing);
      if(res.workmanship)o.idx.push(wmIdx(res.workmanship));
      if(rec(c).count!==n0-1)o.headsBad++;
      if((res.experience??0)!==0||c.doc.state.player.xp!==xp0||c.doc.state.player.level!==lv0)o.xpBad++;
      const b=books(c);if(!b.ok)o.bookBad.push(b.mismatches);
      const u=parts(res).find(p=>p.instances?.length)?.instances[0];
      if(u&&JSON.stringify(c.doc.state.itemInstances[u]??{}).includes(HID))o.prov++;
      if(i===0)o.sample={flows:Object.entries(c.doc.ledger.flows).filter(([k])=>/slaughter/.test(k))};
    }
    SL[sp][tier]=o;
  }
  log(' ',sp,'完成');
}
const sk=(sp,t=900)=>SL[sp][t];
const nm=sp=>sp.replace('monster_','');

// ———— S1 宰杀产出 ————
log("S1");
{
  const a=A('S1a','宰杀得到物种推出的胴体部分（肉必有；羽禽出羽毛、其余出骨），同一物种各档总量不变');
  for(const sp of SP){const o=sk(sp);
    if(!o.n){P(a,nm(sp),false,`熟练档全被拒：${o.rej[0]}`);continue;}
    const c=mk({species:sp,count:6});
    const r=(await untilSuccess(c,{operation:'husbandry_slaughter',target:HID},'k')).result??{};
    const kinds=new Set(whole(r).map(p=>kind(c,p.item)));
    const feather=coatOf(sp)==='feather';
    const ok=kinds.has('meat')&&(feather?kinds.has('feather')&&!kinds.has('hide'):kinds.has('bone'));
    const all=TIERS.flatMap(t=>SL[sp][t].wholeKg),spread=all.length?Math.max(...all)-Math.min(...all):NaN;
    P(a,nm(sp),ok&&spread<1e-6,`部分 ${[...kinds]}；总重跨档极差 ${spread.toFixed(3)}`);
  }
}
{
  const a=A('S1b','胴体总重由体重推出：随体重严格增加；同类毛被体重翻倍则近翻倍；占体重比例合理；多头成倍');
  const sorted=[...SP].sort((x,y)=>mass(x)-mass(y)),Wk=sp=>mean(SL[sp][900].wholeKg);
  if(SP.length<4)B(a,'覆盖','物种不足 4 个（变异副本未载入）：'+(mutErr??'--no-mut'));
  P(a,'随体重严格增加',sorted.every((sp,i)=>i===0||Wk(sp)>Wk(sorted[i-1])),sorted.map(sp=>`${nm(sp)}:${mass(sp)}kg→${Wk(sp).toFixed(2)}kg`).join(' '));
  for(const sp of SP)P(a,`${nm(sp)} 占体重比`,Wk(sp)/mass(sp)>0.15&&Wk(sp)/mass(sp)<0.95,(Wk(sp)/mass(sp)).toFixed(3));
  if(useMut){const r=Wk(NEW.species.sheepL.id)/Wk(NEW.species.sheepS.id),m=mass(NEW.species.sheepL.id)/mass(NEW.species.sheepS.id);P(a,'同类体重翻倍',r>m*0.8&&r<m*1.25,`体重比 ${m} 胴体比 ${r.toFixed(2)}`);}
  await safe(a,'多头',async()=>{
    const sp=SP.at(-1),c=mk({species:sp,count:6}),one=await farm(fork(c),{operation:'husbandry_slaughter',target:HID},'m1'),three=await farm(fork(c),{operation:'husbandry_slaughter',target:HID,quantity:3},'m3');
    if(one.ok&&three.ok){const w1=kgOf(c.engine,whole(one.result)),w3=kgOf(c.engine,whole(three.result));P(a,'三头约三倍',w3>w1*2.4&&w3<w1*3.6,`${w1.toFixed(2)} → ${w3.toFixed(2)}`);}else B(a,'三头约三倍',one.reason??three.reason);
  });
}
{
  const a=A('S1c','宰杀耗时：花时间且随胴体增大不减，时钟前进量不少于回执工时');
  for(const sp of SP){const o=sk(sp);if(!o.n){P(a,nm(sp),false,'无样本');continue;}P(a,nm(sp),o.minutes.every(m=>m>0),`工时 ${o.minutes[0]}`);}
  const sorted=[...SP].sort((x,y)=>mass(x)-mass(y)),M=sp=>mean(sk(sp).minutes);
  P(a,'最重的物种比最轻的耗时长',M(sorted.at(-1))>M(sorted[0]),sorted.map(sp=>`${nm(sp)}:${M(sp).toFixed(1)}`).join(' '));
  if(useMut)P(a,'同类体重翻倍不更快',M(NEW.species.sheepL.id)>=M(NEW.species.sheepS.id),`${M(NEW.species.sheepS.id)} → ${M(NEW.species.sheepL.id)}`);
  const c=mk({species:SP[0],count:6}),m0=c.doc.state.minute,r=await farm(c,{operation:'husbandry_slaughter',target:HID},'t');
  P(a,'时钟前进',r.ok&&c.doc.state.minute-m0>=r.result.minutes,r.ok?`${c.doc.state.minute-m0} ≥ ${r.result.minutes}`:r.reason);
}
{
  const a=A('S1d','宰杀记账：畜群少一头、死亡走宰杀流水、产出入库有来源、账本守恒、不给野外战斗经验');
  for(const sp of SP){const o=sk(sp);
    if(!o.n){P(a,nm(sp),false,'无样本');continue;}
    const fl=o.sample.flows,death=fl.filter(([k])=>/^sink:death\|/.test(k)).reduce((n,[,v])=>n+v,0),src=fl.filter(([k])=>/^src:husbandry\|/.test(k)).length;
    P(a,nm(sp),!o.headsBad&&!o.xpBad&&!o.bookBad.length&&death===1&&src>0&&o.prov>0,`头数偏差${o.headsBad} 经验偏差${o.xpBad} 守恒失败${o.bookBad.length} 死亡流水${death} 产出流水${src}种 溯源${o.prov}/${o.n}`);
  }
}
{
  const a=A('S1e','要刃具类工具（按用途 cut，不按物品 id）：无刃具被拒且不耗时；任一 cut 物品可用；非 cut 工具不行；新刃具照样可用');
  for(const sp of SP.slice(0,3)){await safe(a,nm(sp),async()=>{
    const c=mk({species:sp,tools:[],count:6}),b=JSON.stringify(c.doc.state),r=await farm(c,{operation:'husbandry_slaughter',target:HID},'nt');
    P(a,`${nm(sp)} 无工具被拒`,!r.ok&&JSON.stringify(c.doc.state)===b,r.reason??'竟然提交了');
    for(const t of nonCutTools.slice(0,2)){const c2=mk({species:sp,tools:[t],count:6}),r2=await farm(c2,{operation:'husbandry_slaughter',target:HID,tool:t},'nc');P(a,`${nm(sp)} 非cut ${t} 被拒`,!r2.ok,r2.reason??'竟然成功');}
  });}
  const pick=[...new Set([KNIFE,SHEARS,...cutItems.filter(i=>i!==KNIFE&&i!==SHEARS).slice(0,4),...(useMut?[BLADE]:[])])];
  for(const t of pick){await safe(a,t,async()=>{const c=mk({species:'monster_bent_horn_goat',tools:[t],count:6}),r=await farm(c,{operation:'husbandry_slaughter',target:HID},'ct');P(a,`cut 工具 ${t} 可用`,r.ok&&r.result.tool===t,r.reason??`用了 ${r.result?.tool}`);});}
  if(!useMut)B(a,'新刃具','未载入变异副本');
}

// ———— S2 产权 ————
log("S2");
{
  const a=A('S2','不是自己的牲口不能宰（按产权不按名单）：他人畜群被拒且无变化；换成自己名下可宰；换物种换主人都成立');
  const others=['npc_hw_xiejin','npc_hw_xierui','npc_hw_ayan'];
  for(const sp of SP){
    for(const own of others){await safe(a,`${nm(sp)}/${own}`,async()=>{
      const c=mk({species:sp,owner:own,count:6}),snap=JSON.stringify(c.doc.state),r=await farm(c,{operation:'husbandry_slaughter',target:HID},'th');
      P(a,`${nm(sp)} 属 ${own} 被拒`,!r.ok&&JSON.stringify(c.doc.state)===snap&&/他人|所有|财物|不是你|归/.test(r.reason),r.reason??'提交了');
    });}
    await safe(a,`${nm(sp)}/own`,async()=>{const c=mk({species:sp,owner:'player',count:40}),r=await untilSuccess(c,{operation:'husbandry_slaughter',target:HID},'own');P(a,`${nm(sp)} 属玩家可宰（对照）`,r.ok&&r.result.success,r.reason);});
  }
  for(const h of ['population_hw_home21_goats','population_hw_home21_pheasants']){await safe(a,h,async()=>{
    const c=T.game({id:'th',setup:{location:'bld_hw_home_21',inventory:{[KNIFE]:1}}});ALL.push(c);const snap=JSON.stringify(c.doc.state.records),r=await farm(c,{operation:'husbandry_slaughter',target:h},'xj');
    P(a,`真实世界 ${h} 被拒`,!r.ok&&/谢堇|他人|财物|所有/.test(r.reason)&&JSON.stringify(c.doc.state.records)===snap,r.reason??'提交了');});}
  await safe(a,'个体',async()=>{
    const c=T.game({id:'ind',setup:{inventory:{[KNIFE]:1}}});ALL.push(c);
    const id='creature_acc_sl_goat';
    premise(c,{instances:[{id,kind:'creature',template:'agent',species:'monster_bent_horn_goat',name:'验收羊',location:'loc_hw'}]});
    if(!c.doc.state.creatures?.[id]){B(a,'个体','前提造不出个体');return;}
    premise(c,{facts:[{path:['state','creatures',id,'owner'],value:'npc_hw_xiejin'}]});
    const r=await farm(c,{operation:'husbandry_slaughter',target:id},'ind');P(a,'他人名下个体被拒',!r.ok&&c.doc.state.creatures[id].hp>0,r.reason??'提交了');
  });
}

// ———— S3 取毛 ————
log("S3");
const COATED=SP.filter(sp=>mon(sp)?.husbandry?.yields?.alive?.some(r=>r.from==='coat'));
const BARE=SP.filter(sp=>!COATED.includes(sp));
const grown={};
for(const sp of COATED){const c=mk({species:sp,count:100});await grow(c,30);grown[sp]=c;}
log('毛已长出',COATED.map(nm).join());
{
  const a=A('S3a','活畜取毛：有毛被的物种过些天长出毛，用刃具剪下，得到毛类物品，头数不变，账本守恒，无战斗经验，有来源');
  for(const sp of COATED)await safe(a,nm(sp),async()=>{
    const c=fork(grown[sp]),item=coatItemOf(c),avail=Math.floor(rec(c).produce?.[item]??0),n0=rec(c).count;
    if(!item||avail<1){P(a,nm(sp),false,`30 天后没有长出毛（可取 ${avail}）`);return;}
    const q=Math.min(avail,5),xp=c.doc.state.player.xp;
    const r=await untilSuccess(c,{operation:'husbandry_collect',target:HID,item,quantity:q},'sh',Math.max(1,Math.floor(avail/q)));
    if(!r.ok){P(a,nm(sp),false,r.reason);return;}
    const got=r.result.obtained?.reduce((n,x)=>n+x.quantity,0)??0,t=tagsOf(c.engine,r.result.obtained?.[0]?.item);
    const u=r.result.obtained?.[0]?.instances?.[0],prov=JSON.stringify(c.doc.state.itemInstances[u]??{}).includes(HID);
    P(a,nm(sp),got>0&&rec(c).count===n0&&c.doc.state.player.xp===xp&&books(c).ok&&(t.includes('hair')||t.includes('wool')||t.includes('fiber'))&&prov,
      `可取${avail} 取${q} 得${got} 头数${n0}→${rec(c).count} 守恒${books(c).ok} 溯源${prov}`);
  });
}
{
  const a=A('S3b','没毛被的物种取不到毛；活畜取毛要刃具类工具');
  for(const sp of BARE)await safe(a,nm(sp),async()=>{
    const c=mk({species:sp,count:60});await grow(c,20);
    const rs=[];for(const it of ['item_raw_goat_hair','item_raw_animal_hair','item_wool'])rs.push(await farm(fork(c),{operation:'husbandry_collect',target:HID,item:it},'bh'));
    const none=Object.keys(rec(c).produce??{}).every(k=>!(tagsOf(c.engine,k).includes('hair')||tagsOf(c.engine,k).includes('wool')));
    P(a,`${nm(sp)} 无毛`,none&&rs.every(r=>!r.ok||!(r.result.obtained?.length)),rs.map(r=>r.reason??'提交').join('｜').slice(0,200));
  });
  for(const sp of COATED.slice(0,3))await safe(a,nm(sp),async()=>{
    const c=fork(grown[sp]);premise(c,{inventory:{[KNIFE]:0,[SHEARS]:0}});const item=coatItemOf(c);
    const r=await farm(c,{operation:'husbandry_collect',target:HID,item,quantity:1},'nt');P(a,`${nm(sp)} 无刃具取毛被拒`,!r.ok,r.reason??'提交了');
    const c2=fork(grown[sp]);premise(c2,{inventory:{[KNIFE]:0,[SHEARS]:0,[useMut?BLADE:KNIFE]:1}});
    const r2=await untilSuccess(c2,{operation:'husbandry_collect',target:HID,item,quantity:1},'bl');P(a,`${nm(sp)} 新/任一刃具可用`,r2.ok,r2.reason);
  });
  if(!BARE.length)B(a,'无毛物种','未载入变异副本，仅有雉鸡一例');
}
{
  log('S3c');
  const a=A('S3c','毛量按体重与间隔恢复：剪光后没有；间隔越长毛越多；同类毛被体重翻倍毛量近翻倍；四季都长；年总量与起始季节无关');
  await safe(a,'间隔',async()=>{
    const sp=COATED[0],c=mk({species:sp,count:100}),amt=[];let t=0;
    for(const d of [10,20,40]){await grow(c,d-t,'iv');t=d;amt.push(rec(c).produce?.[coatItemOf(c)]??0);}
    P(a,`${nm(sp)} 间隔 10/20/40 天毛量递增`,amt[0]<amt[1]&&amt[1]<amt[2]&&amt[2]/amt[0]>2&&amt[2]/amt[0]<8,amt.map(x=>x.toFixed(1)).join(' / '));
  });
  await safe(a,'剪后',async()=>{
    const sp=COATED[0],c=fork(grown[sp]),item=coatItemOf(c),avail=Math.floor(rec(c).produce?.[item]??0);
    await untilSuccess(c,{operation:'husbandry_collect',target:HID,item,quantity:avail},'all');
    const left=rec(c).produce?.[item]??0;P(a,'剪光后剩余近零',left<2,`剪前 ${avail} 剩 ${left}`);
    const again=await farm(c,{operation:'husbandry_collect',target:HID,item,quantity:1},'again');P(a,'立刻再剪取不到',!again.ok||!(again.result.obtained?.length),again.reason??'提交了但无产出');
  });
  if(useMut)await safe(a,'体重比',async()=>{
    const m=k=>{const c=grown[NEW.species[k].id];return rec(c).produce[coatItemOf(c)]??0;};
    const r=m('sheepL')/m('sheepS');P(a,'羊(wool)体重 24:12 的毛量比',r>1.6&&r<2.5,r.toFixed(2));
    const pm=(c,sp)=>(rec(c).produce[coatItemOf(c)]??0)/mass(sp);
    const q=pm(grown.monster_bent_horn_goat,'monster_bent_horn_goat')/pm(grown[NEW.species.hare.id],NEW.species.hare.id);P(a,'山羊与兔(hair)单位体重毛量相当',q>0.6&&q<1.7,q.toFixed(2));
  });
  await safe(a,'四季',async()=>{
    if(!has('--year')){B(a,'四季','需 --year 长跑：逐季推进 360 天测四个季度的毛增量（直接跳日期会破坏畜群结算前提，不能用跳日期代替）');return;}
    const sp=COATED.at(-1),c=mk({species:sp,count:100}),q=[];let last=0;
    for(let i=0;i<4;i++){await grow(c,90,'yq');const now=rec(c).produce?.[coatItemOf(c)]??0;q.push(now-last);last=now;}
    P(a,'四个季度毛增量都大于零且差异有限',q.every(x=>x>0)&&Math.max(...q)/Math.min(...q)<4,q.map(x=>x.toFixed(1)).join(' / '));
  });
}

// ———— S4 手艺档 ————
log("S4");
{
  const a=A('S4a','外行损耗更多：外行比熟练取回份额少，差按样本方差判 2.5σ；各档不出现显著倒挂；宰杀与取毛都成立（样本不足记 blocked，不拿固定阈值判）');
  const lo=SP.flatMap(sp=>SL[sp][null].kept),hi=SP.flatMap(sp=>SL[sp][900].kept);
  for(const sp of SP){
    const ks=TIERS.map(t=>SL[sp][t].kept);
    const inv_=ks.map((k,i)=>i===0?0:zdiff(k,ks[i-1])).map(z=>-z); // 低档比高档高出的 z
    P(a,`${nm(sp)} 各档份额无显著倒挂`,inv_.every(z=>!(z>2.5)),ks.map(k=>mean(k).toFixed(2)).join(' → ')+`（每档 ${ks[0].length} 样本）`);
  }
  {const z=zdiff(lo,hi),n=Math.min(lo.length,hi.length);
   if(z>=2.5)P(a,'汇总外行比熟练少取回（2.5σ）',true,`差 ${(mean(hi)-mean(lo)).toFixed(3)}，z=${z.toFixed(1)}，每档 ${n} 样本`);
   else if(n<MIN_N)B(a,'汇总外行比熟练少取回','跑不了：每档只有 '+n+' 个样本，不足 '+MIN_N+'，z='+z.toFixed(1)+'；请加大 --trials');
   else P(a,'汇总外行比熟练少取回（2.5σ）',false,`差 ${(mean(hi)-mean(lo)).toFixed(3)}，z=${z.toFixed(1)}，每档 ${n} 样本`);}
  for(const sp of COATED.slice(0,3))await safe(a,`剪毛 ${nm(sp)}`,async()=>{
    const res={};for(const t of [null,900]){const ks=[];for(let i=0;i<TRIALS*3;i++){const c=fork(grown[sp]);if(t==null)c.doc.state.skills={};else premise(c,{abilities:{skills:tierSkills(t)}});const item=coatItemOf(c),q=Math.min(30,Math.floor(rec(c).produce?.[item]??0));const r=await farm(c,{operation:'husbandry_collect',target:HID,item,quantity:q},`ss${i}`);if(r.ok){const g=parts(r.result).reduce((n,x)=>n+x.quantity,0),l=(r.result.lost??[]).reduce((n,x)=>n+x.quantity,0);if(g+l>0)ks.push(g/(g+l));}}res[t]=ks;}
    const z=zdiff(res.null,res[900]),n=Math.min(res.null.length,res[900].length);
    if(z>=2.5)P(a,`剪毛 ${nm(sp)} 外行份额低于熟练`,true,`外行 ${mean(res.null).toFixed(2)} 熟练 ${mean(res[900]).toFixed(2)} z=${z.toFixed(1)}`);
    else if(n<MIN_N)B(a,`剪毛 ${nm(sp)}`,`跑不了：每档 ${n} 样本不足 ${MIN_N}（z=${z.toFixed(1)}）；请加大 --trials`);
    else P(a,`剪毛 ${nm(sp)} 外行份额低于熟练`,false,`外行 ${mean(res.null).toFixed(2)} 熟练 ${mean(res[900]).toFixed(2)} z=${z.toFixed(1)} n=${n}`);
  });
}
{
  const a=A('S4b','手艺档沿用制造的同一套：外行品级不超过外行封顶、熟手能超过；平均品级随熟练度上升；standing 词汇与制造一致');
  P(a,'数据有封顶档',!!noSkillCap&&wmIdx(noSkillCap)>=0,String(noSkillCap));
  const cap=wmIdx(noSkillCap);
  const allN=SP.flatMap(sp=>SL[sp][null].idx),allE=SP.flatMap(sp=>SL[sp][900].idx);
  P(a,'外行品级不超过封顶',allN.length>0&&allN.every(i=>i<=cap),`外行最高 ${wmNames[Math.max(...allN)]} 封顶 ${noSkillCap}`);
  P(a,'熟手能超过外行封顶',allE.some(i=>i>cap),`熟手最高 ${wmNames[Math.max(...allE)]}`);
  const mi=TIERS.map(t=>mean(SP.flatMap(sp=>SL[sp][t].idx)));P(a,'平均品级随熟练度不减且外行<熟练',mi.every((x,i)=>i===0||x>=mi[i-1]-0.1)&&mi[0]<mi[3],mi.map(x=>x.toFixed(2)).join(' → '));
  const sN=new Set(SP.flatMap(sp=>SL[sp][null].standing)),sE=new Set(SP.flatMap(sp=>SL[sp][900].standing));
  await safe(a,'制造对照',async()=>{
    const rc=world.recipes.find(r=>r.id==='recipe_kc_tool_ink_brush')??world.recipes.find(r=>r.materials.some(m=>m.item==='item_raw_animal_hair'));
    if(!rc){B(a,'制造对照','找不到配方');return;}
    const c=T.game({id:'mf',setup:{location:'bld_hw_mill',inventory:{...Object.fromEntries(rc.materials.map(m=>[m.item,m.amount*3])),...Object.fromEntries((rc.tools??[]).map(t=>[t,1]))},abilities:{recipes:[rc.id]}}});ALL.push(c);
    const r=await call(c,'world_craft',{recipe:rc.id},'mf');
    // 回执在熟练时不写 standing：缺省就是 skilled；期望值从技能值和 minimumProficiency 推
    const st=r.ok?(r.result.standing??r.result.receipt?.standing??'skilled'):null;
    const expect=(prof,min)=>prof==null?'noSkill':prof<min?'underProficient':'skilled';
    const crSkill=c.doc.state.skills?.[rc.skill]?.proficiency;
    if(!r.ok)B(a,'制造对照',`外行制造被拒：${r.reason}`);
    else P(a,'制造回执 standing（缺省=skilled）与按技能值推出的一致',st===expect(crSkill,rc.minimumProficiency??0),`回执 ${st}，技能值 ${crSkill}，门槛 ${rc.minimumProficiency??0}`);
    P(a,'宰杀外行 standing 属于同一套词汇且等于按技能值推出的 noSkill',[...sN].every(x=>x===expect(undefined,takes.carcass?.minimumProficiency??0)&&(!shortfallKeys.length||shortfallKeys.includes(x))),`宰杀外行 ${[...sN]}；词汇 ${shortfallKeys}`);
  });
  P(a,'熟手 standing 缺省或为 skilled',[...sE].every(x=>(x??'skilled')==='skilled'),[...sE].join());
}

// ———— S5 背不动 ————
log("S5");
{
  const a=A('S5','背不动时胴体留在原地、归主人、可回取（不是被拒、不是消失）');
  for(const [label,sp,oats] of [['满包山羊','monster_bent_horn_goat',80],['公牛(空包)',OX,0]]){
    if(sp===OX&&!useMut){B(a,label,'未载入变异副本');continue;}
    await safe(a,label,async()=>{
      const c=mk({species:sp,count:12,inventory:oats?{item_oats:oats}:{}}),n0=rec(c).count;
      const r=await untilSuccess(c,{operation:'husbandry_slaughter',target:HID},'bc');
      if(!r.ok){P(a,`${label} 不被拒`,false,r.reason);return;}
      const left=r.result.leftBehind??[];
      P(a,`${label} 宰杀成立、畜群少一头`,rec(c).count<n0,`${n0}→${rec(c).count}`);
      P(a,`${label} 有留在原地的部分且可见`,left.length>0&&kgOf(c.engine,left)>0,JSON.stringify(left));
      P(a,`${label} 守恒（产出=入包+留地+损耗）`,books(c).ok,JSON.stringify(books(c).mismatches));
      // 留地部分在存档哪里：在 inventory/itemInstances/ledger 之外找带该物品和数量的对象，并取最近的带 owner 的祖先
      const hits=[];
      const walk=(o,path,owner)=>{if(hits.length>5||o===null||typeof o!=='object')return;const ow=typeof o.owner==='string'?o.owner:owner;
        for(const [k,v] of Object.entries(o)){const p2=[...path,k];
          if(path.length===1&&['inventory','itemInstances','ledger','player','npcs','creatures'].includes(k))continue;
          if(left.some(l=>k===l.item&&typeof v==='number'&&v>=l.quantity-1e-9||k===l.item&&v&&typeof v==='object'&&(v.quantity>=l.quantity)))hits.push({path:p2.join('.'),owner:ow});
          else if(v&&typeof v==='object'&&v.item&&left.some(l=>l.item===v.item&&(v.quantity??v.amount)>=l.quantity))hits.push({path:p2.join('.'),owner:ow});
          else walk(v,p2,ow);}};
      walk(c.doc.state,['state'],null);
      P(a,`${label} 留地的物品存在于存档某处且归主人`,hits.length>0&&hits.every(h=>h.owner==='player'),hits.length?hits.slice(0,2).map(h=>`${h.path}（主人 ${h.owner}）`).join('；'):'存档里找不到这些物品（消失了）');
      // 回取：腾空背包（只留工具），再试公开入口
      premise(c,{inventory:Object.fromEntries(Object.keys(c.doc.state.inventory).filter(k=>![KNIFE,SHEARS].includes(k)).map(k=>[k,0]))});
      const before=Object.fromEntries(left.map(l=>[l.item,inv(c.doc,l.item)])),tries=[];
      for(const l of left){
        for(const q of [l.quantity,Math.max(1,Math.floor(l.quantity/4)),1]){
          const rr=await farm(c,{operation:'husbandry_collect',target:HID,item:l.item,quantity:q},'pick');tries.push(rr.ok?'提交':rr.reason);if(rr.ok&&inv(c.doc,l.item)>before[l.item])break;}
      }
      if(left.some(l=>inv(c.doc,l.item)>before[l.item]))P(a,`${label} 可回取`,books(c).ok,`回取后守恒 ${books(c).ok}`);
      else B(a,`${label} 可回取`,`试过 husbandry_collect（整量/四分之一/一件），都没回到包里：${[...new Set(tries)].slice(0,2).join('｜').slice(0,200)}；找不到别的公开入口`);
    });
  }
}

// ———— S6 NPC ————
log("S6");
{
  const a=A('S6','NPC 宰杀与玩家同一规律（工具、手艺档、损耗、记账）');
  await safe(a,'NPC',async()=>{
    const span=Math.max(DAYS,3)*2;
    const run=async(label,mut)=>{const c=T.game({id:'npc'+label,mutateWorld:w=>mut(w.npcs.find(p=>p.id==='npc_hw_xiejin'))});ALL.push(c);
      const b=structuredClone(c.doc.ledger.flows);for(let d=0;d<span;d++)await wait(c,1440,'d');
      const fl=Object.entries(c.doc.ledger.flows).filter(([k,v])=>v!==b[k]&&/slaughter/.test(k));
      const units=Object.values(c.doc.state.itemInstances).filter(u=>JSON.stringify(u.recipe??{}).includes('husbandry_slaughter'));
      return {c,fl,units};};
    const arm=prof=>n=>{n.inventory={[KNIFE]:1};n.skills=[...(n.skills??[]),skillC];n.proficiencies={...n.proficiencies,[skillC]:prof};};
    const none=await run('a',()=>{}),armed=await run('b',arm(900)),novice=await run('c',n=>{n.inventory={[KNIFE]:1};});
    if(!armed.fl.length){B(a,'NPC 有刀有手艺时宰杀',`${span} 天里谢堇家畜群没有任何宰杀流水（NPC 不会宰杀自家牲口：缺这条规律）`);B(a,'NPC 手艺档与损耗','同上，没有可比样本');return;}
    P(a,'无刀的 NPC 不宰',none.fl.length===0,JSON.stringify(none.fl));
    P(a,'NPC 宰杀有来源有主人',armed.units.length>0&&armed.units.every(u=>u.owner==='npc_hw_xiejin'),`实例 ${armed.units.length}`);
    P(a,'NPC 宰杀守恒',books(armed.c).ok,JSON.stringify(books(armed.c).mismatches));
    const wq=u=>wmIdx(u.workmanship);
    P(a,'外行 NPC 品级低于熟手 NPC',novice.units.length>0&&mean(novice.units.map(wq))<mean(armed.units.map(wq)),`外行 ${mean(novice.units.map(wq)).toFixed(2)} 熟手 ${mean(armed.units.map(wq)).toFixed(2)}`);
  });
}

// ———— S7 毛刷追溯 ————
log("S7");
{
  const a=A('S7','一件毛刷（细筛、墨笔）的毛能追到某户某群羊：剪下的毛做成成品，来源链指向具体畜群与主人；换配方、换畜群都成立');
  const recipes=world.recipes.filter(r=>r.materials.some(m=>m.item==='item_raw_animal_hair')).slice(0,2);
  const herds=[['monster_bent_horn_goat','a'],...(useMut?[[NEW.species.hare.id,'b']]:[])];
  for(const [sp,tag] of herds)for(const rc of recipes){await safe(a,`${nm(sp)}/${rc.id}`,async()=>{
    const hid=HID,mats=Object.fromEntries(rc.materials.filter(m=>m.item!=='item_raw_animal_hair').map(m=>[m.item,m.amount*3])),tools=Object.fromEntries((rc.tools??[]).map(t=>[t,1]));
    const c=fork(grown[sp]);ALL.push(c);premise(c,{inventory:{[SHEARS]:1,...tools},abilities:{skills:{[skillS]:900,[rc.skill]:900},recipes:[rc.id]}});
    const item=coatItemOf(c,hid),avail=Math.floor(rec(c,hid).produce?.[item]??0);
    const s=await untilSuccess(c,{operation:'husbandry_collect',target:hid,item,quantity:Math.max(1,Math.min(avail,3))},'sh');
    if(avail<1){B(a,`${nm(sp)}/${rc.id}`,'毛量不足 1');return;}
    if(!s.ok){P(a,`${nm(sp)}/${rc.id}`,false,`剪毛：${s.reason}`);return;}
    premise(c,{location:'bld_hw_mill',inventory:mats});
    const b0=new Set(Object.keys(c.doc.state.itemInstances));let made=null,why='';
    for(let i=0;i<20&&!made;i++){const r=await call(c,'world_craft',{recipe:rc.id},`cr${i}`);if(!r.ok){why=r.reason;break;}
      made=Object.entries(c.doc.state.itemInstances).find(([id,u])=>!b0.has(id)&&u.item===(rc.product??rc.output).item)?.[0];
      if(!made)premise(c,{inventory:{...mats}});}
    if(!made){B(a,`${nm(sp)}/${rc.id}`,`造不出成品：${why||'20 次都没成'}`);return;}
    const consumed=Object.entries(c.doc.state.itemInstances).filter(([,u])=>u.status==='已消耗'&&JSON.stringify(u.recipe??{}).includes(hid)&&tagsOf(c.engine,u.item).includes('hair'));
    const prod=JSON.stringify(c.doc.state.itemInstances[made]),link=consumed.some(([id,u])=>prod.includes(id)||JSON.stringify(u).includes(made))||prod.includes(hid);
    const owner=consumed[0]?.[1]?.recipe?.owner;
    P(a,`${nm(sp)}/${rc.id}`,consumed.length>0&&link&&owner==='player',`消耗的毛单位 ${consumed.length}（来自 ${hid}，主人 ${owner}）；成品记录指向毛/畜群 ${link}`);
  });}
}

// ———— S8 浸泡 ————
log("S8");
{
  const a=A('S8',`${DAYS} 天浸泡：玩家养多种畜，每天剪毛、宰一头，逐日推进；统计与账本守恒`);
  await safe(a,'浸泡',async()=>{
    const spp=SP.filter(sp=>sp!=='monster_oat_pheasant').slice(0,4).concat(['monster_oat_pheasant']);
    const herds=spp.map((sp,i)=>herdRow(`population_acc_sk${i}`,sp,40,'player','bld_hw_home_21'));
    const c=T.game({id:'soak',herds,setup:{location:'bld_hw_home_21',inventory:{[KNIFE]:1,[SHEARS]:1},abilities:{skills:{[skillC]:300,[skillS]:300}}}});ALL.push(c);
    const tl={slaughter:0,slaughterFail:0,shear:0,shearFail:0,refusedTheft:0,carryLeft:0,parts:{},lost:{},hair:0,refusedOwn:[]};
    const add=(bag,rows)=>{for(const r of rows??[])bag[r.item]=(bag[r.item]??0)+r.quantity;};
    for(let d=0;d<DAYS;d++){
      for(let i=0;i<spp.length;i++){const id=`population_acc_sk${i}`,item=coatItemOf(c,id);
        if(item&&(rec(c,id).produce?.[item]??0)>=1){const r=await farm(c,{operation:'husbandry_collect',target:id,item,quantity:Math.min(60,Math.floor(rec(c,id).produce[item]))},`sk${d}`);if(r.ok){tl.shear++;if(!r.result.success)tl.shearFail++;tl.hair+=parts(r.result).reduce((n,x)=>n+x.quantity,0);}}
        const r=await farm(c,{operation:'husbandry_slaughter',target:id},`sa${d}`);
        if(r.ok){tl.slaughter++;if(!r.result.success)tl.slaughterFail++;add(tl.parts,parts(r.result));add(tl.lost,r.result.lost);if(r.result.leftBehind?.length)tl.carryLeft++;}else tl.refusedOwn.push(r.reason.slice(0,50));
        // 每次宰杀后把背包里的宰杀所得清走（前提：腾出手，不是账目；之后以 books 对账）
        premise(c,{inventory:Object.fromEntries(Object.keys(c.doc.state.inventory).filter(k=>![KNIFE,SHEARS].includes(k)&&!tagsOf(c.engine,k).includes('hair')&&!tagsOf(c.engine,k).includes('wool')).map(k=>[k,0]))});}
      const th=await farm(c,{operation:'husbandry_slaughter',target:'population_hw_home21_goats'},`tf${d}`);if(!th.ok)tl.refusedTheft++;
      const f=spp.reduce((n,sp,i)=>n+Math.ceil(rec(c,`population_acc_sk${i}`).count*(mon(sp)?.husbandry?.feed?.perHead??0.25)),0);premise(c,{inventory:{item_oats:f}});
      await wait(c,1440,`sd${d}`);premise(c,{inventory:{item_oats:0}});
    }
    const b=books(c);tl.books=b.ok;tl.refusedOwn=tl.refusedOwn.slice(0,3);
    log('浸泡',JSON.stringify(tl));write('soak.json',tl);
    P(a,'宰杀次数>0',tl.slaughter>0,`${tl.slaughter}（检定失败 ${tl.slaughterFail}，背不动留地 ${tl.carryLeft}）`);
    P(a,'取毛次数>0',tl.shear>0,`${tl.shear}（失败 ${tl.shearFail}，毛 ${tl.hair}）`);
    P(a,'违法宰杀每天被拒',tl.refusedTheft===DAYS,`${tl.refusedTheft}/${DAYS}`);
    P(a,'自家宰杀不被拒',!tl.refusedOwn.length,tl.refusedOwn.join('｜'));
    P(a,'浸泡后账本守恒',b.ok,JSON.stringify(b.mismatches));
  });
}

// ———— 总账 ————
{
  const a=A('L1','账本守恒：本脚本开出的全部存档（宰杀、取毛、背不动、NPC、制造）账本对账为空');
  const bad=ALL.filter(c=>!books(c).ok);
  P(a,`${ALL.length} 个存档`,bad.length===0,bad.length?JSON.stringify(books(bad[0]).mismatches):'全部为空');
  const v=A('V0','变异副本只改数据就能载入并跑通（五个新物种+新刃具）');
  if(mutErr||!useMut)B(v,'变异',mutErr??'--no-mut');else P(v,'变异载入',SP.length>=6&&COATED.length>=4,`物种 ${SP.length}，有毛被 ${COATED.length}`);
}

// ———— 输出 ————
const out=R.map(a=>({id:a.id,title:a.title,status:verdict(a),cells:a.cells}));
const sum={pass:0,fail:0,blocked:0};for(const o of out)sum[o.status]++;
for(const o of out){console.log(`${o.status.toUpperCase().padEnd(8)}${o.id}  ${o.title}`);for(const c of o.cells)if(c.st!=='pass')console.log(`    ${c.st==='fail'?'x':'?'} ${c.label}：${c.note}`);}
console.log(JSON.stringify(sum),'树',T.repo,'耗时',((Date.now()-T0)/1000).toFixed(0),'s');
const tag=process.env.ACC_TAG?`-${process.env.ACC_TAG}`:'';
write(`acceptance${tag}.json`,{repo:T.repo,days:DAYS,trials:TRIALS,useMut,summary:sum,assertions:out});
process.exitCode=sum.fail||sum.blocked?1:0;
