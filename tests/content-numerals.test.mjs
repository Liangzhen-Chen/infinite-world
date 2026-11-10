import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpRoot} from '../tools/tmp-root.mjs';
import {parseChineseNumeral,repairNumeral,numeralIssues,chineseNumeralIssues,durationIssues,skeletonMinutes} from '../tools/content-numerals.mjs';
import {runContentPipeline} from '../tools/content-pipeline.mjs';
import {validateW3Draft} from '../tools/w3-content.mjs';

test('中文数字解析器：合法组合给出正确数值', () => {
  const good={七十:70,十:10,十五:15,二十:20,三十六:36,九十九:99,一百:100,一百零五:105,一百五:150,一千二:1200,一万五:15000,一百二十三:123,一千零一:1001,一千二百三十四:1234,
    一万零五:10005,一万五千:15000,十万:100000,二十万:200000,三千万:30000000,两百:200,两千零二十:2020,一两百:200,七八十:80,二〇二六:2026,零:0,两:2};
  for(const[text,value]of Object.entries(good)){const r=parseChineseNumeral(text);assert.equal(r.ok,true,text);assert.equal(r.value,value,text);}
});

test('中文数字解析器：不合法组合判错', () => {
  for(const bad of ['七十零','十十','二十二十','一百零','一百零十','一百十','两十','零十','三百千','一千零零五','七十零五'])
    assert.equal(parseChineseNumeral(bad).ok,false,bad);
});

test('中文数字解析器：词里的单位字、万万等不判', () => {
  for(const word of ['万一','百姓','千里','万万','一万万','百万'])assert.ok(parseChineseNumeral(word).skip===true,word);
  assert.deepEqual(chineseNumeralIssues('万一失手，百姓千里迢迢，二十两银，三十零件，二点三十分，十分小心，一一核对，三三两两，相距一百千米，限重四百千克，高于二十千帕'),[]);
});

test('正文里的坏数字与「数字直接接钟」被抓出', () => {
  assert.equal(chineseNumeralIssues('全程约七十零分钟').length,1);
  assert.equal(chineseNumeralIssues('全程九十钟').length,1);
  assert.match(chineseNumeralIssues('全程九十钟')[0],/分钟/);
  assert.deepEqual(chineseNumeralIssues('全程约七十分钟，两钟酒'),[]);
});

test('数字与时间单位之间夹非法字符判错：九十加分钟、七十整分钟', () => {
  for(const bad of ['全程九十加分钟','全程约七十整分钟','三十再小时','一百加时辰'])assert.equal(chineseNumeralIssues(bad).length,1,bad);
  assert.match(chineseNumeralIssues('全程九十加分钟')[0],/夹了「加」/);
});

test('合法的概数、量词、半个写法与拿不准的情形不判', () => {
  for(const ok of ['全程九十多分钟','九十余分钟','约九十分钟左右','二十来分钟','三十几分钟','三百余小时','一个半时辰','半个时辰','一个半小时','三个时辰','两个小时','约九十分钟上下','四人小时的工量','三十岁小时候的事','九十左右分钟'])
    assert.deepEqual(chineseNumeralIssues(ok),[],ok);
});

test('数字连写（乘法口诀、成语）形态上不确定，不判', () => {
  assert.deepEqual(chineseNumeralIssues('九九八十一难，三七二十一，一五一十地说，一二三四五'),[]);
  assert.ok(parseChineseNumeral('九九八十一').skip===true);
  assert.equal(chineseNumeralIssues('全程七十零分钟').length,1); // 其他确定的错仍判
});

test('总括时长须与 minutes 一致；时辰按一时辰120分钟，半个时辰60分钟；分步时长不判', () => {
  assert.deepEqual(durationIssues('全程约七十分钟',70),[]);
  assert.deepEqual(durationIssues('全程约半个时辰',60),[]);
  assert.deepEqual(durationIssues('总耗时一个时辰',120),[]);
  assert.deepEqual(durationIssues('全程约一个半小时',90),[]);
  assert.equal(durationIssues('全程约七十分钟',60).length,1);
  assert.equal(durationIssues('全程约半个时辰',30).length,1);
  assert.deepEqual(durationIssues('浸泡约三十分钟，另有静置一小时',90),[]); // 无总括词：对应关系不确定，不判
  assert.deepEqual(durationIssues('回炉保温共约二十分钟，各步合计约120分钟',180),[]); // 共、合计是分步小计，不作总括词
  assert.deepEqual(durationIssues('全程约七十分钟',undefined),[]);
  assert.deepEqual(durationIssues('全程约七十零分钟',70),[]); // 数字本身不合法由规则(a)报，不重复报时长
});

test('minutes 取值来源不确定时不判', () => {
  assert.equal(skeletonMinutes({minutes:70}),70);
  assert.equal(skeletonMinutes({minutes:70,processFacts:{minutes:60}}),null);
  assert.equal(skeletonMinutes({id:'x'}),null);
  assert.deepEqual(numeralIssues({id:'x',process:'全程约九十分钟'},{id:'x'}),[]);
});

test('numeralIssues：骨架 minutes 与正文总括时长矛盾判错，id 字段不扫描', () => {
  const errors=numeralIssues({id:'recipe_七十零',process:'全程约九十分钟'},{minutes:70});
  assert.equal(errors.length,1);assert.match(errors[0],/minutes=70/);
});

test('validateW3Draft 也带共用数字规则：七十零分钟判错', () => {
  const entry={id:'recipe_x',minutes:70},blocklist={names:[],realPeople:[]};
  const bad=validateW3Draft({id:'recipe_x',process:'取皮纸裁成小片，削去四角，逐片锥孔穿线打结。全程约七十零分钟；成组吊签合为一份交付，字迹由使用者自行填写，余料随工序弃置。'},entry,blocklist,null);
  assert.ok(bad.errors.some(e=>e.includes('七十零')));
  const ok=validateW3Draft({id:'recipe_x',process:'取皮纸裁成小片，削去四角，逐片锥孔穿线打结。全程约七十分钟；成组吊签合为一份交付，字迹由使用者自行填写，余料随工序弃置。'},entry,blocklist,null);
  assert.deepEqual(ok.errors,[]);
});

test('runContentPipeline 对任意工具的 validateDraft 统一追加数字规则', async t => {
  const root=await fs.mkdtemp(path.join(tmpRoot(),'numeral-l1-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const texts={recipe_bad:'取料切片，全程约七十零分钟，成品一份。',recipe_good:'取料切片，全程约七十分钟，成品一份。'};
  const client={spent:0,budgetYuan:20,estimateCostYuan:()=>.01,async generate(body,label){this.spent+=.01;
    const out=label.includes('-review')?{contradictions:[]}:{id:body.id,process:texts[body.id]};
    return {choices:[{message:{content:JSON.stringify(out)}}],usage:{completion_tokens:11},measurement:{costUpperYuan:.01}};}};
  const result=await runContentPipeline({root,client,entries:[{id:'recipe_bad',minutes:70},{id:'recipe_good',minutes:70}],buildDraftRequest:entry=>({id:entry.id}),
    reviewDraftFor:entry=>({id:entry.id,process:texts[entry.id]}),validateDraft:()=>[],concurrency:2});
  const byId=Object.fromEntries(result.results.map(r=>[r.id,r]));
  assert.equal(byId.recipe_good.status,'passed');
  assert.equal(byId.recipe_bad.status,'manual');
  assert.ok(byId.recipe_bad.errors.some(e=>String(e).includes('七十零')));
});

test('文末小时不被「候代」豁免误放过；岁小时候不判', () => {
  assert.equal(chineseNumeralIssues('歇了三十再小时').length, 1);
  assert.equal(chineseNumeralIssues('三十岁小时候的事').length, 0);
});

test('单字「一」常是词的一部分，不判；多字数字照判', () => {
  assert.equal(chineseNumeralIssues('静置一整小时').length, 0);
  assert.equal(chineseNumeralIssues('须一定时辰').length, 0);
  assert.equal(chineseNumeralIssues('全程七十整分钟').length, 1);
});

test('报错附修复建议：九十零、九十加分钟、七十整分钟、十十；推不出来不给建议', () => {
  const entry = { id: 'x', minutes: 90 };
  const one = text => numeralIssues({ p: text }, entry, null)[0];
  assert.match(one('全程九十零分钟'), /应写作「九十分钟」或「90分钟」/);
  assert.match(one('全程九十加分钟'), /应写作「九十分钟」或「90分钟」/);
  const zheng = one('全程七十整分钟'); // 改正值 70 与骨架 90 不一致：只给骨架写法
  assert.match(zheng, /以骨架为准，应写作「90分钟」/); assert.doesNotMatch(zheng, /应写作「七十分钟」/);
  assert.match(one('全程十十分钟'), /以骨架为准，应写作「90分钟」/);
  assert.match(numeralIssues({ p: '浸泡九十零分钟' }, entry, null)[0], /应写作「九十分钟」或「90分钟」$/); // 非总括词：不与骨架比对
  assert.doesNotMatch(one('全程二十零五分钟'), /应写作/); // 去零得 25、去十得 205，值不唯一，不猜
  assert.equal(repairNumeral('二十零五'), null);
  assert.deepEqual(repairNumeral('十十'), { text: '十', value: 10 });
});
