import test from 'node:test';
import assert from 'node:assert/strict';
import {groupHistory,planHistoryWindow} from '../extension/history-window.mjs';
const messages=count=>Array.from({length:count},(_,i)=>[{role:'user',content:`问题${i}`,anchor:`turn-${i}`},{role:'assistant',content:`回应${i}`}]).flat();
const group=rows=>groupHistory(rows,{format:'api',tokenCounts:rows.map(()=>100)});
const coverage=groups=>({reference:{sequence:groups.length},anchors:Object.fromEntries(groups.filter(g=>g.anchor).map(g=>[g.anchor,{processed:true,indexed:true,complete:true,fingerprint:g.fingerprint}]))});
const plan=(groups,options={})=>planHistoryWindow(groups,{contextTokens:4200,reservedTokens:200,coverage:coverage(groups),...options});

test('预算接近上限才一次裁掉最旧约三成，后续小量追加不逐轮移动前缀',async()=>{
 const rows=messages(20),copy=structuredClone(rows),groups=await group(rows),first=plan(groups);
 assert.equal(first.reason,'batch-trimmed');assert.deepEqual(first.batch.anchors,['turn-0','turn-1','turn-2','turn-3','turn-4','turn-5']);assert.equal(first.afterTokens,3000);assert.equal(first.messages[0].anchor,'turn-6');assert.deepEqual(rows,copy);
 const next=await group(messages(21)),second=plan(next,{cursor:first.cursor});
 assert.equal(second.reason,'stable');assert.equal(second.batch,null);assert.equal(second.messages[0].anchor,'turn-6');assert.equal(second.cursor.batches,1);
});
test('缺编年史、原文索引或匹配摘要时不裁，不会跳过中间缺口',async()=>{
 const groups=await group(messages(20));
 for(const field of ['processed','indexed','complete','fingerprint']){
  const proof=coverage(groups);proof.anchors['turn-3'][field]=false;
  const result=plan(groups,{coverage:proof});assert.equal(result.reason,'coverage-required');assert.equal(result.removed.length,0);assert.equal(result.messages.length,40);
 }
 const blocked=plan(groups,{contextTokens:3500,coverage:null});assert.equal(blocked.canSend,false);assert.equal(blocked.needsCoverage,true);
});
test('正文编辑、撤销和摘要改变会撤销旧游标，不继承已经无效的裁剪',async()=>{
 const groups=await group(messages(20)),initial=plan(groups),edited=messages(20);edited[3].content='修正后的旧事';
 const newGroups=await group(edited),result=plan(newGroups,{cursor:initial.cursor,coverage:coverage(groups)});
 assert.equal(result.reset,true);assert.equal(result.removed.length,0);
 const deleted=await group(messages(20).slice(2)),proof=coverage(deleted),after=plan(deleted,{cursor:initial.cursor,coverage:proof});assert.equal(after.reset,true);assert.ok(after.messages.every(message=>message.anchor!=='turn-0'));
});
test('保留最近八个回合及开场；未结束工具链、未完成回复和重复锚点不得裁剪',async()=>{
 const few=await group(messages(8));assert.equal(plan(few,{contextTokens:1000}).reason,'recent-history-protected');assert.equal(plan(few,{contextTokens:1000}).canSend,false);
 const raw=messages(20);raw.splice(1,0,{role:'assistant',tool_calls:[{id:'a',function:{name:'world_trade',arguments:'{}'}}]});
 const incomplete=await group(raw);assert.equal(incomplete[0].toolsComplete,false);assert.equal(plan(incomplete).removed.length,0);
 const complete=[{role:'assistant',content:'开场'},...messages(20)],groups=await group(complete),trim=plan(groups);assert.equal(trim.messages[0].content,'开场');assert.ok(trim.retained.filter(g=>!g.opening).length>=8);
 const duplicate=messages(2);duplicate[2].anchor='turn-0';await assert.rejects(group(duplicate),/重复/);
});
test('原生酒馆与 API 格式按同一锚点裁剪，工具调用和返回始终成组保留',async()=>{
 const api=messages(20);api.splice(1,0,{role:'assistant',tool_calls:[{id:'a',function:{name:'world_trade',arguments:'{}'}}]},{role:'tool',tool_call_id:'a',content:'{"ok":true}'});
 const grouped=await group(api);assert.equal(grouped[0].toolsComplete,true);const result=plan(grouped);assert.equal(result.messages.some(m=>m.tool_call_id==='a'),false);assert.equal(result.messages.some(m=>m.tool_calls?.some(c=>c.id==='a')),false);
 const host=messages(20).map(m=>({is_user:m.role==='user',mes:m.content,extra:m.anchor?{fields_anchor:m.anchor}:{}}));
 const native=await groupHistory(host,{format:'host',tokenCounts:host.map(()=>100)});assert.deepEqual(plan(native).removed.map(g=>g.anchor),plan(await group(messages(20))).removed.map(g=>g.anchor));
});
test('分组必须使用有效逐条 token 计数，不把缺锚点或未登记旧历史默认为已归档',async()=>{
 await assert.rejects(groupHistory(messages(2),{format:'api',tokenCounts:[]}),/token/);
 const unanchored=messages(20).map(({anchor,...rest})=>rest),groups=await group(unanchored);assert.equal(plan(groups).removed.length,0);
 const withAnchors=await groupHistory(unanchored,{format:'api',anchors:Array.from({length:20},(_,i)=>`turn-${i}`),tokenCounts:unanchored.map(()=>100)});assert.equal(plan(withAnchors).removed.length,6);
});
