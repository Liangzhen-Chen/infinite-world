import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from './load-world.mjs';
import {DeepSeekClient} from './deepseek-client.mjs';
import {runContentPipeline,defaultReviewRequest,hashContent,readApprovedContent} from './content-pipeline.mjs';
import {validateDraft as validateBossDraft} from './m4-batch2-content.mjs';
import {validateBossEcology} from '../server-plugin/bosses.mjs';
import {validateBossCognition} from '../server-plugin/boss-cognition.mjs';
import {validateBossNegotiation} from '../server-plugin/boss-negotiation.mjs';
import {revision,bosses,bossDraft} from '../world/design/w4-b1.mjs';
export {revision};
export const entries=bosses.map(b=>({...b,category:'boss'}));
export const draftRoot=path.resolve('world/drafts/w4-b1');
const budgetRoot=path.resolve('world/drafts/m4-object'),world=await loadWorld();
export const reviewDraftFor=bossDraft;
export function contextFor(e){
 const itemIds=[...new Set([...e.drops.map(d=>d.item),...(e.negotiation?.stock??[]).map(d=>d.item),...(e.negotiation?.accepts??[])])];
 // K1后物种补了机制性状标签tags；审核时的物种事实不含此字段，指纹只按审核时已有的字段核对，其余字段一改仍拒绝。
 const species=world.monsters.find(m=>m.id===e.monster),{tags:_traitTags,...reviewedSpecies}=species??{};
 return {species:species&&reviewedSpecies,location:{id:e.lair,name:world.locations.find(l=>l.id===e.lair)?.name},
  habitat:world.rules.wildlife.habitats.find(h=>h.id===e.residence.habitat),items:itemIds.map(id=>world.items.find(i=>i.id===id)),
  combat:'boss-abilities.mjs: 同类战术自第二次既往使用开始适应，每步减少10%伤害，最高30%；只有实际命中的反击计数。按every与belowHpPercent触发effectSpec指定状态，duration分钟。眩光弱点须睁眼且状态未消耗未过期，更换兵器不清适应。',
  ecology:'bosses.mjs: 巢穴原个体不复生，死亡后空置vacancyDays天才从实际当地种群迁入replacementSpecies。掉落留在尸体，经实际取材才到背包。同类部下按minionCount登记。外貌旧痕不产生额外能力。',
  cognition:e.cognition?'boss-cognition.mjs: 仅记录实际在场到访与发起交锋；守界目标记住领地内冲突，避冲突目标记住所有进攻。记忆和关系随存档保留，不自动造旧交情。':null,
  negotiation:e.negotiation?'boss-negotiation.mjs: 守界只接受respect_territory，曾在领地内进攻者拒绝交换与结盟；避冲突接受两种和平条件，曾进攻者只能和平不能结盟。只收accepts物品，双方按目录价格估值，offer价值必须不少于request且双方有实物才成交。不保证任何比例兑换。有限stock仅新个体初始化，旧档缺失不补货；无请求物资可议定和平。进攻破约，盟约只保存关系不提供自动援战/跟随/所有权/驯服。':null};
}
export function validateDraft(d,e){
 const v=validateBossDraft(d,e),locations=new Set(world.locations.map(l=>l.id)),items=new Set(world.items.map(i=>i.id));
 v.errors.push(...validateBossEcology({...world,bosses:[e]}),...validateBossCognition(e,locations),...validateBossNegotiation(e,items));
 return v;
}
export async function reviewB1({retryManual=false}={}){
 if(!process.env.DEEPSEEK_API_KEY)throw Error('DEEPSEEK_API_KEY 环境变量未配置');
 return runContentPipeline({entries,root:draftRoot,budgetRoot,revision,contextFor,validateDraft,reviewDraftFor,reuseFrozenDrafts:true,retryManual,
  cardId:'T70',allocation:{cardId:'T70',incrementLimitYuan:6,waveLimitYuan:25},concurrency:1,batchSize:12,
  client:new DeepSeekClient({budgetYuan:25,logFile:path.join(draftRoot,'usage.jsonl')}),
  buildDraftRequest:()=>{throw Error('T70正文由Sol起草，禁止模型起草');},
  requestTransform:async({body})=>{const ledger=JSON.parse(await fs.readFile(path.join(budgetRoot,'budget.json'),'utf8'));const issued=Object.values(ledger.requests??{}).filter(r=>r.card==='T70'&&['sent','settled','unknown'].includes(r.status)).length;if(issued>=36)throw Object.assign(Error('T70已达36次L2调用上限'),{code:'CONTENT_BUDGET_STOP'});return {body};},
  buildReviewRequest:(e,d,c)=>{const r=defaultReviewRequest(e,d,c);r.messages[0].content+='按逐条mechanics审核，不沿用旧首领的固定反击次数。智能首领一并核对认知目标、条件、拒绝理由与有限库存。相容的巢穴细节允许，外貌不代表额外能力。minionCount只数部下，不包括首领；minions是物种清单而不是个体数量，野外一般群体规模不限制这处巢穴部下登记。物资名称以publishedFacts.items的id/name对应为准，数量相同即一致。publishedFacts.negotiation是已实现规则的外部证据：两目标均可结盟，avoid_conflict可接受respect_territory或nonaggression，仅曾进攻时拒绝结盟。对没有自动援战或驯服的否定不是新增功能。每个hard必须指出实际不相等或不相容的两个值；完全相同的数值和合法翻译不得称为相反。无矛盾的核对结果不要列入数组。';return r;}});
}
export async function candidateB1(){
 const rows=await readApprovedContent(draftRoot,entries,{contextFor,revision});if(rows.length!==bosses.length)throw Error('12首领未全部通过');
 const candidate={bosses:bosses.map(b=>({...b,...rows.find(d=>d.id===b.id).prose}))};
 await fs.writeFile(path.join(draftRoot,'candidate.json'),JSON.stringify(candidate,null,2)+'\n');return candidate;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 if(process.argv.includes('--l1')){for(const e of entries){const v=validateDraft(reviewDraftFor(e),e);if(v.errors.length)throw Error(`${e.id}: ${v.errors.join(';')}`);}console.log(JSON.stringify({L1:'passed',bosses:bosses.length}));}
 if(process.argv.includes('--review')){const {summary:s}=await reviewB1({retryManual:process.argv.includes('--retry-manual')});console.log(JSON.stringify({total:s.total,passed:s.passed,manual:s.manual,pending:s.pending,card:s.budget.cards.T70}));}
 if(process.argv.includes('--candidate'))console.log(JSON.stringify({bosses:(await candidateB1()).bosses.length}));
}
