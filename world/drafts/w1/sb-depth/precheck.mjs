// Zero-model source comparison. These records are not L2/L4 approval credentials.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {loadWorld} from '../../../../tools/load-world.mjs';
import {hashContent} from '../../../../tools/content-pipeline.mjs';
import {auditNpcDepth} from '../../../../tools/audit-npc-depth.mjs';
import {depthEntries,patchDraft,getPath,validatePatchResults} from '../../../../tools/npc-depth-content.mjs';
import {depthFoundation} from '../../../../tools/npc-depth.mjs';
import {sangbanFull,sangbanRoster} from '../../../design/w1-villages-sangban.mjs';

const root='world/drafts/w1/sb-depth',archive=root+'/offline-v1-evidence',design='world/design/w1-sb-depth.mjs';
const rawHash=value=>crypto.createHash('sha256').update(value).digest('hex');
const write=(file,value)=>fs.writeFile(file,JSON.stringify(value,null,2)+'\n');
const read=file=>fs.readFile(file,'utf8');
const previousRevision='w1-sb-depth-v1',revision='w1-sb-depth-v2-offline-precheck';
const c=await import(pathToFileURL(path.resolve(design)).href+'?hash='+rawHash(await read(design)));
if(c.revision===revision){assert.equal(JSON.parse(await read(root+'/author-precheck.json')).revision,revision);console.log('作者预检已保存；不覆盖原始证据或重复修订。');process.exit(0);}
assert.equal(c.revision,previousRevision);
await fs.mkdir(archive,{recursive:true});
const files=[['design.mjs.txt',design],['test.mjs.txt','tests/npc-depth-sb.test.mjs'],...['author.mjs','README.md','base.json','candidate.json','foundation.json','manifest.json','offline-audit.json','source-evidence.json'].map(f=>[f,root+'/'+f])];
const snapshots=[];
for(const [name,file] of files){
 const raw=await fs.readFile(file),target=archive+'/'+name;
 try{assert.equal(rawHash(await fs.readFile(target)),rawHash(raw),'已有原产物副本不匹配');}
 catch(error){if(error.code!=='ENOENT')throw error;await fs.writeFile(target,raw,{flag:'wx'});}
 const originalEol=raw.toString('utf8').includes('\r\n')?'CRLF':'LF';
 assert.ok(originalEol==='LF'||!raw.toString('utf8').replaceAll('\r\n','').includes('\n'),'混合换行须另存原始字节');
 snapshots.push({path:file,rawPath:target,bytes:raw.length,sha256:rawHash(raw),originalEol,...(file.endsWith('.json')?{contentHash:hashContent(JSON.parse(raw.toString('utf8')))}:{})});
}
const corrections=[
 ['npc_sb_zhonglan','goals.mid[0].steps[0].content','翻检后把每堆里层仍潮的位置分别记下，再请接料人核对记录指的是哪一堆。','原中期目标是按堆记录翻检位置；旧步骤只展示状态，遗漏记录。'],
 ['npc_sb_gaoshu','goals.mid[0].steps[0].content','等织架空下时逐处查看接合，把使用者说过的异响位置和检看处对照。','原中期目标要求空机逐处看接合；旧步骤只比较动作描述与结果。'],
 ['npc_sb_jiean','goals.mid[0].steps[0].content','待木架空下后请使用者指出湿盆惯常朝哪边摆，再沿对应架脚核对磨痕。','原中期目标是让使用者说明摆盆方向；旧步骤转向调整摆法。'],
 ['npc_sb_feiqing','goals.mid[0].steps[0].content','请物主在旁一起看松动横档，问清可用的标记方式，经物主同意后当面标出需停用的位置。','原中期目标是当物主面标出松档；旧步骤没有实施标记的行动，并把标记作为已有状态。'],
 ['npc_sb_feiqing','goals.long[0].steps[0].content','与物主约清坏梯停用的标记，让问借的人先看到停用原因，复查前不安排转借。','原长期目标要求坏梯有标记且不转借；旧步骤只是转达借用请求，遗漏停借边界。'],
 ['npc_sb_zhuxian','goals.mid[0].steps[0].content','请搬板人一起选只供暂放的空处，再把修好与待修木板的暂放边界说明给下一道工序的人。','原中期目标是划分暂放空位；旧步骤直接说明已存在边界，缺少划分动作。'],
 ['npc_sb_quanli','goals.short[0].steps[0].content','到原路记处查明遮挡的垂枝，先向园主问清可整理的范围，再说明尚可辨认的转弯点。','原短期问题是垂枝遮住路记；旧步骤只有一般指路，未检查本次遮挡。'],
 ['npc_sb_zhuxian','relationships[1].note','毕祺与诸弦同住诸弦户居处，在家中见面；丈夫曾错骂人，毕祺夹在中间，觉得应当有个说法。','名册旧摘要仍写不好意思道歉；正式memorySeeds及authoredFacts.memories已经记录找到实际搬动者后道歉。保留错骂造成的家庭牵连，移除当前未道歉暗示。'],
];
const world=await loadWorld(),original=c.patchRows,rows=structuredClone(original),people=new Map([...world.npcs,...world.residents].map(n=>[n.id,n]));
const roster=new Map(sangbanRoster.trim().split('\n').map(line=>{const fields=line.split('|');return ['npc_sb_'+fields[1],fields];}));
const full=new Map(sangbanFull.trim().split('\n').map(line=>{const fields=line.split('|');return ['npc_sb_'+fields[0],fields];}));
const changes=corrections.map(([id,field,after,reason])=>{
 const row=rows.find(r=>r.id===id),patch=row.patches.find(p=>p.path===field);assert.ok(patch);
 const issue=row.issues.find(i=>i.field===field);assert.ok(issue,'必须有原审计叶子许可');
 const before=patch.value;patch.value=after;
 return {id,field,before,after,reason,issue,baseHash:row.baseHash,beforeHash:hashContent(before),afterHash:hashContent(after),source:{id,path:field.startsWith('goals.')?field.replace(/\.steps\[0\]\.content$/,'.content'):'memorySeeds',value:getPath(row.before,field.startsWith('goals.')?field.replace(/\.steps\[0\]\.content$/,'.content'):'memorySeeds')}};
});
for(const row of rows){assert.deepEqual(row.before,people.get(row.id),'正式桑坂原档改变');assert.equal(row.baseHash,hashContent(row.before));}
const entries=depthEntries(rows.map(r=>r.before),{revision,patchRows:rows},world),merged=validatePatchResults(entries,world);
assert.deepEqual(auditNpcDepth(merged).issues.filter(i=>i.id.startsWith('npc_sb_')),[]);

// Every new relationship note is checked against the actual Sangban columns,
// original household registration and the formal person's name/sex.
const relationshipChecks=original.flatMap(row=>row.patches.filter(p=>/^relationships\[\d+\]\.note$/.test(p.path)).map(p=>{
 const index=Number(p.path.match(/\[(\d+)\]/)[1]),relation=row.before.relationships[index],other=people.get(relation.with),fields=roster.get(relation.with),changed=changes.find(x=>x.id===row.id&&x.field===p.path);
 const expected=fields?`${other.name}与${row.before.name}同住${world.locations.find(l=>l.id===row.before.home.location).name}，在家中见面；${fields[7]}。`:`${row.before.name}在桑坂村的日常往来中见过${other.name}，认得这位同村住户。`;
 assert.equal(p.value,expected);if(fields){assert.equal(fields[2],other.name);assert.ok(row.before.household.includes(other.id));assert.equal(other.home.location,row.before.home.location);}
 const retainedQuote=fields?.[7]??relation.note;
 return {id:row.id,path:p.path,with:other.id,name:other.name,sex:other.sex,originalRelation:relation,source:{kind:fields?'original-roster-concern-and-household':'original-same-village-relationship',field:fields?'sangbanRoster[7]':'relationships['+index+'].note',traits:fields?.[6],quote:retainedQuote,hash:hashContent(retainedQuote),formalConcern:other.currentConcern??null,formalMemory:changed?row.before.memorySeeds:null},candidateBefore:p.value,candidateAfter:rows.find(r=>r.id===row.id).patches.find(x=>x.path===p.path).value,decision:changed?'revised-temporal-conflict':'retained-after-author-source-comparison',pronounCheck:'姓名和有代词的原烦恼按正式身份逐项比对；无通用固定男性代词',risk:fields?'同住见面是日常关系概括，不当作具体新共同事件证据。':'认识同村只支持相认关系，不支持职业、秘密或具体见面日期。'};
}));
const goalChecks=original.flatMap(row=>['short','mid','long'].map(term=>{
 const field=`goals.${term}[0].steps[0].content`,old=row.patches.find(p=>p.path===field),changed=changes.find(x=>x.id===row.id&&x.field===field),goal=row.before.goals[term][0];
 assert.equal(row.before.goals[term][0].content,full.get(row.id)[{short:10,mid:11,long:12}[term]]);
 return {id:row.id,path:field,source:{goal,authorRow:{id:row.id,occupation:full.get(row.id)[3],goalIndex:{short:10,mid:11,long:12}[term],goal:full.get(row.id)[{short:10,mid:11,long:12}[term]]},formalWorkplace:row.before.workplace,formalMemories:row.before.memorySeeds},candidateBefore:old.value,candidateAfter:rows.find(r=>r.id===row.id).patches.find(x=>x.path===field).value,decision:changed?'revised-goal-deviation':'retained-pending-action-compatible-with-source-goal',reason:changed?.reason??'步骤为问人、检查、记录或说明的待办，作用于该原目标；保留progress与pending，不当作新完成事实。'};
}));
const archivedSource=JSON.parse(await read(archive+'/source-evidence.json'));
const backgrounds=archivedSource.sharedEvents.map(event=>{
 const sourceRefs=event.sourceRecords.flatMap(person=>{
  const row=original.find(r=>r.id===person.id);
  return ['socialProfile.conflicts','relationships'].filter(field=>getPath(row.before,field)!==undefined).map(field=>({file:'people/baseline.json',id:person.id,field,value:getPath(row.before,field),contentHash:hashContent(getPath(row.before,field))}));
 });
 const problems=world.settlementProfiles.flatMap(s=>(s.details?.problems??[]).flatMap((p,i)=>p.stakeholders.some(p=>event.knownBy.includes(p.person))?[{file:'geo/settlements.json',id:s.id,problemId:p.id,field:`details.problems[${i}]`,value:p,contentHash:hashContent(p)}]:[]));
 const location=world.locations.find(l=>l.id===event.location);assert.ok(location);
 const placeRef={file:'geo/locations.json',id:location.id,field:'name',value:location.name,contentHash:hashContent(location.name)};
 const publicStatements=event.sourceRecords.filter(p=>p.socialProfile?.conflicts).map(p=>({person:p.id,issue:p.socialProfile.conflicts[0].issue,position:p.socialProfile.conflicts[0].position}));
 return {id:event.id,classification:'new-authored-public-background',oldSameEventExplicitlySupported:false,participants:event.knownBy,location:event.location,candidateEvent:event.event,status:'past-but-unresolved-proposal-awaiting-T25-opt-in',knownByUnchanged:true,sourceRefs:[...problems,...sourceRefs,placeRef],sourceFactsScope:problems.length?'已发布public地方问题的各方立场':'原社会冲突或认识同村的关系；不默认为已公开完整私有档',proposedPublicDisclosure:publicStatements.length?publicStatements:event.knownBy.map(person=>({person,statement:'相互招呼并认得同村住户，不涉及职业或私事'})),newFacts:['具体共同在场地点','本次过去的交谈或招呼','所列内容被当事人听到'],notEstablished:['原档没有明确记录该同事件','来源包本身不是审核凭证','尚未授权T25 opt-in或完成其独立L2/L4'],forbiddenResults:['尚未商定的解法不得写成已同意或已实施','不带入钱物、库存、技能、交易或私密事实','其他新增候选不得作为来源'],affectedLeaves:event.knownBy.flatMap(id=>[{id,path:'knowledge.known[2].fact'},{id,path:`memorySeeds[${original.find(r=>r.id===id).before.memorySeeds.length}].event`}])};
});
const leafClassifications=rows.flatMap(row=>row.patches.map(p=>({id:row.id,path:p.path,valueHash:hashContent(p.value),classification:p.path==='knowledge.known[1]'?'existing-explicit-personal-memory':p.path==='knowledge.known[2]'||p.path.startsWith('memorySeeds[')?'new-authored-public-background':p.path.startsWith('goals.')?'pending-plan-from-original-goal':p.path.startsWith('relationships[')?'original-relation-and-household-summary':p.path.startsWith('knowledge.unknown')?'unanswered-specific-question':p.path==='voice.register'?'expression-from-original-voice-and-personality':'original-fact-rule-wording-repair',approval:'unreviewed-L2-L4'})));
let designText=await read(design);
for(const change of changes){const before=JSON.stringify(change.before),after=JSON.stringify(change.after);assert.equal(designText.split(before).length-1,1);designText=designText.replace(before,after);}
designText=designText.replace(`revision='${previousRevision}'`,`revision='${revision}'`);
const foundation=depthFoundation(entries,world,revision),candidate=entries.map(patchDraft),manifest=JSON.parse(await read(root+'/manifest.json'));
manifest.foundationHash=hashContent(foundation);
const report={stage:'offline-author-source-precheck-not-L4-approval',revision,previousRevision,oldCommit:'9d295b4',modelCalls:0,budgetWritten:false,people:30,cohortSizes:c.cohorts.map(c=>c.participants.length),snapshots,changes,reviewScope:{relationshipNotes:relationshipChecks.length,goalSteps:goalChecks.length,leafClassifications:leafClassifications.length,formalNameSexAndPronouns:'已对照桑坂原名册和正式人物；固定他指女性未发现',originalRosterLayout:{fields:['户号','slug','姓名','年龄性别','关系','职业','traits','concern','外观'],traitsIndex:6,concernIndex:7},scopeBoundary:'作者逐源预检，未执行公共正式L4批准入口或付费L2；所有新背景待T25显式opt-in'},backgroundCounts:{existingExplicitSharedEvents:0,newAuthoredPublicBackground:backgrounds.length},remainingRisks:['15条新设计背景需独立L2/L4，原社会冲突与关系不证明具体共同在场','79条家庭烦恼概括需按来源读取；不把他人currentConcern或secrets全量公开','新版本只更改8个已获原audit许可叶，365个正确兄弟补丁及base保持不变'],mergedIssues:auditNpcDepth(merged).issues.filter(i=>i.id.startsWith('npc_sb_')),hashes:{base:hashContent(rows.map(r=>r.before)),candidate:hashContent(candidate),foundation:hashContent(foundation),sourceEvidence:rawHash(await fs.readFile(root+'/source-evidence.json'))},approvals:{L2:'not-run',L4:'not-approved',T25OptIn:false,publication:'not-run'}};
// All validation and archive writes completed before replacing operative offline artifacts.
await fs.writeFile(design,designText);
await write(root+'/candidate.json',candidate);await write(root+'/foundation.json',foundation);await write(root+'/manifest.json',manifest);
await write(root+'/author-precheck.json',report);
await write(root+'/source-classification.json',{stage:report.stage,revision,modelCalls:0,T25OptIn:false,backgrounds,leafClassifications});
await write(root+'/source-reading-packets.json',{stage:report.stage,revision,modelCalls:0,relationshipChecks,goalChecks});
await write(root+'/offline-audit.json',{stage:'offline-authored-awaiting-L2-L4',revision,modelCalls:0,formalWrite:false,people:30,cohortSizes:report.cohortSizes,frozenIssues:rows.flatMap(r=>r.issues).length,patches:leafClassifications.length,mergedIssues:report.mergedIssues,legacyTraitsRetained:auditNpcDepth(merged).legacyTraits.ok,baseHash:report.hashes.base,candidateHash:report.hashes.candidate,foundationHash:report.hashes.foundation,pending:['T25显式opt-in及新背景独立审核','真实L2事实审核','正式L4批准','统一正式发布']});
console.log(JSON.stringify({people:30,changes:changes.length,relationshipNotes:relationshipChecks.length,goalSteps:goalChecks.length,backgrounds:backgrounds.length,modelCalls:0,mergedIssues:report.mergedIssues.length}));
