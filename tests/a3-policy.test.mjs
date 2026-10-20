import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyHoldings} from '../server-plugin/holdings.mjs';
import {authority,possessor} from '../server-plugin/action-authority.mjs';
import {consent} from '../server-plugin/action-consent.mjs';
import {canAct,capacity} from '../server-plugin/action-capacity.mjs';
import {appendActionPatches} from '../server-plugin/primitive-policy.mjs';

function context(){return {document:{state:{minute:10,player:{age:20},npcs:{npc_a:{age:20,location:'loc'},npc_guard:{age:30,location:'loc'}},effects:{},records:{},obligations:{}},holdings:emptyHoldings()}};}
function holding(c,row){const id=`h${Object.keys(c.document.holdings.rows).length+1}`;c.document.holdings.rows[id]={id,...row};c.document.holdings.seq++;return id;}
test('A3 policy: self, current holdings, mandate scope and protected purposes',()=>{
 const c=context();assert.equal(authority(c,'player','transfer','player|coin_river|purse').allowed,true);
 const id=holding(c,{kind:'owns',holder:'player',subject:'item_a'});assert.equal(authority(c,'player','holding.transfer','item_a').actedAs.id,id);
 c.document.holdings.rows[id].until=9;assert.equal(authority(c,'player','holding.transfer','item_a').allowed,false);
 c.document.state.obligations.m={id:'m',kind:'mandate',debtor:'player',creditor:'npc_a',status:'active',terms:{scope:[{op:'transfer',target:'npc_a'}]}};
 assert.equal(authority(c,'player','transfer','npc_a|coin_river|purse').actedAs.kind,'mandate');
 assert.equal(authority(c,'player','holding.close','npc_a').allowed,false);
 assert.equal(authority(c,'player','transfer','npc_a|coin_river|escrow:m').allowed,false);
 assert.equal(authority(c,'player','transfer','npc_a|coin_river|collected:tax').allowed,false);
 c.document.state.obligations.m.revoked=true;assert.equal(authority(c,'player','transfer','npc_a|coin_river|purse').allowed,false);
});
test('A3 policy: possession permits tagged disposition, no possession rejects; loops terminate',()=>{
 const c=context();c.document.holdings.locations.item_a={mode:'container',at:'item_b'};c.document.holdings.locations.item_b={mode:'carried',at:'player'};
 assert.equal(possessor(c,'item_a'),'player');assert.deepEqual(authority(c,'player','holding.transfer','item_a',{disposition:true}).tags,['unauthorized_disposition']);
 assert.equal(authority(c,'npc_a','holding.transfer','item_a',{disposition:true}).allowed,false);
 c.document.holdings.locations.item_b={mode:'container',at:'item_a'};assert.equal(possessor(c,'item_a'),null);
});
test('A3 policy: limited may act, none cannot; custody preserves learning and blocks leaving',()=>{
 const c=context();c.document.state.player.age=8;assert.equal(capacity(c,'player','transfer').level,'limited');assert.deepEqual(canAct(c,'player','transfer').tags,['capacity:limited']);assert.equal(canAct(c,'player','transfer').allowed,true);
 holding(c,{kind:'guest_of',variant:'detained',holder:'player',subject:'loc_prison'});
 for(const family of ['talk','learn','service','obligation.create','transfer','observe','wait'])assert.equal(canAct(c,'player',family).allowed,true,family);
 assert.equal(canAct(c,'player','move',{to:'loc_outside'}).allowed,false);assert.equal(canAct(c,'player','move',{to:'loc_prison'}).allowed,true);
 assert.equal(canAct(c,'player','move',{to:'loc_outside',escape:true,escort:true}).allowed,false,'客户端布尔值不能冒充脱逃或押解裁决');
 c.movementAuthority=()=>({allowed:true,kind:'escape',source:'escape-check:success'});
 assert.equal(canAct(c,'player','move',{to:'loc_outside'}).allowed,true);
 c.document.state.player.status='昏迷';assert.equal(canAct(c,'player','learn').allowed,false);
});
test('A3 policy: given consent covers purpose/time and revocation, never client consent:true',()=>{
 const c=context();c.document.state.npcs.npc_a.consent=true;
 assert.equal(consent(c,'npc_a','player','mind').check,'contest');
 c.document.state.consentEvents=[{id:'c1',type:'consent_given',from:'npc_a',to:'player',scope:'mind',purpose:['diagnose'],at:5,until:20}];
 assert.equal(consent(c,'npc_a','player','mind',{purpose:'diagnose'}).kind,'given');assert.equal(consent(c,'npc_a','player','mind',{purpose:'interrogate'}).allowed,false);
 assert.ok(consent(c,'npc_a','player','mind',{purpose:'interrogate'}).tags.includes('unconsented:purpose'));
 assert.equal(consent(c,'npc_a','player','mind',{purpose:'diagnose',until:20}).allowed,false);
 c.document.state.consentEvents.push({id:'r1',type:'consent_revoked',from:'npc_a',consent:'c1',at:10});assert.equal(consent(c,'npc_a','player','mind',{purpose:'diagnose'}).allowed,false);
 assert.equal(consent(c,'npc_a','player','trade',{onRefusal:'abort'}).check,'abort');
});
test('A3 policy: proxy requires factual guardianship/mandate; emergency needs explicit source',()=>{
 const c=context();c.document.state.npcs.npc_a.age=5;c.document.state.consentEvents=[{id:'c2',type:'consent_given',from:'npc_a',by:'npc_guard',to:'player',scope:'mind',at:5,until:20}];
 assert.equal(consent(c,'npc_a','player','mind').allowed,false);
 const id=holding(c,{kind:'guardian_of',holder:'npc_guard',subject:'npc_a',terms:{scope:'property_only'}});assert.equal(consent(c,'npc_a','player','mind').allowed,false);
 c.document.holdings.rows[id].terms.scope='person_and_property';assert.equal(consent(c,'npc_a','player','mind').kind,'proxy');
 c.document.holdings.rows[id].until=9;assert.equal(consent(c,'npc_a','player','mind').allowed,false);
 c.emergencyConsent=()=>({allowed:true});assert.equal(consent(c,'npc_a','player','healing').allowed,false);
 c.emergencyConsent=()=>({allowed:true,source:'core:emergency-healing'});assert.equal(consent(c,'npc_a','player','healing').kind,'emergency');
});
test('A3 policy: independent append patches commute and retain sources; outcomes/reserved reject',()=>{
 const def={id:'core:test',preconditions:[{value:'original'}],consent:{scope:['trade']}},a={id:'pack-a:rule',field:'preconditions',op:'append',value:'adult',reason:'本地规矩'},b={id:'pack-b:rule',field:'preconditions',op:'append',value:'teacher',reason:'教师资格'};
 const ab=appendActionPatches(def,[a,b]);assert.deepEqual(ab,appendActionPatches(def,[b,a]));assert.equal(ab.preconditions[1].source,a.id);assert.deepEqual(def.preconditions,[{value:'original'}]);
 assert.deepEqual(appendActionPatches(appendActionPatches(def,[a]),[b]),appendActionPatches(appendActionPatches(def,[b]),[a]));
 assert.equal(appendActionPatches(def,[{...b,field:'consent.scope'}]).consent.scope[1].source,b.id);
 assert.deepEqual(appendActionPatches(ab,[a,b]),ab);
 for(const patch of [{...a,field:'outcomes'},{...a,op:'remove'},{...a,reason:''}])assert.throws(()=>appendActionPatches(def,[patch]),{code:'E-PATCH'});
 assert.throws(()=>appendActionPatches({...def,reserved:['preconditions']},[a]),{code:'E-PATCH'});
});
