import test from 'node:test';
import assert from 'node:assert/strict';
import {AI_PROFILES,DEFAULT_AI_PROFILE,actionModes,aiProfile,turnModelAccess,modelToolAllowed} from '../extension/turn.mjs';
import {finishContractTurn} from '../extension/turn-contract.mjs';
import {normalizeSettings} from '../extension/ui-settings.mjs';

// AI-00 section 3.2: T0 no model; T1 local matching; T2/T3 model understanding with async narration.
const expected={T0:{intent:'off',narration:'off'},T1:{intent:'match',narration:'off'},T2:{intent:'propose',narration:'async'},T3:{intent:'propose',narration:'async'}};

test('AI-01：默认档位是 T0，未知值与旧键都回到默认',()=>{
 assert.equal(DEFAULT_AI_PROFILE,'T0');
 assert.equal(aiProfile(),'T0');assert.equal(aiProfile({aiProfile:'T9'}),'T0');
 assert.equal(normalizeSettings({}).aiProfile,'T0');
 assert.equal(normalizeSettings({intent:'propose',narration:'sync'}).aiProfile,'T0');
 assert.deepEqual(actionModes(normalizeSettings({})),expected.T0);
});

test('AI-01：四档的理解与叙述映射与 AI-00 一致，档位是唯一来源',()=>{
 assert.deepEqual(Object.keys(AI_PROFILES),['T0','T1','T2','T3']);
 for(const [id,modes] of Object.entries(expected)){
  const settings=normalizeSettings({aiProfile:id,intent:'off',narration:'off'});
  assert.equal(settings.aiProfile,id);assert.deepEqual(actionModes(settings),modes);
  assert.equal('intent'in settings||'narration'in settings,false);
  assert.equal(modelToolAllowed('world_act',settings),modes.intent!=='off');
  assert.equal(modelToolAllowed('world_move',settings),modes.intent==='propose');
 }
});

test('AI-01：切换档位不改存档文档',()=>{
 const doc={state:{minute:5,records:{a:{k:1}}},sequence:3},before=structuredClone(doc);
 for(const aiProfile of Object.keys(AI_PROFILES))normalizeSettings({...doc,aiProfile});
 assert.deepEqual(doc,before);
 for(const aiProfile of Object.keys(AI_PROFILES))assert.equal(JSON.stringify(normalizeSettings({aiProfile})).includes('state'),false);
});

test('AI-01：T0 下回合编排不发起任何模型调用，T1 之外的档位按映射开放',async()=>{
 for(const [id,modes] of Object.entries(expected)){
  let calls=0;const settings=normalizeSettings({aiProfile:id});
  const access=turnModelAccess(settings,async()=>{calls++;return {choices:[{finish_reason:'stop',message:{content:'x'}}]};});
  assert.equal(access.narrate,modes.narration!=='off');assert.equal(access.generate===null,modes.intent==='off');
  const result=await finishContractTurn({playerText:'我四处看看',draft:'草稿',gate:async()=>({status:'pending',safeText:'尚未发生',candidates:[],facts:[]}),
   review:async text=>({status:'pending',canCommit:false,text:'尚未发生',safeText:'尚未发生'}),execute:async()=>({ok:true}),...access});
  assert.ok(result.review);
  if(id==='T0')assert.equal(calls,0);else assert.equal(calls,1);
 }
});
