import test from 'node:test';
import assert from 'node:assert/strict';
import {fixedSample,validateScores,acceptFactCorrections,dimensions,basisDimensions,basisExists,skeletonRoot} from '../tools/w3-wave-score.mjs';
import {hashContent} from '../tools/content-pipeline.mjs';
const seed='ab'.repeat(32),entries=Array.from({length:20},(_,i)=>({id:`entry_${i}`,entity:{description:'可核验的原始文字'}}));
const skeletons=new Map(entries.map(e=>[e.id,skeletonRoot({id:e.id,use:'可核验的骨架文字',physical:{appearance:['顺纹']}},{processFacts:'削出浅匙腹'})])),validate=(r,e)=>validateScores(r,e,skeletons);
const report=()=>({seed,corpusHash:hashContent(entries),samples:fixedSample(entries,seed).map(x=>({id:x.id,entityHash:hashContent(x.entity),ratings:Object.fromEntries(dimensions.map(d=>[d,{score:4,quote:'原始文字',reason:'根据当前正式字段逐项核验。',...(basisDimensions.includes(d)?{basis:'use'}:{})}]))}))});
test('固定抽样不受输入顺序影响，替换样本、虚构引文和改变源文本均不能通过',()=>{
 assert.deepEqual(fixedSample(entries,seed),fixedSample([...entries].reverse(),seed));
 assert.equal(new Set(fixedSample(entries,seed).map(x=>x.id)).size,10);
 const r=report();assert.equal(validate(r,entries).passed,true);
 const replaced=structuredClone(r);replaced.samples.reverse();assert.throws(()=>validate(replaced,entries),/样本/);
 const fabricated=structuredClone(r);fabricated.samples[0].ratings[dimensions[0]].quote='不存在的引文';assert.throws(()=>validate(fabricated,entries),/引文/);
 const changed=structuredClone(entries);changed[0].entity.description+='改动';assert.throws(()=>validate(r,changed),/依据失效/);
});
test('高均分不能掩盖任一低于3的评分，均分低于4也不能通过',()=>{
 const r=report();for(const s of r.samples)for(const d of dimensions)s.ratings[d].score=5;r.samples[0].ratings[dimensions[0]].score=2;assert.equal(validate(r,entries).passed,false);
 for(const s of r.samples)for(const d of dimensions)s.ratings[d].score=3;assert.equal(validate(r,entries).passed,false);
});
test('仅精确事实修正能更新依据且不换样本，其余任何正式改动阻断',()=>{
 const r=report(),changed=structuredClone(entries),patches=[{id:entries[0].id,field:'description',from:'原始',to:'修正',reason:'事实更正'}];changed[0].entity.description=changed[0].entity.description.replace('原始','修正');
 const next=acceptFactCorrections(r,changed,patches);assert.equal(next.seed,r.seed);assert.deepEqual(next.samples.map(x=>x.id),r.samples.map(x=>x.id));assert.equal(next.corpusHash,hashContent(changed));
 changed[1].entity.description+='未说明的改动';assert.throws(()=>acceptFactCorrections(r,changed,patches),/指定事实修正外/);
});

test('评分细则：具体性、独特性须给骨架里存在的 basis；缺、路径不存在都判无效，其他维度不要求',()=>{
 assert.deepEqual(basisDimensions,['具体性','独特性']);
 for(const d of basisDimensions){
  const missing=report();delete missing.samples[0].ratings[d].basis;assert.throws(()=>validate(missing,entries),/basis/);
  const empty=report();empty.samples[0].ratings[d].basis='  ';assert.throws(()=>validate(empty,entries),/basis/);
  const absent=report();absent.samples[0].ratings[d].basis='physical.sizeClass';assert.throws(()=>validate(absent,entries),/basis/);
  const absentRecipe=report();absentRecipe.samples[0].ratings[d].basis='recipe.minutes';assert.throws(()=>validate(absentRecipe,entries),/basis/);
  for(const ok of ['use','physical.appearance','recipe.processFacts']){const r=report();r.samples[0].ratings[d].basis=ok;assert.equal(validate(r,entries).passed,true,ok);}
 }
 const other=report();for(const d of dimensions)if(!basisDimensions.includes(d))assert.equal('basis' in other.samples[0].ratings[d],false);
 assert.equal(validate(other,entries).passed,true);
 assert.throws(()=>validateScores(report(),entries),/骨架/,'没有样本骨架无法核对 basis');
});
test('评分细则：fabricated 非空时该项最高 2 分；fabricated 须是 quote 的原文片段',()=>{
 for(const d of basisDimensions){
  const high=report();high.samples[0].ratings[d].fabricated=['原始'];assert.throws(()=>validate(high,entries),/最高 2 分/);
  const low=report();low.samples[0].ratings[d].fabricated=['原始'];low.samples[0].ratings[d].score=2;assert.equal(validate(low,entries).minimum,2,'2 分可写入，门槛另判');assert.equal(validate(low,entries).passed,false);
  const notQuote=report();notQuote.samples[0].ratings[d].fabricated=['引文里没有'];notQuote.samples[0].ratings[d].score=1;assert.throws(()=>validate(notQuote,entries),/fabricated/);
  const empty=report();empty.samples[0].ratings[d].fabricated=[];assert.equal(validate(empty,entries).passed,true);
 }
});
test('basisExists：点路径逐级取，空值与不存在都判无',()=>{
 const root=skeletonRoot({id:'item_a',use:'u',physical:{appearance:['x'],processSteps:[]}},{processFacts:'p'});
 assert.equal(basisExists(root,'use'),true);assert.equal(basisExists(root,'physical.appearance'),true);assert.equal(basisExists(root,'recipe.processFacts'),true);
 assert.equal(basisExists(root,'physical.processSteps'),false);assert.equal(basisExists(root,'physical.volumeL'),false);assert.equal(basisExists(root,'recipe.minutes'),false);assert.equal(basisExists(root,''),false);assert.equal(basisExists(root,undefined),false);
 assert.equal(basisExists(skeletonRoot({id:'recipe_a',processFacts:'p'}),'recipe.processFacts'),true,'配方条目的 recipe 是自身');
});
