import fs from 'node:fs/promises';
import {loadWorld} from '../../tools/load-world.mjs';
import {WorldEngine} from '../../server-plugin/engine.mjs';
import {applyPatches,PatchCursor} from '../../server-plugin/storage.mjs';
import {advanceCredit,loanTerms} from '../../server-plugin/credit.mjs';
import {applyConsentEvent} from '../../server-plugin/action-consent.mjs';
export const world=await loadWorld(),seed=JSON.parse(await fs.readFile(new URL('../fixtures/legacy/seed.json',import.meta.url),'utf8'));
export const clerk='npc_hw_shendu',host='npc_hw_linsui',worker='npc_hw_ayan',post='bld_hw_post',inn='bld_hw_qingdeng',DAY=1440;
// 产品原则二.4：借款前由出借人同意实际报价；调用者不能以 consent:true 代答。
// 只使用现有原生写入者，不注入债权或改动任何钱物/账本前提。
export function grantLoanConsent(engine,document,{lender,principal,days,eventId}){
    const d=engine.primitiveDraft(document),{interest}=loanTerms(d,engine,{lender,principal,days,collateralValue:0});
    applyConsentEvent(d,{engine,document:d.document},{actor:lender,eventId,verb:'consent_given',to:'player',payload:{scope:'loan',subject:'player',purpose:['player'],terms:{principal,days,interest},until:document.state.minute+10}});
    return applyPatches(document,d.patches);
}
export function fixture({at=post,coins=3000}={}){
    const w=structuredClone(world),e=new WorldEngine(w);let doc=e.initialFromLegacy(seed,'finance');
    doc.state.minute=600;doc.state.location=at;doc.state.player.coins=coins;
    doc.state.inventory={item_bread:{quantity:100},item_wood:{quantity:100},item_oats:{quantity:100}};
    const people=[clerk,host,worker,'npc_hw_chenbai','npc_hw_gucen'];
    doc.state.npcs=Object.fromEntries(people.map(id=>[id,{...doc.state.npcs[id],coins:500,location:at,status:'正常',activity:'休息',goals:{},inventory:{item_bread:{quantity:20}},memoryStream:[]}]));
    for(const n of w.npcs.filter(n=>people.includes(n.id))){delete n.schedule;n.schedule={default:[{start:0,end:1440,location:at,activity:'休息',services:['trade']}]};}
    const act=async(args,id,tool='world_trade')=>{const r=await e.reduce(doc,{tool,args,eventId:id});doc=applyPatches(doc,r.patches);return r.result;};
    function draft(){const cursor=new PatchCursor(doc);return {get document(){return cursor.root;},get:(...p)=>cursor.expose(p.reduce((v,k)=>v?.[k],cursor.root)),set:(path,value)=>cursor.apply({op:'set',path,value}),say:()=>{},remove:path=>cursor.apply({op:'delete',path}),done:()=>{doc=cursor.root;}};}
    return {e,w,act,draft,get doc(){return doc;},set doc(v){doc=v;},tick(minute){const d=draft();d.set(['state','minute'],minute);advanceCredit(d,e,minute);d.done();}};
}
export function cash(doc){const s=doc.state;return s.player.coins+Object.values(s.npcs).reduce((n,r)=>n+(r.coins??0),0)+Object.values(s.settlements).reduce((n,r)=>n+(r.treasury??0),0)
    +Object.values(s.records).filter(r=>['bank','faction_assets','legal_treasury','legal_deposit'].includes(r.category)).reduce((n,r)=>n+(r.coins??0),0)
    +Object.values(s.records).filter(r=>r.category==='organization'&&!s.records[`faction-assets:${r.id}`]).reduce((n,r)=>n+(r.treasury??0),0)
    +Object.values(s.records).filter(r=>['contract','organization_proposal'].includes(r.category)).reduce((n,r)=>n+(r.escrow??0),0)
    +world.factions.filter(f=>!s.records[`faction-assets:${f.id}`]).reduce((n,f)=>n+(f.resources?.treasuryCopper??0),0)
    +Object.values(s.quests).reduce((n,q)=>n+(q.escrow??0),0);}
