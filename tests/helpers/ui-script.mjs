// A1 界面动作脚本：与“可做之事”面板走同一条路——先 POST /actions 取此处或对某对象可做之事（菜单里没有就是界面够不着），
// 再把菜单行的预填槽位与脚本给的槽位交给 /execute 的 world_act，回执里的事件流文字与已应用效果供断言。不调用模型。
import {createPlaytestServer} from '../../tools/playtest-runner.mjs';
import {digest} from '../../server-plugin/storage.mjs';

// Optional mutate(state, world) prepares the scene (time, place, purse) on a copy of a freshly created campaign.
export async function uiSession(t,{mutate=null,world,seed}={}){
 const server=await createPlaytestServer({seed,consistencyEnabled:false,...(world?{world}:{})});t.after(()=>server.close());
 let {reference}=await server.api('create',{});
 if(mutate){
  const bundle=await server.api('export',{campaignId:reference.campaignId}),initial=structuredClone(bundle.initial);
  // Seed fixture: the scene a scenario needs, written before the first event (the campaign starts here).
  await mutate(initial.state,initial);
  const hash=digest(initial);
  const imported=await server.api('import',{bundle:{...bundle,initial,events:[],metadata:{...bundle.metadata,initialHash:hash},checksum:hash,documentHash:hash}});
  reference=imported.reference;
 }
 const campaignId=reference.campaignId;let counter=0;
 const read=async()=>(await server.api('read',{campaignId})).document;
 const menu=async(target=null)=>server.api('actions',{campaignId,...(target?{target}:{})});
 // choose(id, slots, {target}) → the menu must offer the action; returns {ok, lines, applied, result} or {ok:false, error}.
 async function choose(action,slots={},{target=null,search=false,eventId=`ui-${++counter}`}={}){
  const here=await menu(target),row=here.actions.find(a=>a.id===action||a.id===`core:${action}`);
  if(!row&&!search)throw Error(`菜单里没有 ${action}（${target??'此处'}）：${here.actions.map(a=>a.id).join(' ')}`);
  const view=await server.api('read',{campaignId});
  try{
   const out=await server.api('execute',{campaignId,tool:'world_act',args:{action:row?.id??action,slots:{...row?.fill,...slots}},eventId,anchor:null,expectedSequence:view.reference.sequence});
   return {ok:true,lines:out.narration?.lines??[],applied:out.narration?.applied??[],result:out.result,duplicate:out.duplicate===true,eventId};
  }catch(error){return {ok:false,error:error.message,status:error.httpStatus};}
 }
 // Resubmit the same UI request (same eventId) — the host retrying a click.
 async function retry(action,slots,eventId,target=null){
  const here=await menu(target),row=here.actions.find(a=>a.id===action||a.id===`core:${action}`),view=await server.api('read',{campaignId});
  const out=await server.api('execute',{campaignId,tool:'world_act',args:{action:row.id,slots:{...row.fill,...slots}},eventId,anchor:null,expectedSequence:view.reference.sequence});
  return out;
 }
 return {server,campaignId,read,menu,choose,retry};
}
// Total copper held by the player, NPCs, settlements and record escrows: a UI action only moves it.
export function totalCopper(document){
 const s=document.state,records=Object.values(s.records??{});
 return s.player.coins+Object.values(s.npcs??{}).reduce((n,r)=>n+(r.coins??0),0)+Object.values(s.settlements??{}).reduce((n,r)=>n+(r.treasury??0),0)
  +records.filter(r=>r?.category==='bank').reduce((n,r)=>n+(r.coins??0),0)+records.filter(r=>r?.category==='contract').reduce((n,r)=>n+(r.escrow??0),0)
  +Object.values(s.quests??{}).reduce((n,q)=>n+(q.escrow??0),0);
}
export const qty=v=>typeof v==='number'?v:v?.quantity??0;
