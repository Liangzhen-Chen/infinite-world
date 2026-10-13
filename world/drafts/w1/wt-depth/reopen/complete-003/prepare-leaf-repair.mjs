import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {sourceRepairOptions} from './prepare-source-repair.mjs';
import {prepareDepthRevision} from '../../../../../../tools/npc-depth.mjs';
import {hashContent} from '../../../../../../tools/content-pipeline.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const read=file=>fs.readFile(file,'utf8').then(JSON.parse);
const write=(name,data)=>fs.writeFile(path.join(here,name),JSON.stringify(data,null,2)+'\n');
export async function leafRepairOptions(){
 const parent=await sourceRepairOptions(),file=path.join(here,'leaf-repair-plan.json');
 return {...parent,budgetRoot:path.resolve('world/drafts/m4-object'),design:path.join(here,'leaf-repair-design.mjs'),controlledRevision:file,authorizationHash:hashContent(await read(file))};
}
export async function genderRepairOptions(){
 const parent=await leafRepairOptions(),file=path.join(here,'l4-gender-repair-plan.json');
 return {...parent,design:path.join(here,'l4-gender-repair-design.mjs'),controlledRevision:file,authorizationHash:hashContent(await read(file))};
}
if(process.argv.includes('--prepare-gender')){
 const options=await leafRepairOptions(),parent=await prepareDepthRevision(options),proof=await read(path.join(options.root,'incremental-proof.json'));
 const ids=['npc_wt_zhicai','npc_wt_xueying','npc_wt_shanju','npc_wt_peichun','npc_wt_xiangzhen'];
 const rows=parent.entries.map(({context,authoredBackground,facts,contract,...row})=>structuredClone(row)),invalidations=[];
 const originalPlan=await read((await sourceRepairOptions()).controlledRevision);
 const plan={...structuredClone(parent.plan),status:'actual-L4-gender-repair',previousPlanFile:path.relative(options.root,options.controlledRevision).replaceAll('\\','/'),previousPlanHash:options.authorizationHash,previousProofHash:hashContent(proof),authorized:[]};
 for(const id of ids){
  const entry=parent.entries.find(e=>e.id===id),row=rows.find(e=>e.id===id),field='opinions.neighbors[2].view',patch=row.patches.find(p=>p.path===field);
  const neighbor=parent.world.npcs.find(n=>n.id===entry.before.opinions.neighbors[2].with);
  assert.equal(neighbor.sex,'女');assert.ok(patch.value.includes('与他谈'));
  const record=await read(path.join(options.root,id+'.json')),item=structuredClone(originalPlan.authorized.find(a=>a.id===id));
  invalidations.push({id,draftHash:hashContent(record.draft),reviewHash:hashContent(record.review),operativeStatus:'invalidated-by-L4',findings:[{path:field,quote:patch.value,sourceId:neighbor.id,sourceSex:neighbor.sex,sourceHash:hashContent(neighbor.sex),reason:'实际通读：邻人正式sex为女，观点用“他”指代。'}]});
  patch.value=patch.value.replace('与他谈','与她谈');
  Object.assign(item,{recordHash:hashContent(record),draftHash:hashContent(record.draft),reviewHash:hashContent(record.review),paths:[field],sourceOnly:false,invalidationSources:[{path:field,collection:'npcs',id:neighbor.id,field:'sex',hash:hashContent(neighbor.sex)}]});
  plan.authorized.push(item);
 }
 const invalidation={records:invalidations};await write('l4-gender-invalidations.json',invalidation);
 plan.invalidationFile=path.relative(options.root,path.join(here,'l4-gender-invalidations.json')).replaceAll('\\','/');plan.invalidationHash=hashContent(invalidation);
 await write('l4-gender-repair-rows.json',rows);await write('l4-gender-repair-plan.json',plan);
 await fs.writeFile(path.join(here,'l4-gender-repair-design.mjs'),"import fs from 'node:fs';\nexport {revision,incrementLimitYuan} from './leaf-repair-design.mjs';\nexport const patchRows=JSON.parse(fs.readFileSync(new URL('./l4-gender-repair-rows.json',import.meta.url),'utf8'));\n");
 const prepared=await prepareDepthRevision(await genderRepairOptions());
 for(const entry of prepared.entries)if(!ids.includes(entry.id))assert.deepEqual(entry,parent.entries.find(e=>e.id===entry.id));
 console.log(JSON.stringify({changes:prepared.revision.changes.map(c=>({id:c.id,path:c.path})),modelCalls:0}));
}
if(process.argv.includes('--prepare')){
 const options=await sourceRepairOptions(),parent=await prepareDepthRevision(options),proof=await read(path.join(options.root,'incremental-proof.json'));
 const edits={
  npc_wt_dingsu:{'opinions.neighbors[2].view':'茹芹在苇席收边屋做席料软硬挑选人；与她谈通行和劳作时，我会先问清当日安排。'},
  npc_wt_gonglu:{'opinions.neighbors[2].view':'景遥在汀口记事屋做岸景描图学工；与她谈通行和劳作时，我会先问清当日安排。'},
  npc_wt_fanshui:{'relationships[0].note':'范柳是我的女儿；我需先问她何时出工，再与她商量整理旧垫时能谈多久，时间尚未约定。','relationships[1].note':'解芷是我的外孙女；我需先问她何时回屋温书，再商量听旧事的时间，尚未约定。'},
  npc_wt_quhuai:{'opinions.neighbors[2].view':'丁素在浅汀岸口做渔家杂活雇工；与她谈通行和劳作时，我会先问清当日安排。'},
  npc_wt_qilu:{'opinions.neighbors[2].view':'花茵在岸上菜圃做家用香草小圃照料人；与她谈通行和劳作时，我会先问清当日安排。'}
 };
 const rows=parent.entries.map(({context,authoredBackground,facts,contract,...row})=>structuredClone(row));
 for(const row of rows)for(const [field,value] of Object.entries(edits[row.id]??{}))row.patches.find(p=>p.path===field).value=value;
 await write('leaf-repair-rows.json',rows);
 await fs.writeFile(path.join(here,'leaf-repair-design.mjs'),"import fs from 'node:fs';\nexport {revision,incrementLimitYuan} from './source-repair-design.mjs';\nexport const patchRows=JSON.parse(fs.readFileSync(new URL('./leaf-repair-rows.json',import.meta.url),'utf8'));\n");
 const plan={...structuredClone(parent.plan),status:'actual-L2-and-L4-leaf-repair',previousPlanFile:path.relative(options.root,options.controlledRevision).replaceAll('\\','/'),previousPlanHash:options.authorizationHash,previousProofHash:hashContent(proof),authorized:[]};
 delete plan.sourceAuthorization;
 for(const id of Object.keys(edits)){
  const record=await read(path.join(options.root,id+'.json')),item=structuredClone(parent.plan.authorized.find(a=>a.id===id));
  Object.assign(item,{recordHash:hashContent(record),draftHash:hashContent(record.draft),reviewHash:hashContent(record.review),paths:Object.keys(edits[id]),sourceOnly:false});
  plan.authorized.push(item);
 }
 const evidence=await read(path.resolve(options.root,plan.authorized.find(a=>a.id==='npc_wt_gonglu').sourceEvidence.file));
 evidence.reviewBoundary+=' 本次还须区分审核者看到的sourceRecords与人物实际获知：亲属currentConcern不是已经向本人转告。独立authoredBackground是待审新事件来源，应核对publicSpeech、原事实与privateRisks，而不是仅因before无此事件否决。group_5叙述只写描图、旧垫松刺、苇束扎口和灶房简记，没有写藏稿、故意拖慢留人、偏分熟人或写错简记；请逐句检查实际文本是否泄密，若有具体冲突仍列hard。';
 await write('npc_wt_gonglu-source-evidence-second.json',evidence);
 const item=plan.authorized.find(a=>a.id==='npc_wt_gonglu');item.sourceEvidence={...item.sourceEvidence,file:path.relative(options.root,path.join(here,'npc_wt_gonglu-source-evidence-second.json')).replaceAll('\\','/'),hash:hashContent(evidence)};
 await write('leaf-repair-plan.json',plan);
 const prepared=await prepareDepthRevision(await leafRepairOptions());
 for(const entry of prepared.entries)if(!edits[entry.id])assert.deepEqual(entry,parent.entries.find(e=>e.id===entry.id));
 console.log(JSON.stringify({changes:prepared.revision.changes.map(c=>({id:c.id,path:c.path})),modelCalls:0}));
}
