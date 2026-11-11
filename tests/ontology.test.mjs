// S0 词汇表（L1）：world/ontology 按 schema 校验通过；代码已用的动词/标签/罪名全部登记（新增未登记词汇即失败）；
// 内容包命名空间与报错定位。
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadOntology,closureReport,KINDS} from '../tools/ontology.mjs';

const core=loadOntology();

test('词汇表全部文件通过 schema 与跨表引用校验，九类齐全',()=>{
 assert.deepEqual(core.errors,[]);
 for(const k of KINDS)assert.ok(core.entries[k].size>0,k);
 assert.deepEqual([...core.namespaces],['core']);
 assert.equal(core.entries.primitives.size,19,'19 个原语（含 S2a 的 holding.rescale，目标架构 §0.3）');
 assert.ok(core.has('tags','mark:satire')&&core.has('tags','goods:salt')&&core.has('tags','mark:anything'),'mark:* 与 goods:* 族已登记');
 assert.ok(core.entries['entity-templates'].get('core:thing').kinds.includes('mark'),'兜底 create(kind: mark)');
});

test('I18 词汇封闭：代码与法典里用到的动词、标签、罪名都已登记',async()=>{
 const r=await closureReport(core);
 assert.deepEqual(r.unknown,{verbs:[],tags:[],offenses:[]});
});

test('命名空间：核心 id 可省略前缀；包词汇以包命名空间限定，标签族不被误认为命名空间',()=>{
 const o=loadOntology({packs:['tests/fixtures/packs/demo']});
 assert.deepEqual(o.errors,[]);
 assert.ok(o.has('verbs','harm')&&o.has('verbs','core:harm'));
 assert.ok(o.has('verbs','demo:brew','demo')&&o.has('verbs','brew','demo')&&o.has('verbs','demo:toast'));
 assert.ok(!o.has('verbs','brew'),'包词汇不进入 core 命名空间');
 assert.ok(o.has('tags','offense:theft')&&o.has('tags','org:join')&&o.has('tags','fire'),'offense:/org: 是标签族');
 assert.equal(o.resolve('verbs','demo:brew').file,'tests/fixtures/packs/demo/vocabulary/verbs.json');
});

test('校验报错指出文件与字段',()=>{
 const o=loadOntology({packs:['tests/fixtures/packs/broken']});
 assert.ok(o.errors.length);
 assert.ok(o.errors.every(e=>e.file&&e.field&&e.message));
 assert.ok(o.errors.some(e=>e.file==='tests/fixtures/packs/broken/vocabulary/verbs.json'&&e.field==='/entries/0/family'&&e.code==='E-VOCAB-SCHEMA'));
 assert.ok(o.errors.some(e=>e.code==='E-VOCAB-BROADER'&&e.field==='/entries[id=salt_run]/broader'),'包词汇上位词必填');
 assert.ok(o.errors.some(e=>e.code==='E-VOCAB-SYN'&&/core:smuggling/.test(e.message)),'同义词闸门');
});

test('内容包清单 format 1 草案：示例包通过，保留字 id 被拒',async()=>{
 const {default:Ajv}=await import('ajv');
 const fs=await import('node:fs');
 const validate=new Ajv({allErrors:true,strict:false}).compile(JSON.parse(fs.readFileSync('schemas/pack-manifest.schema.json','utf8')));
 const manifest=JSON.parse(fs.readFileSync('tests/fixtures/packs/demo/manifest.json','utf8'));
 assert.ok(validate(manifest),JSON.stringify(validate.errors));
 assert.equal(validate({...manifest,id:'core'}),false);
 assert.equal(validate({...manifest,prompt:{staticTokens:5}}),false);
});

// WD-02 词汇一次登记：goods 食物子树、material:、super:/form:/anchor:/drive:/power:/bound:/ward:/bane:/motif:/habitat: 十族、family: 技艺族。
// has() 对"族:*"整族登记的前缀一律放行，不能发现上位词悬空，所以这里直接读 tags.json 逐条核对。
test('WD-02 新词：有 family、id 前缀与族一致、无重复、上位词已显式登记且链走到"族:*"根',async()=>{
 const fs=await import('node:fs');
 const {entries}=JSON.parse(fs.readFileSync('world/ontology/tags.json','utf8'));
 const byId=new Map();
 for(const e of entries){assert.ok(!byId.has(e.id),`重复 ${e.id}`);byId.set(e.id,e);}
 const FAMILIES=['goods','material','super','form','anchor','drive','power','bound','ward','bane','motif','habitat','family'];
 for(const fam of FAMILIES)assert.ok(byId.get(`${fam}:*`)?.pattern,`${fam}:* 族根未登记`);
 const wd02=entries.filter(e=>FAMILIES.includes(e.id.slice(0,e.id.indexOf(':'))));
 for(const e of wd02){
  assert.equal(e.family,e.id.slice(0,e.id.indexOf(':')),`${e.id} family 与前缀不符`);
  if(e.pattern)continue;
  assert.ok(e.broader,`${e.id} 缺上位词`);
  let cur=e,hops=0;
  while(!cur.pattern){
   assert.ok(cur.broader,`${cur.id} 链中断`);
   const up=byId.get(cur.broader);
   assert.ok(up,`${cur.id} 的上位词 ${cur.broader} 未显式登记`);
   cur=up;assert.ok(++hops<8,`${e.id} 上位链过深或成环`);
  }
  if(e.family!=='material')assert.equal(cur.id,`${e.family}:*`,`${e.id} 链根应为 ${e.family}:*`);
 }
 for(const fam of FAMILIES)assert.ok(wd02.some(e=>e.family===fam&&!e.pattern),`${fam} 族没有成员`);
});

test('WD-02：goods 食物树的组节点、02 的 7 个新物品 tag、材料链经 goods 子词',async()=>{
 const fs=await import('node:fs');
 const byId=new Map(JSON.parse(fs.readFileSync('world/ontology/tags.json','utf8')).entries.map(e=>[e.id,e]));
 const groups=['grain','legume','root','vegetable','fruit','nut','fungus','aquatic','meat','dairy','egg','fat','seasoning','drink','alcohol'];
 for(const g of groups)assert.equal(byId.get(`goods:${g}`)?.broader,'goods:food',`goods:${g} 应挂 goods:food`);
 assert.equal(byId.get('goods:food').broader,'goods:*');
 assert.equal(byId.get('goods:salt').broader,'goods:seasoning');
 assert.equal(byId.get('goods:fish').broader,'goods:aquatic');
 for(const t of['tea','alcohol','seaweed','insect','dairy_fermented','oilseed','fungus_log'])assert.ok(byId.get(t)?.family,`02 新 tag ${t}`);
 for(const id of byId.keys())if(id.startsWith('material:')&&id!=='material:*'&&byId.get(id).broader.startsWith('goods:'))assert.ok(byId.get(byId.get(id).broader),`${id} 的 goods 母词`);
 assert.equal(byId.get('material:timber').broader,'goods:timber');
 assert.equal(byId.get('family:blade/footwork').broader,'family:blade');
 assert.equal(byId.get('family:blade').broader,'family:melee');
});
