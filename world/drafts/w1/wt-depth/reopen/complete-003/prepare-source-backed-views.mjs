import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {genderRepairOptions} from './prepare-leaf-repair.mjs';
import {prepareDepthRevision} from '../../../../../../tools/npc-depth.mjs';
import {hashContent} from '../../../../../../tools/content-pipeline.mjs';
import {patchDraft,validateDraft} from '../../../../../../tools/npc-depth-content.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const read=file=>fs.readFile(file,'utf8').then(JSON.parse);
const write=(name,data)=>fs.writeFile(path.join(here,name),JSON.stringify(data,null,2)+'\n');
export async function sourceBackedViewOptions(){
 const parent=await genderRepairOptions(),file=path.join(here,'source-backed-views-plan.json');
 return {...parent,design:path.join(here,'source-backed-views-design.mjs'),controlledRevision:file,authorizationHash:hashContent(await read(file))};
}
export async function prepareSourceBackedViews(){
 const options=await genderRepairOptions(),parent=await prepareDepthRevision(options),proof=await read(path.join(options.root,'incremental-proof.json'));
 const views={
  npc_wt_zhicai:'在汀口记事屋前，薛萤提到门边旧根要整理，家人与物主的意见仍待薛萤回去询问。',
  npc_wt_xueying:'雷芷在汀口记事屋前提过，含混称呼还需辨清户别；我没听到客户身份或口信内容。',
  npc_wt_shanju:'董霏在苇席收边屋外读过一条灶房简记；那次没有排定工序，我也不知道董霏未公开的私事。',
  npc_wt_peichun:'宿蕙在菜圃外指过溅到叶上的泥点；那次只是核对可见处，搬运安排仍待当事人商量。',
  npc_wt_xiangzhen:'郑汐做水岸议事记录；同村往来并不让我获知郑汐的秘密或私有财物。'
 };
 const rows=parent.entries.map(({context,authoredBackground,facts,contract,...row})=>structuredClone(row));
 const plan={...structuredClone(parent.plan),status:'source-backed-neighbor-views',previousPlanFile:path.relative(options.root,options.controlledRevision).replaceAll('\\','/'),previousPlanHash:options.authorizationHash,previousProofHash:hashContent(proof),authorized:[]};
 // The previous L4 findings remain in the parent proof. Bind this continuation
 // to the current records and change only the five unresolved opinion leaves.
 delete plan.invalidationFile;delete plan.invalidationHash;
 for(const [id,value] of Object.entries(views)){
  const row=rows.find(e=>e.id===id),patch=row.patches.find(p=>p.path==='opinions.neighbors[2].view'),record=await read(path.join(options.root,id+'.json'));
  assert.notEqual(value,record.draft.patches.find(p=>p.path===patch.path).value);
  patch.value=value;
  const item=structuredClone(parent.plan.authorized.find(a=>a.id===id));
  Object.assign(item,{recordHash:hashContent(record),draftHash:hashContent(record.draft),reviewHash:hashContent(record.review),paths:[patch.path],sourceOnly:false});
  plan.authorized.push(item);
 }
 await write('source-backed-views-rows.json',rows);await write('source-backed-views-plan.json',plan);
 await fs.writeFile(path.join(here,'source-backed-views-design.mjs'),"import fs from 'node:fs';\nexport {revision,incrementLimitYuan} from './l4-gender-repair-design.mjs';\nexport const patchRows=JSON.parse(fs.readFileSync(new URL('./source-backed-views-rows.json',import.meta.url),'utf8'));\n");
 const prepared=await prepareDepthRevision(await sourceBackedViewOptions());
 for(const entry of prepared.entries){
  assert.deepEqual(validateDraft(patchDraft(entry),entry).errors,[]);
  if(!views[entry.id]){
   assert.deepEqual(entry,parent.entries.find(e=>e.id===entry.id));
   assert.deepEqual(prepared.contexts.get(entry.id),parent.contexts.get(entry.id));
  }
 }
 return {changes:prepared.revision.changes.map(c=>({id:c.id,path:c.path,before:c.before,after:c.after})),modelCalls:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)console.log(JSON.stringify(await prepareSourceBackedViews()));
