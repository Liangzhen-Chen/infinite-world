import fs from 'node:fs/promises';
import { loadWorld } from './load-world.mjs';
import { DeepSeekClient } from './deepseek-client.mjs';
import { runContentPipeline } from './content-pipeline.mjs';
import { economyW3 } from '../world/design/economy-w3.mjs';
import { w3Context, validateW3Draft, w3Revision } from './w3-content.mjs';

const world=await loadWorld(),bones=economyW3(world),blocklist=JSON.parse(await fs.readFile('world/meta/blocklist.json','utf8'));
const client=new DeepSeekClient({budgetYuan:20});
await fs.mkdir('world/drafts/w3',{recursive:true});
// Carry forward the older per-category ledgers when first adopting one wave
// ledger, so a prompt repair cannot silently reset the 20-yuan ceiling.
for(const kind of ['items','recipes'])try{client.spent=Math.max(client.spent,JSON.parse(await fs.readFile(`world/drafts/w3/${kind}/budget.json`,'utf8')).spentYuan);}catch(error){if(error.code!=='ENOENT')throw error;}
await fs.writeFile('world/drafts/w3/bones.json',JSON.stringify(bones,null,2)+'\n');
for(const kind of ['items','recipes']) {
  const root=`world/drafts/w3/${kind}`;
  const fields=kind==='items'?['description','inspection','storage']:['process'];
  const result=await runContentPipeline({entries:bones[kind],root,client,budgetRoot:'world/drafts/w3',batchSize:kind==='items'?26:25,concurrency:12,revision:w3Revision,
    contextFor:entry=>w3Context(world,bones,entry),
    buildDraftRequest:(entry,feedback,context)=>({temperature:.55,max_tokens:1000,tools:[{type:'function',function:{name:'submit_content',description:`仅提交当前${kind==='items'?'物品':'配方'}说明，禁止同时返回其他实体。`,parameters:{type:'object',additionalProperties:false,required:['id',...fields],properties:{id:{type:'string',enum:[entry.id]},...Object.fromEntries(fields.map(field=>[field,{type:'string',minLength:1}]))}}}}],tool_choice:{type:'function',function:{name:'submit_content'}},messages:[
      {role:'system',content:`写原创中世纪中文游戏的单条器物或工序说明。只输出本条JSON，物品字段id/description/inspection/storage，配方字段id/process。description建议90–150字，inspection建议45–90字，storage建议35–65字，process建议90–160字，长短是软范围。只写居民可读的内容，不写开发规定或数值保证。严格遵守骨架与引用事实，不改变材料、工具、成品数量、用途与保存期。可添加与材质相容的具体纹理、操作痕迹和有限检验动作。不要补新的材料、能力、作者与地点。${kind==='items'?'固定保存期必须在storage明确写数字加天，无固定期则不设天数。书本说明要准确写识字100与阅读分钟。避免在普通器物正文列重量价格，除非必要。':'工序按processFacts展开，完整遵循投入、工具、耗时、产物和副产物；没有副产品就不把废料另作商品。耗时包含干燥等待，不擅自加天数。'}避免批次内反复同一句开头；选本件真实不同的制造难点。审查反馈中的硬错误必须修正。`},
      {role:'user',content:JSON.stringify({skeleton:entry,referencedFacts:context,feedback})}]}),
    validateDraft:(draft,entry,context)=>validateW3Draft(draft,entry,blocklist,context),
    onBatch:async batch=>console.log(JSON.stringify({kind,index:batch.index,passed:batch.passed,count:batch.count,manual:batch.manual,pending:batch.pending,cost:client.spent})),
  });
  console.log(JSON.stringify({kind,...result.summary,batches:undefined}));
}
