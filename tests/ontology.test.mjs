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
 assert.equal(core.entries.primitives.size,18);
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
