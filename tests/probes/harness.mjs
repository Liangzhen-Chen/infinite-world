// 推演脚本公共夹具：真实 loadWorld + WorldEngine，与核对者 probe-001-scratch-a/common.mjs 同口径。
// 推演只读世界数据与引擎，不写 world/ 与存档；每个事件的情境构建一次，供同事件各预期共用。
import fs from 'node:fs';
import path from 'node:path';
import {loadWorld} from '../../tools/load-world.mjs';
import {WorldEngine} from '../../server-plugin/engine.mjs';
import {applyPatches,PatchCursor} from '../../server-plugin/storage.mjs';

export const ROOT=path.resolve(import.meta.dirname,'../..');
export const DAY=1440;
export const VERDICTS=['合理','部分','错误','缺失'];
export const world=await loadWorld();
export const seed=JSON.parse(fs.readFileSync(path.join(ROOT,'tests/fixtures/legacy/seed.json'),'utf8'));
export const src=file=>fs.readFileSync(path.join(ROOT,file),'utf8');
export const imp=file=>import(new URL(`../../${file}`,import.meta.url));

export function setup({schedules=false,coins=50000,id='probe'}={}){
 const w=structuredClone(world);if(!schedules)for(const n of w.npcs)delete n.schedule;
 const engine=new WorldEngine(w),doc=engine.createCharacter(seed,{},id);
 doc.state.player.coins=coins;
 const run=async(c,tool,args,eventId)=>{const out=await engine.reduce(c,{tool,args,eventId});return {document:applyPatches(c,out.patches),result:out.result};};
 const attempt=async(c,tool,args,eventId)=>{try{return await run(c,tool,args,eventId);}catch(error){return {document:c,error:error.message};}};
 const wait=async(c,days,ev='wait')=>{let left=Math.round(days*DAY),i=0;while(left>0){const m=Math.min(left,43200);c=(await run(c,'world_time',{minutes:m},`${ev}:${i++}`)).document;left-=m;}return c;};
 return {engine,doc,run,attempt,wait,w};
}
// Mutable draft over a document, the same shape the engine's handlers receive.
export function draft(document){
 const cursor=new PatchCursor(document);
 return {get document(){return cursor.root;},patches:[],get:(...p)=>cursor.expose(p.reduce((v,k)=>v?.[k],cursor.root)),
  set(path,value){cursor.apply({op:'set',path,value});},remove(path){cursor.apply({op:'delete',path});},say(){},messages:[]};
}
export const recs=(c,cat)=>Object.entries(c.state.records??{}).filter(([,r])=>r.category===cat);
export const once=fn=>{let p;return()=>p??=fn();};
// Verdict helpers: each expectation returns one of these with evidence text.
export const ok=(evidence)=>({verdict:'合理',evidence});
export const partial=(evidence)=>({verdict:'部分',evidence});
export const wrong=(evidence)=>({verdict:'错误',evidence});
export const missing=(evidence)=>({verdict:'缺失',evidence});
// Capability probe: does any server-plugin module contain the pattern (for mechanisms not yet present)?
export function codeHas(re,dir='server-plugin'){
 return fs.readdirSync(path.join(ROOT,dir)).filter(f=>f.endsWith('.mjs')).some(f=>re.test(src(`${dir}/${f}`)));
}
