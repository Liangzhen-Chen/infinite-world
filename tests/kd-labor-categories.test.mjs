// 卡 D：劳动类别只从职业数据的 labor 属性派生，不认职业名里的字眼。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {laborCategories,npcProfessions} from '../server-plugin/npc-labor.mjs';

const world=await loadWorld();
const seed=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
const open=w=>{const engine=new WorldEngine(w);return {engine,doc:engine.createCharacter(seed,{},'kd')};};

test('职业编号与职业称谓都经职业数据的 labor 属性得出劳动类别', ()=>{
 const {engine,doc}=open(structuredClone(world));
 const withLabor=world.professions.filter(p=>p.labor?.length);
 assert.ok(withLabor.length>0);
 for(const n of world.npcs){
  const expected=new Set(npcProfessions(engine,doc.state,n.id).flatMap(p=>p.labor??world.careers?.[p.id]?.labor??[]));
  assert.deepEqual(laborCategories(engine,doc.state,n.id),[...expected].sort(),n.id);
 }
 // 没有 labor 属性的职业（如战斗职业）不产生劳动。
 const combat=world.npcs.find(n=>n.professions?.length&&n.professions.every(id=>!engine.byId.get(id)?.labor&&!world.careers?.[id]?.labor));
 if(combat)assert.deepEqual(laborCategories(engine,doc.state,combat.id),[]);
});

test('从没出现过的职业名，只给 labor 属性，就派生出劳动类别；改名后不变', ()=>{
 const w=structuredClone(world),who=w.npcs.find(n=>!n.professions?.length&&n.occupation&&n.age>=18)??w.npcs.find(n=>n.age>=18);
 w.professions.push({id:'profession_kd_probe',name:'晨钟客',kind:'life',aliases:[],labor:['gather','sell']});
 who.professions=[];who.occupation='晨钟客';
 const a=open(w);
 assert.deepEqual(laborCategories(a.engine,a.doc.state,who.id),['gather','sell']);
 const r=structuredClone(w);r.professions.find(p=>p.id==='profession_kd_probe').name='Zxqwertyuio';r.npcs.find(n=>n.id===who.id).occupation='Zxqwertyuio';
 const b=open(r);
 assert.deepEqual(laborCategories(b.engine,b.doc.state,who.id),['gather','sell']);
 // 同一称谓去掉 labor 属性就没有劳动：类别来自属性，不来自名字。
 const z=structuredClone(w);delete z.professions.find(p=>p.id==='profession_kd_probe').labor;
 const c=open(z);
 assert.deepEqual(laborCategories(c.engine,c.doc.state,who.id),[]);
});
