import test from 'node:test';
import assert from 'node:assert/strict';
import {contextFor,depthEntries} from '../tools/npc-depth-content.mjs';
import {depthFoundation} from '../tools/npc-depth.mjs';
import {hashContent} from '../tools/content-pipeline.mjs';
import {loadWorld} from '../tools/load-world.mjs';
import {auditNpcDepth} from '../tools/audit-npc-depth.mjs';
const sourceWorld=await loadWorld();
function audited(){
 const world=structuredClone(sourceWorld),before=world.npcs.find(p=>p.id==='npc_yp_qinli');before.notes='主持人不要让玩家知道另一人的私事。';
 const issues=auditNpcDepth(world).issues.filter(i=>i.id===before.id&&i.field==='notes').map(({id,field,code})=>({id,field,code}));
 const config={revision:'source-selection-v1',patchRows:[{id:before.id,before:structuredClone(before),baseHash:hashContent(before),issues,patches:[{path:'notes',value:'秦砺与高忻在工坊核对过桌位，先后仍未商定。'}]}]};
 const entries=()=>depthEntries([config.patchRows[0].before],config,world);return{world,config,entries};
}
test('审计合同与旧共享记忆未声明来源时保持完整旧context逐深度相等',()=>{
 const people=[{id:'npc_a',name:'甲',occupation:'木匠',age:31,sex:'男',home:{location:'loc_a'},currentConcern:'桌位',socialProfile:{standing:'居民'},relationships:[{with:'npc_b',note:'曾搬桌'}],memorySeeds:[{event:'原始旧事',knownBy:['npc_a','npc_b']}]},{id:'npc_b',name:'乙',occupation:'织工',age:29,sex:'女',home:{location:'loc_a'},currentConcern:'雨天',socialProfile:{standing:'居民'},relationships:[{with:'npc_a',note:'曾搬桌'}],memorySeeds:[{event:'对方旧事',knownBy:['npc_a','npc_b']}]}];
 const place={id:'loc_a',name:'院子',purpose:'劳作',access:'公开'},problem={id:'problem_a',stakeholders:[{person:'npc_a'}],description:'桌位尚未确定'},world={npcs:people,residents:[],locations:[place],settlementProfiles:[{id:'settlement_a',details:{problems:[problem]}}]};
 const basePeople=[{id:'npc_a',name:'甲',occupation:'木匠',age:31,home:{location:'loc_a'},concern:'桌位',socialProfile:{standing:'居民'}},{id:'npc_b',name:'乙',occupation:'织工',age:29,home:{location:'loc_a'},concern:'雨天',socialProfile:{standing:'居民'}}];
 const issues=[{id:'npc_a',field:'notes',code:'rule-wording'}],before={...people[0],notes:'主持人不要让玩家知道。'},entry={id:'npc_a',contract:'audit-patch-v1',before,issues,patches:[{path:'notes',value:'甲与乙在院子核对桌位。'}],facts:{...before,notes:'甲与乙在院子核对桌位。'}};
 assert.deepEqual(contextFor(entry,world),{people:basePeople,places:[place],localProblems:[{settlement:'settlement_a',...problem}],revisions:[{path:'notes',before:before.notes,after:entry.patches[0].value,issues}],rules:['只修改实际失败的叶子或追加缺失条目。原有身份、财物、技能、服务、合格兄弟字段和旧记忆保持冻结。','知识仍为本人私有，候选新增事实必须有既有来源支持，共享事件双方核对，不传播秘密。','地方问题中作者提出的解法尚未得到当事人同意；当事人身份不自动授予另一人的秘密知情权。']});
 const legacy={id:'npc_a',before:{...people[0],workplace:{location:'loc_a'}},facts:{relationships:people[0].relationships},sharedEvent:{location:'loc_a',participants:['npc_a','npc_b']},referenceSexIds:['npc_b'],referenceRelationshipIds:['npc_b'],referenceMemoryIds:['npc_b']};
 assert.deepEqual(contextFor(legacy,world),{people:[basePeople[0],{id:'npc_b',name:'乙',occupation:'织工',age:29,sex:'女',home:{location:'loc_a'},concern:'雨天',socialProfile:{standing:'居民'}}],places:[place],rules:['本次只补认知、语域、关系来由、目标步骤和一条共享旧事；旧身份、钱物、技能、目标内容与已有记忆不变。','新增过去事件按sharedEvent，参与者双方拥有该记忆；不因此知道对方秘密、财物或私下行为。','知识与秘密均为人物私有字段，不代表公开叙述。未知列举尚未确定的事项，不是对其真相的断言。','目标步骤均未完成；询问同意、核对范围不代表已经授权或交付。']});
});
test('显式选择冻结正式关系和记忆；未选字段及其他人物来源不进入审核context',()=>{
 const p=audited(),[plain]=p.entries(),oldContext=contextFor(plain,p.world);assert.equal(Object.hasOwn(plain,'referenceRelationshipIds'),false);assert.equal(Object.hasOwn(plain,'referenceMemoryIds'),false);
 p.config.patchRows[0].referenceRelationshipIds=['npc_yp_gaoxin'];p.config.patchRows[0].referenceMemoryIds=['npc_yp_qinli'];const [entry]=p.entries(),facts=structuredClone(entry.facts),context=contextFor(entry,p.world);
 assert.deepEqual(entry.referenceRelationshipIds,['npc_yp_gaoxin']);assert.deepEqual(entry.referenceMemoryIds,['npc_yp_qinli']);
 const neighbor=context.people.find(p=>p.id==='npc_yp_gaoxin'),self=context.people.find(p=>p.id===entry.id);
 assert.deepEqual(neighbor.relationships,p.world.npcs.find(p=>p.id===neighbor.id).relationships);assert.deepEqual(self.memorySeeds,p.world.npcs.find(p=>p.id===self.id).memorySeeds);
 for(const person of context.people){if(person.id!==neighbor.id)assert.equal(Object.hasOwn(person,'relationships'),false);if(person.id!==self.id)assert.equal(Object.hasOwn(person,'memorySeeds'),false);assert.equal(Object.hasOwn(person,'secrets'),false);assert.equal(Object.hasOwn(person,'knowledge'),false);}
 const stripped=structuredClone(context);for(const person of stripped.people){delete person.relationships;delete person.memorySeeds;}assert.deepEqual(stripped,oldContext);assert.deepEqual(entry.facts,facts);
 const original=structuredClone(p.world.npcs.find(p=>p.id===self.id).memorySeeds);self.memorySeeds[0].event='修改审核副本';assert.deepEqual(p.world.npcs.find(p=>p.id===self.id).memorySeeds,original);
 p.config.patchRows[0].referenceRelationshipIds.push('npc_yp_taozi');assert.deepEqual(entry.referenceRelationshipIds,['npc_yp_gaoxin']);
});
test('来源声明拒绝不存在、不相关、重复及错误形状id，不由候选制造正式来源',()=>{
 const p=audited(),[plain]=p.entries(),related=new Set(contextFor(plain,p.world).people.map(p=>p.id)),unrelated=p.world.npcs.find(p=>!related.has(p.id)).id;
 for(const key of ['referenceRelationshipIds','referenceMemoryIds'])for(const ids of [['npc_nonexistent'],[unrelated],['npc_yp_gaoxin','npc_yp_gaoxin'],'npc_yp_gaoxin',[null]]){const testCase=audited();testCase.config.patchRows[0][key]=ids;assert.throws(()=>testCase.entries(),/来源/);}
 const [entry]=p.entries();entry.referenceMemoryIds=['npc_yp_gaoxin'];p.world.npcs.find(p=>p.id==='npc_yp_gaoxin').memorySeeds=undefined;assert.throws(()=>contextFor(entry,p.world),/正式原来源缺少/);
});
test('原始已选来源变化同时改变context和foundation哈希；未选字段保持指纹',()=>{
 const p=audited();p.config.patchRows[0].referenceRelationshipIds=['npc_yp_gaoxin'];p.config.patchRows[0].referenceMemoryIds=['npc_yp_gaoxin'];const entries=p.entries(),entry=entries[0],contextHash=hashContent(contextFor(entry,p.world)),foundationHash=hashContent(depthFoundation(entries,p.world,p.config.revision));
 const source=p.world.npcs.find(p=>p.id==='npc_yp_gaoxin');source.memorySeeds[0].event+=' 原始来源发生变化';assert.notEqual(hashContent(contextFor(entry,p.world)),contextHash);assert.notEqual(hashContent(depthFoundation(entries,p.world,p.config.revision)),foundationHash);
 const secondContext=hashContent(contextFor(entry,p.world)),secondFoundation=hashContent(depthFoundation(entries,p.world,p.config.revision));source.relationships[0].note+=' 原关系补充';assert.notEqual(hashContent(contextFor(entry,p.world)),secondContext);assert.notEqual(hashContent(depthFoundation(entries,p.world,p.config.revision)),secondFoundation);
 const thirdContext=hashContent(contextFor(entry,p.world)),thirdFoundation=hashContent(depthFoundation(entries,p.world,p.config.revision));source.coins+=100;source.secrets=['未选秘密'];assert.equal(hashContent(contextFor(entry,p.world)),thirdContext);assert.equal(hashContent(depthFoundation(entries,p.world,p.config.revision)),thirdFoundation);
 const withoutSelections=structuredClone(entry);delete withoutSelections.referenceRelationshipIds;delete withoutSelections.referenceMemoryIds;assert.notEqual(hashContent(entry),hashContent(withoutSelections));
});
// Explicit source selection exposes frozen identity/workplace only to review.
test('显式性别和工作地点投影保持真实数据形状，未选择的旧合同不变化',()=>{
 const p=audited(),[old]=p.entries(),plain=contextFor(old,p.world);p.config.patchRows[0].referenceSexIds=['npc_yp_gaoxin'];p.config.patchRows[0].referenceWorkplaceIds=['npc_yp_gaoxin'];
 const [entry]=p.entries(),context=contextFor(entry,p.world),neighbor=context.people.find(n=>n.id==='npc_yp_gaoxin'),source=p.world.npcs.find(n=>n.id==='npc_yp_gaoxin');assert.equal(neighbor.sex,source.sex);assert.deepEqual(neighbor.workplace,source.workplace);assert.equal(plain.people.find(n=>n.id===neighbor.id).sex,undefined);assert.equal(plain.people.find(n=>n.id===neighbor.id).workplace,undefined);assert.deepEqual(entry.facts,old.facts);
 const previous=hashContent(context);source.workplace.location='loc_new';assert.notEqual(hashContent(contextFor(entry,p.world)),previous);
 for(const key of ['referenceSexIds','referenceWorkplaceIds']){const bad=audited();bad.config.patchRows[0][key]=['npc_absent'];assert.throws(()=>bad.entries(),/来源/);}
});
