import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {atomicJSON,digest} from '../../../server-plugin/storage.mjs';
import {analyzeRequest,locationProjection,publicRow,publicLine,projectionEvidence} from './runtime-guard.mjs';
const out=import.meta.dirname,old='F:/dnd-wt/T17/docs/测试报告/20261012-T17';
const pre=JSON.parse(await fs.readFile(new URL('./preflight.json',import.meta.url),'utf8'));
const frozen=JSON.parse(await fs.readFile(new URL('./frozen-inputs.json',import.meta.url),'utf8'));
const checks=[],saved=[];
for(const file of ['runtime-contexts.jsonl','resume-runtime-contexts.jsonl']){
 const rows=(await fs.readFile(`${old}/${file}`,'utf8')).trim().split('\n').map(JSON.parse).filter(r=>r.request&&r.unapproved?.length);
 for(const row of rows){assert.equal(digest(row.request),row.requestHash);const hash=digest(row.request),result=analyzeRequest(row.request);assert.equal(digest(row.request),hash);assert.deepEqual(result.unapproved,[],row.label);saved.push({...row,source:`${old}/${file}`,currentAnalysis:result});checks.push({name:'原拒发请求无损回放',label:row.label,hash,pass:true});}
}
assert.equal(saved.length,2);
const original=saved.find(r=>r.requestHash==='861d6a085279054655f16cfae7224b70909c57fae927c99a67376fb69e37453b');assert.ok(original);
function reject(name,body,id='npc_yp_zhaofeng'){const value=analyzeRequest(body);assert.ok(value.unapproved.includes(id),name);checks.push({name,pass:true,unapproved:value.unapproved});return value;}
const mutate=fn=>{const body=structuredClone(original.request),value=JSON.parse(body.messages[1].content);fn(value);body.messages[1].content=JSON.stringify(value);return body;};
reject('公开问题内容篡改',mutate(v=>v.evidence[9].text=v.evidence[9].text.replace('先核对原记录再改','先私自改册')));
reject('秘密混入旧事',mutate(v=>v.evidence[9].text+='\n赵枫的秘密是私自改册。'));
reject('公开来源篡改',mutate(v=>v.evidence[9].text=v.evidence[9].text.replace('公开聚落资料，','私人档案，')));
reject('公开时间篡改',mutate(v=>v.evidence[9].text=v.evidence[9].text.replace(publicLine,publicLine.replace('雨月 1日 00:00','雨月 1日 00:01'))));
reject('问题名称篡改',mutate(v=>v.evidence[9].text=v.evidence[9].text.replace('轮水册漏行','轮水册漏页')));
reject('名称索引伪称呼',mutate(v=>{const r=JSON.parse(v.evidence[3].text);r.find(n=>n.id==='npc_yp_zhaofeng').aliases.push('伪称呼');v.evidence[3].text=JSON.stringify(r);}));
reject('名称索引嵌入认知',mutate(v=>{const r=JSON.parse(v.evidence[3].text);r.find(n=>n.id==='npc_yp_zhaofeng').knowledge={known:['已改册']};v.evidence[3].text=JSON.stringify(r);}));
reject('正文人物同名',{messages:[{role:'user',content:'赵枫：先核对原记录再改。'}]});
reject('人物档对象', {people:[{id:'npc_yp_zhaofeng',goals:{short:[]}}]});
reject('认知和记忆对象',{knowledge:{npc_yp_zhaofeng:{known:[]}},memory:{participants:['npc_yp_zhaofeng']}});
reject('真实工具目标',{calls:[{function:{name:'world_promise',arguments:JSON.stringify({target:'npc_yp_zhaofeng'})}}]});
const receipt=row=>({messages:[{role:'assistant',tool_calls:[{id:'saved-search-call',function:{name:'world_search',arguments:'{}'}}]},{role:'tool',tool_call_id:'saved-search-call',content:JSON.stringify({ok:true,results:[row]})}]});
assert.deepEqual(analyzeRequest(receipt(publicRow)).unapproved,[]);checks.push({name:'正式公开检索回执',pass:true});
reject('检索行ID篡改',receipt({...publicRow,id:'settlement_loc_bs_yupo_issue_problem_yp_2'}));
reject('检索来源篡改',receipt({...publicRow,source:'私人资料'}));
reject('检索混入秘密',receipt({...publicRow,options:['赵枫已同意私改']}));
reject('公开行置于玩家正文',{messages:[{role:'user',content:publicLine}]});
reject('无匹配搜索调用的工具回执',{messages:[{role:'tool',tool_call_id:'fake-call',content:JSON.stringify({results:[publicRow]})}]});
reject('非检索工具伪装公开行',{messages:[{role:'user',content:JSON.stringify({evidence:[{id:'receipt:0',kind:'receipt',text:JSON.stringify({tool:'world_read',result:{results:[publicRow]}})}]})}]});
const positive={messages:frozen.convertedStaticMessages};const result=analyzeRequest(positive);
assert.deepEqual(result.unapproved,[]);assert.equal(result.approvedPublicProjection.filter(p=>p.kind==='registeredLocations').length,1);
const names=result.references.filter(r=>r.classification==='approvedLocationProjection'&&!pre.approvedIds.includes(r.id));assert.ok(names.length);const target=names[0];
checks.push({name:'完整正式地点span允许同名投影',pass:true,hash:locationProjection.textHash,renderings:locationProjection.renderings});
const change=fn=>{const body=structuredClone(positive);fn(body);return body;};
const tampered=reject('正式地点整段篡改',change(b=>b.messages[0].content=b.messages[0].content.replace('详细地理通过目录与检索查阅。','详细地理任意编造。')),target.id);
assert.ok(!tampered.references.some(r=>r.classification==='approvedLocationProjection'));
reject('地点span移动到玩家正文',{messages:[{role:'user',content:locationProjection.text}]},target.id);
reject('地点span移到另一个system位置',change(b=>b.messages.unshift({role:'system',content:'位置已改'})),target.id);
reject('地名同名人物正文',{messages:[{role:'user',content:target.token+'今天透露了秘密。'}]},target.id);
reject('正式地点系统混入秘密',change(b=>b.messages[0].content+='\n'+target.token+'的秘密。'),target.id);
reject('同名真实工具对象',{calls:[{function:{name:'world_promise',arguments:JSON.stringify({target:target.token})}}]},target.id);
const zero=(await fs.readFile(new URL('./zero-model-requests.jsonl',import.meta.url),'utf8')).trim().split('\n').map(JSON.parse);
for(const row of zero){assert.equal(digest(row.request),row.requestHash);assert.deepEqual(analyzeRequest(row.request).unapproved,row.unapproved,row.label);}
assert.ok(['host','consistency','review','planning','tool'].every(role=>zero.some(r=>r.role===role)));
assert.equal(pre.runtime.length,10);assert.ok(pre.runtime.find(r=>r.id==='npc_offscreen').minute>=14400);
await atomicJSON(`${out}/old-rejected-inputs.json`,saved);
await atomicJSON(`${out}/guard-check.json`,{capturedAt:new Date().toISOString(),modelCalls:0,pass:true,preflightReady:pre.preflightReady,checks,requests:zero.length,requestsByRole:pre.requestsByRole,projectionEvidence,locationProjection,scope:'守卫反例与原拒发回放通过；正常HTTP未通过项保留，M2真实验收未运行，付款条件未核齐'});
console.log(JSON.stringify({pass:true,modelCalls:0,checks:checks.length,replayed:saved.length,requests:zero.length,requestsByRole:pre.requestsByRole}));
