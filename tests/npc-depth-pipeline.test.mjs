import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {loadWorld} from '../tools/load-world.mjs';
import {auditNpcDepth} from '../tools/audit-npc-depth.mjs';
import {hashContent,runContentPipeline} from '../tools/content-pipeline.mjs';
import {depthEntries,patchDraft,contextFor,buildDraftRequest,buildReviewRequest,extractDraft,validateDraft,applyDepthDraft,verifyUnchanged,validatePatchResults} from '../tools/npc-depth-content.mjs';
import {prepareDepth,depthOptions} from '../tools/npc-depth.mjs';
import {publishNpcDepth} from '../tools/publish-npc-depth.mjs';
const exec=promisify(execFile),world=await loadWorld(),tool=name=>path.resolve('tools',name+'.mjs');
const personId='npc_yp_qinli';
function fixtureWorld(){const w=structuredClone(world),n=w.npcs.find(n=>n.id===personId);n.notes='主持人不要让玩家凭空知道陶咨的家事。';n.opinions={neighbors:[{with:'npc_yp_gaoxin',view:'玩家不能因此知道高忻的家事。',weight:2},{with:'npc_yp_taozi',view:'陶咨曾在工坊核对桌位。',weight:3}],weather:'雨天沿檐下走'};return w;}
function designFor(w,changes){const before=w.npcs.find(n=>n.id===personId),issues=auditNpcDepth(w).issues.filter(i=>i.id===personId&&changes.some(p=>p.path===i.field));return{revision:'test-patch-v1',incrementLimitYuan:.2,patchRows:[{id:personId,before:structuredClone(before),baseHash:hashContent(before),issues:issues.map(({id,field,code})=>({id,field,code})),patches:changes}]};}
const notesPatch={path:'notes',value:'秦砺在工坊与高忻核对过桌位，未曾问陶咨家中的衣物归属。'},opinionPatch={path:'opinions.neighbors[0].view',value:'高忻曾与秦砺在工坊核对桌位，先后尚未商定。'};
function entriesFor(w,design){return depthEntries(design.patchRows.map(r=>r.before),design,w);}
async function temporary(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'npc-depth-pipeline-'));t.after(async()=>{assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(dir,{recursive:true,force:true});});return dir;}
async function prepared(t,patches=[notesPatch,opinionPatch]){const dir=await temporary(t),worldRoot=path.join(dir,'world'),w=fixtureWorld();for(const sub of ['meta','people','geo','lore'])await fs.cp(path.resolve('world',sub),path.join(worldRoot,sub),{recursive:true});await fs.writeFile(path.join(worldRoot,'people/baseline.json'),JSON.stringify(w.npcs));const root=path.join(worldRoot,'drafts/test'),design=path.join(worldRoot,'test-design.mjs'),config=designFor(w,patches);await fs.writeFile(design,'export const revision='+JSON.stringify(config.revision)+';\nexport const incrementLimitYuan=.2;\nexport const patchRows='+JSON.stringify(config.patchRows)+';\n');const result=await prepareDepth({design,root,worldRoot,batch:'test'});return{dir,worldRoot,root,design,config,...result};}
async function approve(p){const reviewRequests=[],client={spent:0,reserved:0,budgetYuan:0,generate:async request=>{const value=JSON.parse(request.messages[1].content);if(value.candidate)return{choices:[{message:{content:JSON.stringify(value.candidate)}}]};reviewRequests.push(value);return{choices:[{message:{content:JSON.stringify({contradictions:[]})}}]};}};const result=await runContentPipeline({entries:p.entries,root:p.root,budgetRoot:p.root,client,revision:p.config.revision,contextFor:e=>contextFor(e,p.world),buildDraftRequest,buildReviewRequest,extractDraft,validateDraft,concurrency:1,batchSize:25});const notes=result.results.map(r=>({id:r.id,note:'测试替身逐条核对所列叶子，与冻结原档比较。',draftHash:hashContent(r.draft),reviewHash:hashContent(r.review)})),file=path.join(p.root,'human-notes.json');await fs.writeFile(file,JSON.stringify(notes));await exec(process.execPath,[tool('npc-depth-l4'),'--design',p.design,'--root',p.root,'--notes',file]);return reviewRequests;}

test('意见或备注单字段修复保持十人已合格六类与全部原记忆，不要求sharedEvent',()=>{
 const w=fixtureWorld();for(const patch of [notesPatch,opinionPatch]){const [entry]=entriesFor(w,designFor(w,[patch])),draft=patchDraft(entry),after=applyDepthDraft(entry.before,draft);assert.deepEqual(validateDraft(draft,entry).errors,[]);verifyUnchanged(entry.before,after,entry);for(const field of ['voice','knowledge','relationships','goals','memorySeeds','coins','inventory','traits','skills','services'])assert.deepEqual(after[field],entry.before[field]);assert.equal(entry.sharedEvent,undefined);validatePatchResults([entry],w);}
});
test('实际审计逐叶子授权，拒绝合格邻居、with、traits、身份和任意顶层字段',()=>{
 const w=fixtureWorld();for(const patch of [{path:'opinions.neighbors[0].with',value:'npc_yp_taozi'},{path:'opinions.neighbors[1].view',value:'其他事实'},{path:'knowledge.known[0].fact',value:'其他事实'},{path:'traits[0]',value:'耐心'},{path:'age',value:20},{path:'voice.habits[0]',value:'其他声音'},{path:'notes',value:'新事实'}]){const design=designFor(w,[opinionPatch]);if(patch.path==='notes')design.patchRows[0].issues.push({id:personId,field:'notes',code:'known-shape'});design.patchRows[0].patches.push(patch);assert.throws(()=>entriesFor(w,design),/未报错|非实际/);}
});
test('拒绝删除、清空和数组删员，不以移除违规成员逃避审核',()=>{
 const w=fixtureWorld();for(const patch of [{path:'notes',value:''},{path:'notes',value:null},{path:'notes'},{path:'opinions.neighbors',value:[]},{path:'opinions.neighbors[0]',value:{view:'新事实'}},{path:'opinions',value:null}]){const design=designFor(w,[notesPatch,opinionPatch]);design.patchRows[0].patches=[patch];assert.throws(()=>entriesFor(w,design),/清空|置空|报错|deep-equal/);}
});
test('冻结before和baseHash，伪造issue或已达标traits不能借审计代码获得白名单',()=>{
 const w=fixtureWorld(),base=designFor(w,[notesPatch]);for(const change of [d=>d.patchRows[0].baseHash='old',d=>d.patchRows[0].before.age++,d=>d.patchRows[0].issues[0].field='traits',d=>d.patchRows[0].issues[0].id='npc_yp_gaoxin']){const design=structuredClone(base);change(design);assert.throws(()=>depthEntries([base.patchRows[0].before],design,w));}
});
test('L2正文覆盖每个实际修订叶子及旧值，不只审核共享记忆',async t=>{
 const p=await prepared(t),requests=await approve(p);assert.equal(requests.length,1);const context=requests[0].publishedFacts;for(const patch of [notesPatch,opinionPatch]){const revision=context.revisions.find(r=>r.path===patch.path);assert.ok(revision);assert.equal(revision.after,patch.value);assert.match(revision.before,/玩家|主持人/);}assert.deepEqual(requests[0].draft.patches,[notesPatch,opinionPatch]);assert.ok(context.localProblems.some(p=>p.stakeholders.some(s=>s.person===personId)));
});
test('prepare CLI 预算0、不依赖API密钥、不调用模型，可独立准备多村目录',async t=>{
 const p=await prepared(t),before=await fs.readFile(path.join(p.worldRoot,'people/baseline.json'),'utf8');
 const env={...process.env};delete env.DEEPSEEK_API_KEY;
 const args=[tool('npc-depth'),'--design',p.design,'--root',p.root,'--prepare'];const first=await exec(process.execPath,args,{cwd:p.dir,env});assert.equal(JSON.parse(first.stdout).modelCalls,0);assert.equal(JSON.parse(first.stdout).formalWrite,false);
 const secondRoot=path.join(p.worldRoot,'drafts/other-village');await exec(process.execPath,[tool('npc-depth'),'--design',p.design,'--root',secondRoot,'--prepare'],{cwd:p.dir,env});assert.equal(await fs.readFile(path.join(p.worldRoot,'people/baseline.json'),'utf8'),before);assert.equal(await fs.readFile(path.join(p.root,'base.json'),'utf8'),await fs.readFile(path.join(secondRoot,'base.json'),'utf8'));await assert.rejects(fs.stat(path.join(p.root,'budget.json')),/ENOENT/);
});
test('发布默认预演，正式发布保护原钱物、身份、技能、服务、记忆，重发零写入',async t=>{
 const p=await prepared(t);await approve(p);const file=path.join(p.worldRoot,'people/baseline.json'),rows=JSON.parse(await fs.readFile(file,'utf8')),person=rows.find(n=>n.id===personId);person.coins=9;person.inventory={item_bread:0};await fs.writeFile(file,JSON.stringify(rows));const before=await fs.readFile(file,'utf8'),manifest=path.join(p.root,'manifest.json');const preview=await publishNpcDepth({manifest});assert.deepEqual(preview.changed,['people/baseline.json']);assert.equal(await fs.readFile(file,'utf8'),before);await publishNpcDepth({manifest,publish:true});const after=JSON.parse(await fs.readFile(file,'utf8')).find(n=>n.id===personId);for(const field of ['age','identity','skills','services','memorySeeds','coins','inventory','traits'])assert.deepEqual(after[field],person[field]);const stat=await fs.stat(file);assert.deepEqual((await publishNpcDepth({manifest,publish:true})).changed,[]);assert.equal((await fs.stat(file)).mtimeMs,stat.mtimeMs);
});
test('候选、设计、正式原档、L2及L4指纹变动均拒绝写入',async t=>{
 const p=await prepared(t);await approve(p);const file=path.join(p.worldRoot,'people/baseline.json'),before=await fs.readFile(file,'utf8'),manifest=path.join(p.root,'manifest.json');
 for(const [relative,change] of [['candidate.json',v=>v[0].patches[0].value='未审核事实'],[personId+'.json',v=>v.review.contradictions.push({field:'notes',quote:'矛盾',reason:'未审核事实',severity:'hard'})],['batch-0.json',v=>v.l4.notes[0].draftHash='tampered'],['manifest.json',v=>v.foundationHash='stale']]){const recordFile=path.join(p.root,relative),saved=await fs.readFile(recordFile,'utf8'),value=JSON.parse(saved);change(value);await fs.writeFile(recordFile,JSON.stringify(value));await assert.rejects(publishNpcDepth({manifest,publish:true}));assert.equal(await fs.readFile(file,'utf8'),before);await fs.writeFile(recordFile,saved);}
 const rows=JSON.parse(before);rows.find(n=>n.id===personId).age++;await fs.writeFile(file,JSON.stringify(rows));await assert.rejects(publishNpcDepth({manifest,publish:true}),/原档已过期/);await fs.writeFile(file,before);
 const saved=await fs.readFile(p.design,'utf8');await fs.writeFile(p.design,saved.replace(notesPatch.value,'另一条尚未审核事实'));await assert.rejects(publishNpcDepth({manifest,publish:true}),/指纹|骨架/);assert.equal(await fs.readFile(file,'utf8'),before);
});
test('缺失条目允许必要追加，合格已有事实叶子仍冻结',()=>{
 const w=fixtureWorld(),n=w.npcs.find(n=>n.id===personId);n.knowledge.known=n.knowledge.known.slice(0,1);const before=structuredClone(n),issues=auditNpcDepth(w).issues.filter(i=>i.id===personId&&i.code==='known-count'),patches=[{path:'knowledge.known[1]',value:{fact:'高忻与秦砺在工坊核对桌位。',source:'npc_yp_gaoxin',reliability:'亲历'}},{path:'knowledge.known[2]',value:{fact:'秦砺曾在议事屋门前搬桌。',source:personId,reliability:'亲历'}}],design={revision:'missing',patchRows:[{id:personId,before,baseHash:hashContent(before),issues,patches}]};const entries=entriesFor(w,design);validatePatchResults(entries,w);assert.deepEqual(entries[0].facts.knowledge.known[0],before.knowledge.known[0]);const over=structuredClone(design);over.patchRows[0].patches.push({path:'knowledge.known[3]',value:patches[1].value});assert.throws(()=>entriesFor(w,over),/未报错/);
});
test('known-shape只开放真正不合格的子字段，目标补步骤保留目标与进展',()=>{
 const w=fixtureWorld(),n=w.npcs.find(n=>n.id===personId);n.knowledge.known[0].fact='待补充';n.goals.short[0].steps=[];const before=structuredClone(n),audit=auditNpcDepth(w).issues,issues=audit.filter(i=>i.id===personId&&['known-shape','goal-steps'].includes(i.code)),design={revision:'shape',patchRows:[{id:personId,before,baseHash:hashContent(before),issues,patches:[{path:'knowledge.known[0].fact',value:'秦砺与高忻曾在工坊核对桌位。'},{path:'goals.short[0].steps[0]',value:{content:'到工坊核对空桌位置',status:'pending'}}]}]};const entries=entriesFor(w,design);validatePatchResults(entries,w);assert.equal(entries[0].facts.goals.short[0].content,before.goals.short[0].content);assert.equal(entries[0].facts.goals.short[0].progress,before.goals.short[0].progress);const bad=structuredClone(design);bad.patchRows[0].patches.push({path:'knowledge.known[0].source',value:'npc_yp_gaoxin'});assert.throws(()=>entriesFor(w,bad),/未报错/);
});
test('旧记忆措辞修订仅修改event，保留id、knownBy、地点和所有旧历史',()=>{
 const w=fixtureWorld(),n=w.npcs.find(n=>n.id===personId);n.memorySeeds[0].event='主持人不要让玩家知道另一人的秘密。';const patch={path:'memorySeeds[0].event',value:'秦砺曾在工坊核对桌位，旁边没有陶咨。'},design=designFor(w,[patch]),[entry]=entriesFor(w,design),after=applyDepthDraft(entry.before,patchDraft(entry));assert.equal(after.memorySeeds.length,entry.before.memorySeeds.length);const {event,...old}=entry.before.memorySeeds[0],{event:next,...rest}=after.memorySeeds[0];assert.deepEqual(rest,old);assert.deepEqual(after.memorySeeds.slice(1),entry.before.memorySeeds.slice(1));
});
test('实际共享记忆缺口允许双方追加同一亲历，保留旧记忆且不传播秘密',()=>{
 const w=fixtureWorld(),ids=[personId,'npc_yp_gaoxin'];
 for(const id of ids){const n=w.npcs.find(n=>n.id===id);n.memorySeeds=n.memorySeeds.filter(m=>m.knownBy.length===1);}
 const issues=auditNpcDepth(w).issues,shared={id:'test-table-check',event:'秦砺与高忻在工坊核对桌位，先后尚未商定。',location:'bld_yp_yard',knownBy:ids};
 const config={revision:'shared-missing',patchRows:ids.map(id=>{const before=structuredClone(w.npcs.find(n=>n.id===id));return{id,before,baseHash:hashContent(before),issues:issues.filter(i=>i.id===id&&i.code==='memory-shared'&&i.field==='memorySeeds'),patches:[{path:`memorySeeds[${before.memorySeeds.length}]`,value:shared}]};})};
 const entries=entriesFor(w,config);validatePatchResults(entries,w);
 for(const e of entries){assert.deepEqual(e.facts.memorySeeds.slice(0,-1),e.before.memorySeeds);assert.deepEqual(e.facts.secrets,e.before.secrets);assert.deepEqual(e.facts.knowledge,e.before.knowledge);}
 const bad=structuredClone(entries);bad[1].facts.memorySeeds.at(-1).event='秦砺与高忻已经商定桌位先后。';assert.throws(()=>validatePatchResults(bad,w),/缺口/);
});
test('发布清单迁移到另一world目录后有效，无关新增人物不使审核过期',async t=>{
 const p=await prepared(t);await approve(p);const moved=path.join(p.dir,'merged-world');await fs.cp(p.worldRoot,moved,{recursive:true});
 const file=path.join(moved,'people/baseline.json'),rows=JSON.parse(await fs.readFile(file,'utf8'));rows.push({id:'npc_unrelated_new',name:'远村新邻',tier:'roster',traits:['稳重']});await fs.writeFile(file,JSON.stringify(rows));
 const result=await publishNpcDepth({manifest:path.join(moved,'drafts/test/manifest.json'),publish:true});assert.deepEqual(result.changed,['people/baseline.json']);assert.equal(JSON.parse(await fs.readFile(file,'utf8')).find(n=>n.id===personId).notes,notesPatch.value);
});
test('CLI帮助和参数检测说明设计、预算、候选目录与预演发布',async()=>{
 for(const name of ['npc-depth','npc-depth-review','npc-depth-l4','publish-npc-depth']){const {stdout}=await exec(process.execPath,[tool(name),'--help']);assert.match(stdout,name==='publish-npc-depth'?/--manifest.*--publish/:/--design/);}
 assert.throws(()=>depthOptions(['--design']),/缺少参数/);assert.equal(depthOptions(['--root','world/drafts/custom','--budget-root','world/drafts/budget']).root,path.resolve('world/drafts/custom'));
 const recover=depthOptions(['--card','T06','--recover-protocol','npc_yp_zhaofeng,npc_yp_other']);assert.equal(recover.cardId,'T06');assert.deepEqual(recover.protocolRecoveryIds,['npc_yp_zhaofeng','npc_yp_other']);assert.throws(()=>depthOptions(['--recover-protocol']),/缺少参数/);
 const {stdout}=await exec(process.execPath,[tool('npc-depth'),'--help']);assert.match(stdout,/--card/);assert.match(stdout,/--recover-protocol/);
});
