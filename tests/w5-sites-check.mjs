// T113–T115 共用的逐ID检查：按本批ID走通抵达、解机关、进入、调查、有限采集与真相解锁，
// 并验证 world_upgrade 从本批之前的世界升级时保留旧变化。不断言目录总数。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {siteKnowledge} from '../server-plugin/sites.mjs';
import {locationTraits} from '../server-plugin/traits.mjs';
import {applyInteraction} from '../server-plugin/interactions.mjs';
import {planWorldUpgrade} from '../server-plugin/world-upgrade.mjs';
import {validateWorld} from '../tools/validate-world.mjs';
import {buildBatch,withoutSites} from '../tools/w5-sites.mjs';

export async function sitesContext(n,override=null){
 const design=await import(`../world/design/w5-sites-${n}.mjs`),world=override??await loadWorld(),engine=new WorldEngine(world);
 const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
 const base=engine.createCharacter(seed,{},`w5-sites-${n}`),fresh=()=>structuredClone(base);
 return{design,sites:design.sites,ids:design.sites.map(s=>s.id),world,engine,fresh,seed};
}
const run=async(engine,document,tool,args,eventId)=>{const out=await engine.reduce(document,{tool,args,eventId});return{document:applyPatches(document,out.patches),result:out.result};};
const site=(engine,doc,operation,args,eventId)=>run(engine,doc,'world_site',{operation,...args},eventId);

export function checkCatalog({ids,world,sites}){
 assert.equal(new Set(ids).size,20,'本批20个不同ID');
 for(const s of sites){
  const place=world.locations.find(l=>l.id===s.id);assert.ok(place?.site,`${s.id} 已正式发布据点`);
  const p=place.site;
  assert.ok(Object.hasOwn(p,'owner'),`${s.id} 登记物权`);
  assert.ok(p.mechanisms.length>=1&&p.clues.length>=2&&p.resources.length>=1&&p.truths.length>=1,`${s.id} 机关、线索、资源、真相齐全`);
  assert.ok(p.history.length>=3&&p.changes.length>=1,`${s.id} 有分段历史与随时间变化`);
  assert.ok(locationTraits(place).tags.some(t=>t!=='location'),`${s.id} 地形可派生性状标签`);
  assert.ok(world.routes.some(r=>r.to===s.id||r.from===s.id),`${s.id} 有实际道路`);
  for(const f of place.features??[])assert.ok(f.thermalModel?.ignitable||f.kind==='water',`${s.id} 环境对象可受火或寒作用`);
 }
}

// Walk every site of the batch through the real tools with fixed successful checks.
export async function walkSites({sites,engine,fresh}){
 for(const s of sites){
  const place=engine.byId.get(s.id),p=place.site,route=engine.world.routes.find(r=>r.to===s.id);
  let c=fresh(s.id);c.state.location=route.from;c.state.player.attributes={力量:100,敏捷:100,体质:100,智力:100,精神:100,魅力:100};c.state.player.hp=c.state.player.maxHp=10000;
  c.state.skills??={};c.state.skills.skill_literacy??={level:1,proficiency:100};
  for(const m of p.mechanisms){if(m.tool)c.state.inventory[m.tool]={quantity:1};for(const x of m.materials??[])c.state.inventory[x.item]={quantity:x.quantity+(c.state.inventory[x.item]?.quantity??0)};}
  if(route.closedSeasons.includes(engine.calendar(c.state.minute).season)){
   await assert.rejects(run(engine,c,'world_move',{destination:s.id},`${s.id}-closed`),/季节/,`${s.id} 封路季节不能抵达`);
   while(route.closedSeasons.includes(engine.calendar(c.state.minute).season))c.state.minute+=30*1440;
  }
  c=(await run(engine,c,'world_move',{destination:s.id},`${s.id}-arrive`)).document;
  assert.equal(c.state.location,s.id,`${s.id} 沿道路抵达`);
  // Owners and managers come to the site in person to grant visit, disarm and gather permits.
  const authorizations=[];
  for(const grantor of [...new Set([p.manager??(p.owner?.startsWith('npc_')?p.owner:null),...p.resources.map(r=>r.owner).filter(o=>o?.startsWith('npc_'))].filter(Boolean))]){
   Object.assign(c.state.npcs[grantor],{location:s.id,activity:'',status:'正常'});delete c.state.npcs[grantor].scheduleTravel;delete c.state.npcs[grantor].cognitionTravel;
   for(const type of ['site_disarm','site_gather']){const g=await run(engine,c,'world_promise',{operation:'grant_access',promisor:grantor,location:s.id,type,content:'准许查看机关和取用旧物',minutes:10080},`${s.id}-${grantor}-${type}`);c=g.document;authorizations.push(g.result.authorization);}
  }
  const act=(op,args,ev)=>site(engine,c,op,{...args,authorizations},ev);
  // A natural 1 always fails; a fresh attempt is a new real action with its own time cost.
  const retry=async(op,args,ev,ok)=>{for(let i=0;i<6;i++){const r=await act(op,args,`${ev}-${i}`);c=r.document;if(ok(r.result))return r;}assert.fail(`${ev} 连续失败`);};
  for(const m of p.mechanisms){
   if(!(p.entryMechanisms??[]).includes(m.id))continue;
   c=(await act('investigate',{target:m.id},`${s.id}-see-${m.id}`)).document;
   await retry('disarm',{target:m.id},`${s.id}-open-${m.id}`,r=>r.status==='已解除');
  }
  let entered;try{entered=await act('enter',{},`${s.id}-enter`);}
  catch(error){
   assert.match(error.message,/占据者/,`${s.id} 进入失败只能因实际占据者`);
   for(const [id,a]of Object.entries(c.state.creatures??{}))if(a.location===s.id)a.status='死亡';
   for(const id of p.occupants??[])if(c.state.npcs[id])c.state.npcs[id].location='loc_bs';
   entered=await act('enter',{},`${s.id}-enter-vacated`);
  }
  c=entered.document;assert.equal(entered.result.entered,true,`${s.id} 入内`);
  for(const m of p.mechanisms){if((p.entryMechanisms??[]).includes(m.id))continue;
   c=(await act('investigate',{target:m.id},`${s.id}-see-${m.id}`)).document;
   await retry('disarm',{target:m.id},`${s.id}-open-${m.id}`,r=>r.status==='已解除');}
  for(const clue of p.clues)await retry('investigate',{target:clue.id},`${s.id}-clue-${clue.id}`,r=>r.discovered===true);
  assert.equal(siteKnowledge(engine.world,c).filter(t=>t.site===s.id).length,p.truths.length,`${s.id} 凑齐线索才解锁真相`);
  for(const res of p.resources){
   // A resource whose owner is an organisation with no manager on the spot cannot be taken.
   const owner=Object.hasOwn(res,'owner')?res.owner:p.owner;
   if(owner&&!owner.startsWith('npc_')&&!(owner===p.owner&&p.manager)){await assert.rejects(act('gather',{target:res.id},`${s.id}-deny-${res.id}`),/物权/,`${s.id}.${res.id} 物权另属且无人可签发`);continue;}
   const before=engine.quantity({get:(...k)=>k.reduce((v,x)=>v?.[x],c)},'player',res.item);
   const r=await act('gather',{target:res.id,quantity:res.quantity},`${s.id}-take-${res.id}`);c=r.document;
   assert.equal(r.result.remaining,0);assert.equal(engine.quantity({get:(...k)=>k.reduce((v,x)=>v?.[x],c)},'player',res.item),before+res.quantity);
   await assert.rejects(act('gather',{target:res.id},`${s.id}-again-${res.id}`),/有限资源不足/,`${s.id}.${res.id} 不因重访刷新`);
  }
 }
}

// Fire or cold on a registered feature clears the mechanism it names, without tools or a check.
export async function walkElements({sites,engine,fresh}){
 let count=0;
 for(const s of sites)for(const m of engine.byId.get(s.id).site.mechanisms.filter(m=>m.element)){
  const route=engine.world.routes.find(r=>r.to===s.id);let c=fresh(`${s.id}-el`);c.state.location=route.from;
  while(route.closedSeasons.includes(engine.calendar(c.state.minute).season))c.state.minute+=30*1440;
  c=(await run(engine,c,'world_move',{destination:s.id},`${s.id}-el-arrive`)).document;
  const authorizations=[];const owner=engine.byId.get(s.id).site.manager??engine.byId.get(s.id).site.owner;
  if(owner?.startsWith('npc_')){Object.assign(c.state.npcs[owner],{location:s.id,activity:'',status:'正常'});delete c.state.npcs[owner].scheduleTravel;delete c.state.npcs[owner].cognitionTravel;const g=await run(engine,c,'world_promise',{operation:'grant_access',promisor:owner,location:s.id,type:'site_disarm',content:'准许处理机关',minutes:600},`${s.id}-el-permit`);c=g.document;authorizations.push(g.result.authorization);}
  const entry=(engine.byId.get(s.id).site.entryMechanisms??[]).includes(m.id);
  if(!entry){for(const x of engine.byId.get(s.id).site.entryMechanisms??[]){c.state.records[`site:${s.id}`]??={category:'site',site:s.id,remaining:{},mechanisms:{}};c.state.records[`site:${s.id}`].mechanisms[x]={status:'已解除',minute:c.state.minute,sourceEvent:'test'};}
   try{c=(await site(engine,c,'enter',{authorizations},`${s.id}-el-enter`)).document;}catch(e){assert.match(e.message,/占据者/);for(const a of Object.values(c.state.creatures??{}))if(a.location===s.id)a.status='死亡';c=(await site(engine,c,'enter',{authorizations},`${s.id}-el-enter2`)).document;}}
  c=(await site(engine,c,'investigate',{target:m.id,authorizations},`${s.id}-el-see`)).document;
  const [feature,...tags]=[m.element.feature,...m.element.tags],agent=tags.includes('burning')?'fire':'cold';
  const d={document:structuredClone(c),get(...k){return k.reduce((v,x)=>v?.[x],this.document);},set(k,v){let o=this.document;for(const x of k.slice(0,-1))o=o[x]??={};o[k.at(-1)]=v;}};
  assert.ok(applyInteraction(d,engine,{agent,target:feature}).added.length,`${s.id} ${feature} 受${agent}作用`);
  c=d.document;c.state.player.attributes={力量:1,敏捷:1,体质:1,智力:1,精神:1,魅力:1};
  const r=await site(engine,c,'disarm',{target:m.id,authorizations},`${s.id}-el-open`);
  assert.equal(r.result.status,'已解除');assert.ok(tags.includes(r.result.element.state));assert.equal(r.result.check,undefined);count++;
 }
 return count;
}

// A save made before this batch keeps its own changes after world_upgrade, and the new sites work.
export async function checkUpgrade({design,world,seed,sites}){
 const batch=buildBatch(sites,world),old=withoutSites(world,batch,design.priorNoMechanics);
 assert.equal(validateWorld(world,{stage:'release'}).ok,true);
 const oldEngine=new WorldEngine(old);let doc=oldEngine.createCharacter(seed,{},'w5-upgrade');
 doc.state.player.coins=4321;doc.state.records.w5_marker={category:'test',value:7};
 const upgrade=planWorldUpgrade(doc,old,world,{worldHash:`w5-${sites[0].id}`,eventId:'w5-upgrade'}),next=applyPatches(doc,upgrade.patches);
 assert.equal(next.state.player.coins,4321);assert.deepEqual(next.state.records.w5_marker,doc.state.records.w5_marker);
 const engine=new WorldEngine(world);for(const s of sites)assert.ok(engine.byId.get(s.id).site);
 return next;
}
