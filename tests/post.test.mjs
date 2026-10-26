import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,asset,DRIVER,SECOND,SENDER,RECIPIENT} from './helpers/transport.mjs';
import {sendPost,advancePost,nextPostMinute,openPost,postAction} from '../server-plugin/post.mjs';
import {advanceTransport,nextTransportMinute,transportIncident,transportServices} from '../server-plugin/transport.mjs';
import {shareNpcMemory} from '../server-plugin/npc-cognition.mjs';

function setup(){
 const f=fixture(),{d,e}=f;d.set(['state','npcs',RECIPIENT,'location'],'loc_bs');
 d.set(['state','npcs',SENDER,'memoryStream'],[{id:'letter-fact',kind:'trade',sourceEvent:'deal',minute:500,sourceType:'亲历',salience:3,content:'收到三十铜，打算下月再来。',visibility:'private',permittedRecipients:[RECIPIENT],participants:[SENDER]}]);
 return {...f,vehicle:asset(d,e)};
}
function run(d,e,condition){
 for(let i=0;i<100;i++){
  if(condition())return;
  const at=Math.min(nextTransportMinute(d.get('state'),d.get('state','minute')),nextPostMinute(d.get('state'),d.get('state','minute')));assert.ok(Number.isFinite(at),'存在真实待办节点');
  d.set(['state','minute'],at);advanceTransport(d,e,at);advancePost(d,e,at);
 }
 throw Error('邮递未结束');
}
test('封缄第三方携信不移动寄信人，寄收许可与未核实来源保留，回执沿真实返程到达',()=>{
 const {e,d,vehicle}=setup(),sent=sendPost(d,e,{from:SENDER,to:RECIPIENT,memoryId:'letter-fact',legs:[{asset:vehicle,to:'loc_bs'}]},'letter');
 assert.equal(d.get('state','npcs',SENDER,'location'),'loc_hw');assert.equal(d.get('state','npcs',DRIVER,'memoryStream'),undefined);assert.equal(d.get('state','npcs',RECIPIENT,'memoryStream'),undefined);
 run(d,e,()=>Boolean(d.get('state','records',sent.id,'deliveredAt')));
 assert.equal(d.get('state','records',sent.id,'status'),'receipt-in-transit');assert.equal(d.get('state','records',sent.id,'receiptAt'),undefined);
 const heard=d.get('state','npcs',RECIPIENT,'memoryStream').find(m=>m.messageId===sent.id);assert.equal(heard.content,'收到三十铜，打算下月再来。');assert.equal(heard.sourceType,'听说');assert.equal(heard.reliability,'未经亲历核实');
 run(d,e,()=>d.get('state','records',sent.id,'status')==='delivered');assert.ok(d.get('state','records',sent.id,'receiptAt')>d.get('state','records',sent.id,'deliveredAt'));
 assert.equal(d.get('state','npcs',DRIVER,'memoryStream'),undefined);
});
test('接力逐站交接，收件人离址等待，改动寄信人后续记忆不会改写已封原文',()=>{
 const {e,d,vehicle}=setup();d.set(['state','npcs',SECOND,'location'],'loc_bs');d.set(['state','npcs',RECIPIENT,'location'],'loc_yp_path');const next=asset(d,e,SECOND,'cart','relay');
 const sent=sendPost(d,e,{from:SENDER,to:RECIPIENT,memoryId:'letter-fact',legs:[{asset:vehicle,to:'loc_bs'},{asset:next,to:'loc_yp_path'}],receipt:false},'relay');
 d.set(['state','npcs',SENDER,'memoryStream'],d.get('state','npcs',SENDER,'memoryStream').map(m=>({...m,content:'后来改口说九十铜。'})));
 d.set(['state','npcs',RECIPIENT,'location'],'loc_hw');run(d,e,()=>d.get('state','records',sent.id,'status')==='awaiting-recipient');assert.equal(d.get('state','npcs',RECIPIENT,'memoryStream'),undefined);
 assert.equal(d.get('state','records',sent.id,'chain').length,2);d.set(['state','npcs',RECIPIENT,'location'],'loc_yp_path');run(d,e,()=>d.get('state','records',sent.id,'status')==='delivered');
 assert.equal(d.get('state','npcs',RECIPIENT,'memoryStream').find(m=>m.messageId===sent.id).content,'收到三十铜，打算下月再来。');
});
test('私密权限与接力路线在扣费前核对，开封只有实际持信者能读，失件不向收件人泄露',()=>{
 const {e,d,vehicle}=setup(),before=structuredClone(d.document);
 d.set(['state','npcs',SENDER,'memoryStream'],d.get('state','npcs',SENDER,'memoryStream').map(m=>({...m,permittedRecipients:[]})));const denied=structuredClone(d.document);
 assert.throws(()=>sendPost(d,e,{from:SENDER,to:RECIPIENT,memoryId:'letter-fact',legs:[{asset:vehicle,to:'loc_bs'}]},'denied'),/私密/);assert.deepEqual(d.document,denied);
 d.document=before;const sent=sendPost(d,e,{from:SENDER,to:RECIPIENT,memoryId:'letter-fact',legs:[{asset:vehicle,to:'loc_bs'}],receipt:false},'lost');
 assert.throws(()=>openPost(d,e,{letter:sent.id,actor:SECOND},'remote'),/持有/);
 const opened=openPost(d,e,{letter:sent.id,actor:DRIVER},'open');assert.equal(opened.sealBroken,true);assert.equal(d.get('state','npcs',DRIVER,'memoryStream').at(-1).channel,'intercepted-letter');
 openPost(d,e,{letter:sent.id,actor:DRIVER,lose:true},'lose');run(d,e,()=>d.get('state','records',sent.shipment,'status')==='delivered');assert.equal(d.get('state','records',sent.id,'status'),'lost');assert.equal(d.get('state','npcs',RECIPIENT,'memoryStream'),undefined);
});
test('截获信件保留实物与封缄，未开封者未知内容；资产不能同时重复发班',()=>{
 const {e,d,vehicle}=setup(),sent=sendPost(d,e,{from:SENDER,to:RECIPIENT,memoryId:'letter-fact',legs:[{asset:vehicle,to:'loc_bs'}],receipt:false},'intercept');
 transportIncident(d,e,{shipment:sent.shipment,actor:SECOND},'raid');advancePost(d,e,d.get('state','minute'));
 assert.equal(d.get('state','records',sent.id,'status'),'intercepted');assert.equal(d.get('state','npcs',SECOND,'memoryStream'),undefined);assert.equal(transportServices(e,d.document,'loc_hw').length,0);
 assert.equal(openPost(d,e,{letter:sent.id,actor:SECOND},'read').content,'收到三十铜，打算下月再来。');assert.equal(d.get('state','npcs',RECIPIENT,'memoryStream'),undefined);
});
test('玩家通过现有post入口寄自己的文字，查信不能冒充他人',()=>{
 const {e,d,vehicle}=setup(),sent=postAction(d,e,{contract:vehicle,buyer:RECIPIENT,item:'请按原约送来十份燕麦。'},'player-letter');
 run(d,e,()=>d.get('state','records',sent.id,'status')==='delivered');assert.equal(postAction(d,e,{task:'trace',business:sent.id},'trace').id,sent.id);
 assert.match(d.get('state','npcs',RECIPIENT,'memoryStream').find(m=>m.messageId===sent.id).content,/十份燕麦/);
});
test('NPC现有携信请求购买第三方服务，收信玩家只在实际抵达后获知内容',()=>{
 const {e,d,vehicle}=setup();d.set(['state','location'],'loc_bs');d.set(['state','npcs',SENDER,'memoryStream'],d.get('state','npcs',SENDER,'memoryStream').map(m=>({...m,permittedRecipients:['player',RECIPIENT]})));
 const sent=sendPost(d,e,{from:SENDER,to:'player',memoryId:'letter-fact',legs:[{asset:vehicle,to:'loc_bs'}],receipt:false},'npc-to-player');assert.equal(Object.values(d.get('memories')??{}).filter(m=>m.channel==='post').length,0);
 run(d,e,()=>d.get('state','records',sent.id,'status')==='delivered');const memory=Object.values(d.get('memories')).find(m=>m.messageId===sent.id);assert.equal(memory.sourceType,'听说');assert.equal(memory.heardFrom,SENDER);
 const next=setup();next.e.byId.get(RECIPIENT).tier='full';const result=shareNpcMemory(next.d,next.e,{from:SENDER,to:RECIPIENT,memoryId:'letter-fact',channel:'carry',eventId:'npc-purchase'});assert.equal(result.channel,'post');assert.equal(next.d.get('state','npcs',SENDER,'location'),'loc_hw');assert.ok(next.d.get('state','records',result.messageId));
});
