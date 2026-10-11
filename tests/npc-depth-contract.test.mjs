import test from 'node:test';
import assert from 'node:assert/strict';
import {extractDraft,patchDraft,buildDraftRequest,validateDraft,applyDepthDraft,verifyUnchanged} from '../tools/npc-depth-content.mjs';

// Literal shape and patch from the saved Zhao Feng assertion. That assertion
// is not a saved model response and is never used as an offline recovery.
export const zhao={id:'npc_yp_zhaofeng',contract:'audit-patch-v1',patches:[{path:'opinions.neighbors[2].view',value:'雨后曾与乔端逐段核对低垄水痕；他要先对原簿，她要先止住沟口受损，对先做哪件事尚有分歧。'}]};
const response=value=>({choices:[{message:{content:JSON.stringify(value)}}]});
test('顶层合同与赵枫实际单层外壳保持严格冻结字段',()=>{
 const entry={...zhao,before:{id:zhao.id,opinions:{neighbors:[{view:'甲'},{view:'乙'},{view:'旧文字'}]},coins:9,memorySeeds:[{id:'old',event:'旧事'}]},issues:[]};
 for(const value of [zhao,{candidate:structuredClone(zhao)}]){const draft=extractDraft(response(value),entry);assert.deepEqual(draft,patchDraft(entry));assert.deepEqual(validateDraft(draft,entry).errors,[]);const after=applyDepthDraft(entry.before,draft);verifyUnchanged(entry.before,after,entry);assert.equal(after.coins,9);assert.deepEqual(after.memorySeeds,entry.before.memorySeeds);}
 const request=buildDraftRequest(entry,null,{});assert.match(request.messages[0].content,/顶层/);const data=JSON.parse(request.messages[1].content);assert.deepEqual(data.schema.required,['id','contract','patches']);assert.deepEqual(data.example,zhao);
});
test('错误编号、合同、路径、值、成员、额外键及混合多层外壳不得修正',()=>{
 const values=[null,[],{candidate:null},{candidate:[]},{candidate:{candidate:zhao}},{candidate:zhao,id:zhao.id},{...zhao,extra:1},{candidate:{...zhao,extra:1}},{...zhao,id:'npc_other'},{...zhao,contract:'old'},{...zhao,patches:[]},{...zhao,patches:[...zhao.patches,...zhao.patches]}];
 for(const field of ['path','value'])values.push({...zhao,patches:[{...zhao.patches[0],[field]:'wrong'}]});
 values.push({...zhao,patches:[{...zhao.patches[0],extra:true}]});
 for(const value of values)assert.throws(()=>extractDraft(response(value),zhao),e=>e.code==='AUDIT_PATCH_PROTOCOL');
});
test('旧共享记忆合同继续提取本人记忆并保持冻结事实',()=>{
 const entry={id:'npc_old',facts:{voice:{register:'低声'},knowledge:{known:[]},relationships:[],goals:{},memorySeeds:[{id:'past',event:'旧事'}]}};
 const draft=extractDraft(response({id:'npc_old',memoryNarrative:'旧事的叙述'}),entry);assert.equal(draft.memorySeeds[0].event,'旧事的叙述');assert.deepEqual(draft.voice,entry.facts.voice);assert.throws(()=>extractDraft(response({candidate:{id:'npc_old',memoryNarrative:'旧事'}}),entry));
});
