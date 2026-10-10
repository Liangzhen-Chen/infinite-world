import fs from'node:fs/promises';
import {randomBytes}from'node:crypto';
import {loadWorld}from'./load-world.mjs';
import {DeepSeekClient}from'./deepseek-client.mjs';
import {economyFoundation}from'../world/design/economy-foundation.mjs';
import {economyGenerationContext}from'./economy-generation-context.mjs';
import {contentHash,economyLoreSchema,economyItemRequest,loreIssues,auditEconomyLore,assembleEconomy,sampleRows}from'./economy-content.mjs';
const world=await loadWorld(),bones=economyFoundation(world),runId=String(Date.now()),root=`world/drafts/economy/${runId}`;
await fs.mkdir(root,{recursive:true});await fs.mkdir('docs/内容审查',{recursive:true});
const generatorSources=await Promise.all(['tools/draft-economy.mjs','tools/economy-generation-context.mjs','tools/economy-content.mjs'].map(async file=>({file,source:await fs.readFile(file,'utf8')})));
const reviewSeeds=Array.from({length:Math.ceil(bones.items.length/50)},()=>randomBytes(4).readUInt32LE());
await fs.writeFile(`${root}/generator-sources.json`,JSON.stringify(generatorSources,null,2)+'\n');
await fs.writeFile(`${root}/source.json`,JSON.stringify({runId,sourceWorldHash:contentHash(world),boneHash:contentHash(bones),generatorHash:contentHash(generatorSources),reviewSeeds,bones},null,2)+'\n');
await fs.writeFile('schemas/economy-lore.schema.json',JSON.stringify(economyLoreSchema,null,2)+'\n');
const client=new DeepSeekClient({budgetYuan:20}),batches=[],allLore=[];
async function draftBatch(index){
 const entities=bones.items.slice(index*50,index*50+50),rows=[],failures=[];
 async function draftOne(offset){
  const requested=[entities[offset]];let passed=false,feedback=null;
  const{schema:requestSchema,validate:validateRequest}=economyItemRequest(requested[0]);
  for(let attempt=1;attempt<=3;attempt++){
   try{
    const input={...economyGenerationContext(world,bones,requested[0]),feedback};
    await fs.writeFile(`${root}/input-${index}-${offset}-${attempt}.json`,JSON.stringify(input,null,2)+'\n');
    const response=await client.generate({temperature:.35,max_tokens:1300,tools:[{type:'function',function:{name:'submit_item_lore',description:'只提交这一件器物的id、description、inspection、storage，不复制骨架字段，不增加器物。',parameters:requestSchema}}],tool_choice:{type:'function',function:{name:'submit_item_lore'}},messages:[
      {role:'system',content:`写原创中世纪剑与魔法游戏里的器物说明，作为居民能读懂的商品介绍或术书内容。只补id、description、inspection、storage；其余输入是事实和写作约束，不抄成保证句。description建议110–150字，inspection 60–95字，storage 45–70字；硬限见schema。每件选具体的结构、用途或加工动作，不以同一句起头，不反复讲通用制度。
固定重量、材质、用途、产地和保存期按输入。地点与作者用给定中文名称，编号只写在id字段。storage按storageFacts写指定数字加天字的上限和保管动作，不抄写条件约束。inspection只写外观可见征兆、试用动作和有限判断，不推断所有内部状态。新增的外观细节要与已有材质对应，不能改材质或新增用途、服务与能力。
有readingRequirements时写明读书条件与时间，工序按recipes。普通物品不写读书门槛与保证学成。工作台类别不是工具，workplace给出对应工作地点；工具仅按tools。燃料只供炉火，工序投料另计；涉及烧陶时先干透坯再逐步升火。notes只约束本件，不照抄成规则句。description不反复保证不能得到什么，省去目录索引、自动获物等开发用语。输出严格JSON，仅含这一件器物，schema：${JSON.stringify(requestSchema)}`},
      {role:'user',content:JSON.stringify(input)}]},`economy-${runId}-batch${index}-part${offset}-try${attempt}`);
    const calls=response.choices?.[0]?.message?.tool_calls??[];
    const raw=calls[0]?.function?.arguments??response.choices?.[0]?.message?.content??'';
    await fs.writeFile(`${root}/attempt-${index}-${offset}-${attempt}.json`,JSON.stringify({finishReason:response.choices?.[0]?.finish_reason,raw,calls},null,2)+'\n');
    if(calls.length!==1||calls[0].function.name!=='submit_item_lore')throw new Error('必须且只能提交一次指定说明工具调用');
    const out=JSON.parse(raw);if(!validateRequest(out))throw new Error(JSON.stringify(validateRequest.errors));
    const ids=new Set(out.items.map(row=>row.id));if(ids.size!==requested.length||out.items.length!==requested.length||requested.some(row=>!ids.has(row.id)))throw new Error(`说明编号有遗漏、重复或额外实体；只需${requested.map(row=>row.id).join(',')}，实际收到${out.items.map(row=>row.id).join(',')}`);
    for(const row of out.items){const problems=loreIssues(row,requested.find(bone=>bone.id===row.id));if(problems.length)throw new Error(`${row.id}: ${problems.join('；')}`);}
    rows.push(...out.items);passed=true;break;
   }catch(error){feedback=error.message;failures.push({offset,attempt,error:feedback});console.log(`器物批${index}分组${offset}第${attempt}次失败，原输出保留`);}
  }
  return passed;
 }
 // Independent items are generated concurrently; each has its own three tries.
 // Any exhausted item still rejects the whole batch after in-flight work ends.
 for(let offset=0;offset<entities.length;offset+=4){
   const passes=await Promise.all(Array.from({length:Math.min(4,entities.length-offset)},(_,n)=>draftOne(offset+n)));
   if(passes.some(ok=>!ok))break;
 }
 rows.sort((a,b)=>entities.findIndex(row=>row.id===a.id)-entities.findIndex(row=>row.id===b.id));
 const success=rows.length===entities.length;
 await fs.writeFile(`${root}/batch-${index}.json`,JSON.stringify({index,success,rows,failures,boneHash:contentHash(entities),loreHash:contentHash(rows)},null,2)+'\n');
 batches[index]={index,count:entities.length,success,failures};if(success)allLore.push(...rows);
 console.log(`器物批${index} ${rows.length}/${entities.length}，${success?'结构完成，未人工验收':'待人工处理，整批不得发布'}`);
}
const count=Math.ceil(bones.items.length/50);for(let i=0;i<count;i+=2)await Promise.all(Array.from({length:Math.min(2,count-i)},(_,n)=>draftBatch(i+n)));
allLore.sort((a,b)=>bones.items.findIndex(row=>row.id===a.id)-bones.items.findIndex(row=>row.id===b.id));
let audit=null,candidate=null;
if(allLore.length===bones.items.length){
 audit=auditEconomyLore(allLore,bones);
 try{candidate=assembleEconomy(world,bones,allLore);}catch(error){audit.errors.push({type:'world',message:error.message});audit.ok=false;}
 await fs.writeFile(`${root}/lore.json`,JSON.stringify(allLore,null,2)+'\n');await fs.writeFile(`${root}/audit.json`,JSON.stringify(audit,null,2)+'\n');
 if(candidate)await fs.writeFile(`${root}/candidate-world.json`,JSON.stringify(candidate,null,2)+'\n');
 for(let i=0;i<count;i++){
  const slice=allLore.slice(i*50,i*50+50),seed=reviewSeeds[i];
  const review={runId,batch:i,count:slice.length,seed,boneHash:contentHash(bones),loreHash:contentHash(allLore),scope:'待人工精读，六项均分至少4且单项不低于3；任一不合格须整批重做',approved:false,
    sample:sampleRows(slice,seed).map(row=>({id:row.id,hash:contentHash(row),scores:null,notes:null}))};
  await fs.writeFile(`docs/内容审查/器物-${runId}-批${i}.json`,JSON.stringify(review,null,2)+'\n');
 }
}
const report={runId,root,scope:'日常经济首批骨架的模型起草，未发布，未人工验收；完整400物品200配方尚未完成',counts:{plannedItems:bones.items.length,plannedRecipes:bones.recipes.length,structuredLore:allLore.length},batches,audit,manualApproved:false,costUpperYuan:client.spent};
if(batches.some(row=>!row.success))await fs.writeFile(`docs/内容审查/器物起草-待处理-${runId}.json`,JSON.stringify({runId,root,scope:'三次失败后停止该批，进入人工处理，不拼接残缺条目发布',batches:batches.filter(row=>!row.success)},null,2)+'\n');
await fs.writeFile(`docs/测试报告/器物起草-${runId}.json`,JSON.stringify(report,null,2)+'\n');
if(batches.some(row=>!row.success)||!audit?.ok)process.exitCode=1;
console.log(JSON.stringify({runId,counts:report.counts,costUpperYuan:client.spent,autoPassed:!!audit?.ok,manualApproved:false}));
