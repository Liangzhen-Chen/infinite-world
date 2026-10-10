import fs from'node:fs/promises';
import {contentHash}from'./economy-content.mjs';
const runId=process.argv[2],file=process.argv[3];
if(!/^\d+$/.test(runId??'')||!file)throw new Error('用法：node tools/record-economy-review.mjs runId 人工评分.json');
const read=async path=>JSON.parse(await fs.readFile(path,'utf8'));
const decisions=await read(file),lore=await read(`world/drafts/economy/${runId}/lore.json`),source=await read(`world/drafts/economy/${runId}/source.json`);
const byId=new Map(lore.map(row=>[row.id,row]));
for(const [batchString,judgements]of Object.entries(decisions.batches)){
 const batch=Number(batchString);if(!Number.isSafeInteger(batch)||batch<0)throw new Error('批号无效');
 const path=`docs/内容审查/器物-${runId}-批${batch}.json`,review=await read(path);
 if(review.runId!==runId||review.boneHash!==source.boneHash||review.loreHash!==contentHash(lore))throw new Error('人工评分与当前文本或骨架不符');
 if(judgements.length!==review.sample.length)throw new Error('每个随机样本都必须亲自评分');
 for(const row of review.sample){
    const decision=judgements.find(value=>value.id===row.id);if(!decision||decision.scores?.length!==6||decision.scores.some(score=>!Number.isSafeInteger(score)||score<1||score>5)||typeof decision.notes!=='string'||!decision.notes.trim())throw new Error('人工评分缺失或格式错误');
    if(row.hash!==contentHash(byId.get(row.id)))throw new Error('样本文本被修改');
    Object.assign(row,decision,{mean:decision.scores.reduce((a,b)=>a+b,0)/6});
 }
 review.criteria=['具体性','独特性','内在一致性','与世界的连接','可玩性','说明文字辨识度'];
 review.approved=review.sample.every(row=>row.mean>=4&&row.scores.every(score=>score>=3));
 review.reviewer='Codex亲自精读随机样本，评分文件独立于生成器';review.decisionFile=file;
 await fs.writeFile(path,JSON.stringify(review,null,2)+'\n');console.log(`器物批${batch}：人工${review.approved?'合格':'不合格，整批重做'}`);
}
