// S0 意图语料初版与评分骨架（06 §6.11）：语料规模、刁钻创意占比、四种处理齐全且引用都可解析；桩翻译器管线可出分。
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCorpus,validateCorpus,score,HANDLINGS} from '../tools/intent-score.mjs';

const items=loadCorpus();

test('语料 ≥200 条，刁钻创意 ≥30%，四种期望处理都有，覆盖各玩法',()=>{
 assert.ok(items.length>=200,`${items.length}`);
 assert.ok(items.filter(i=>i.creative).length/items.length>=0.3);
 for(const h of HANDLINGS)assert.ok(items.some(i=>i.expect.handling===h),h);
 assert.ok(new Set(items.map(i=>i.domain)).size>=15);
});

test('语料全部通过校验：动作 id、原语、实体模板、罪名、兜底标签与反应系统都已登记',()=>{
 assert.deepEqual(validateCorpus(items),[]);
 for(const i of items.filter(i=>i.expect.handling==='fallback')){assert.ok(i.expect.fallback.reactors.length,i.id);assert.equal(i.expect.fallback.kind,'mark',i.id);}
 assert.ok(items.every(i=>!i.expect.signature.some(s=>s.includes('offense:'))),'罪名不进签名');
});

test('校验报错指出文件与字段',()=>{
 const bad={...items[0],expect:{...items[0].expect,route:'core:trade.nonexistent'}};
 const errors=validateCorpus([bad]);
 assert.equal(errors.length,1);
 assert.equal(errors[0].file,'tests/intents/corpus-001.json');
 assert.equal(errors[0].field,'/items/0/expect/route');
});

test('桩翻译器管线出分：路由与签名指标、不支持率、兜底实体无系统反应率',()=>{
 const s=score(items);
 assert.equal(s.routeAccuracy,1);assert.equal(s.signatureMatch,1);
 assert.ok(s.unsupportedRate>0&&s.unsupportedRate<1);
 assert.equal(s.annotationGaps,0);
 assert.equal(s.fallback,items.filter(i=>i.expect.handling==='fallback').length);
 const none=score(items,{translate:()=>({handling:'infeasible',route:'infeasible',signature:[]})});
 assert.ok(none.routeAccuracy<0.1);
});
