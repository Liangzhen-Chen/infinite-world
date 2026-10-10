import test from 'node:test';
import assert from 'node:assert/strict';
import {fixedSample,validateScores,acceptFactCorrections,dimensions} from '../tools/w3-wave-score.mjs';
import {hashContent} from '../tools/content-pipeline.mjs';
const seed='ab'.repeat(32),entries=Array.from({length:20},(_,i)=>({id:`entry_${i}`,entity:{description:'可核验的原始文字'}}));
const report=()=>({seed,corpusHash:hashContent(entries),samples:fixedSample(entries,seed).map(x=>({id:x.id,entityHash:hashContent(x.entity),ratings:Object.fromEntries(dimensions.map(d=>[d,{score:4,quote:'原始文字',reason:'根据当前正式字段逐项核验。'}]))}))});
test('固定抽样不受输入顺序影响，替换样本、虚构引文和改变源文本均不能通过',()=>{
 assert.deepEqual(fixedSample(entries,seed),fixedSample([...entries].reverse(),seed));
 assert.equal(new Set(fixedSample(entries,seed).map(x=>x.id)).size,10);
 const r=report();assert.equal(validateScores(r,entries).passed,true);
 const replaced=structuredClone(r);replaced.samples.reverse();assert.throws(()=>validateScores(replaced,entries),/样本/);
 const fabricated=structuredClone(r);fabricated.samples[0].ratings[dimensions[0]].quote='不存在的引文';assert.throws(()=>validateScores(fabricated,entries),/引文/);
 const changed=structuredClone(entries);changed[0].entity.description+='改动';assert.throws(()=>validateScores(r,changed),/依据失效/);
});
test('高均分不能掩盖任一低于3的评分，均分低于4也不能通过',()=>{
 const r=report();for(const s of r.samples)for(const d of dimensions)s.ratings[d].score=5;r.samples[0].ratings[dimensions[0]].score=2;assert.equal(validateScores(r,entries).passed,false);
 for(const s of r.samples)for(const d of dimensions)s.ratings[d].score=3;assert.equal(validateScores(r,entries).passed,false);
});
test('仅精确事实修正能更新依据且不换样本，其余任何正式改动阻断',()=>{
 const r=report(),changed=structuredClone(entries),patches=[{id:entries[0].id,field:'description',from:'原始',to:'修正',reason:'事实更正'}];changed[0].entity.description=changed[0].entity.description.replace('原始','修正');
 const next=acceptFactCorrections(r,changed,patches);assert.equal(next.seed,r.seed);assert.deepEqual(next.samples.map(x=>x.id),r.samples.map(x=>x.id));assert.equal(next.corpusHash,hashContent(changed));
 changed[1].entity.description+='未说明的改动';assert.throws(()=>acceptFactCorrections(r,changed,patches),/指定事实修正外/);
});
