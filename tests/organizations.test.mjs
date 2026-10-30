import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld}from'../tools/load-world.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {applyPatches}from'../server-plugin/storage.mjs';
import {standing,transmitStanding,collectivesOf,TRANSMISSION}from'../server-plugin/standing.mjs';
import {organization,organizationsOf,advanceOrganizations,DUES_PERIOD,EXPEL_ARREARS}from'../server-plugin/organizations.mjs';
import {advanceRegistry}from'../server-plugin/advance-registry.mjs';
import {toolDefinitions,resolveToolCall}from'../extension/tools.mjs';
import {escrow as escrowAccount}from'../server-plugin/money.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const A='npc_hw_linsui',B='npc_hw_ayan';
function setup(){
    const w=structuredClone(world);for(const n of w.npcs)delete n.schedule;
    const engine=new WorldEngine(w),doc=engine.createCharacter(seed,{},'org-test');
    doc.state.minute=540;doc.state.player.coins=500;
    for(const id of [A,B])Object.assign(doc.state.npcs[id],{location:doc.state.location,activity:'闲谈',coins:100});
    const run=async(c,tool,args,eventId)=>{const out=await engine.reduce(c,{tool,args,eventId});return {document:applyPatches(c,out.patches),result:out.result};};
    const org=(c,args,eventId)=>run(c,'world_settlement',{...args,operation:args.operation},eventId);
    return {engine,doc,run,org};
}
async function found(s,kind='行会'){
    const out=await s.run(s.doc,'world_create',{type:'org',name:'青灯互助会',data:{notes:'互相照应，账目公开',occupation:kind}},'found');
    return {document:out.document,id:out.result.organization,result:out.result};
}

test('玩家代付入会费和首期会费仍须NPC本人同意；通过入账、否决及逾期退款均归真实付款人',async()=>{
    const s=setup(),{document:c0,id}=await found(s);
    const c=(await s.org(c0,{operation:'org_propose',org:id,action:'charter',cost:20,coins:3},'funding-charter')).document;
    const before=structuredClone(c);
    await assert.rejects(s.org(c,{operation:'org_join',org:id,member:A},'unfunded'),/可由你代付入会费/);
    await assert.rejects(s.org(c,{operation:'org_join',org:id,member:A,consent:true,reward:1000,compensation:1000},'fake-funded'),/本人当面同意/);
    assert.deepEqual(c,before);
    for(const slots of [{consent:true},{reward:1000}]){
        const denied=await s.run(c,'world_act',{action:'core:settlement.org_join',slots:{org:id,member:A,feePayer:'player',...slots}},`fake-${Object.keys(slots)[0]}`);
        assert.equal(denied.result.receipt.status,'rejected');assert.deepEqual(denied.document,c);
    }
    const input={tool:'world_act',args:{action:'core:settlement.org_join',slots:{org:id,member:A,feePayer:'player'}},eventId:'funded-join'};
    const out=await s.engine.reduce(c,input),invited=applyPatches(c,out.patches),proposal=out.result.proposal;
    assert.notEqual(out.result.receipt?.status,'rejected',out.result.receipt?.reason);
    assert.equal(out.result.status,'议事中');assert.equal(invited.state.player.coins,477);assert.equal(invited.state.npcs[A].coins,100);
    const escrow=escrowAccount(`motion_${proposal}`);
    assert.equal(invited.ledger.accounts[escrow],23);
    assert.equal(invited.state.records[proposal].feePayer,'player');assert.equal(invited.state.records[proposal].firstDues,3);
    const consent=invited.state.consentEvents.find(row=>row.id==='funded-join:consent');
    assert.equal(consent.from,A);assert.equal(consent.subject,id);assert.equal(consent.scope,'org.join');assert.deepEqual(consent.terms,{fee:0,amount:0});
    const replay=await s.engine.reduce(c,input,{replay:true,result:out.result});assert.deepEqual(applyPatches(c,replay.patches),invited);
    for(const opinion of ['approve','reject']){
        const closed=await s.org(invited,{operation:'org_vote',org:id,proposal,opinion},`funded-${opinion}`),view=organization(s.engine,closed.document.state,id);
        assert.equal(closed.document.ledger.accounts[escrow]??0,0);
        assert.equal(closed.document.state.npcs[A].coins,100);
        assert.equal(closed.document.state.player.coins,opinion==='approve'?477:500);
        assert.equal(view.treasury,opinion==='approve'?23:0);
        assert.equal(Boolean(view.members[A]),opinion==='approve');
        if(opinion==='approve')assert.deepEqual(view.ledger.map(row=>[row.kind,row.amount]),[['入会费',20],['首期会费',3]]);
    }
    // Real waiting reaches the existing proposal lapse; no synthetic close or refund.
    const lapseAt=Math.ceil((invited.state.minute+7*1440)/1440)*1440;
    const lapsed=await s.run(invited,'world_time',{minutes:lapseAt-invited.state.minute},'funded-lapse');
    assert.equal(lapsed.document.state.records[proposal].status,'搁置');
    assert.equal(lapsed.document.state.player.coins,500);assert.equal(lapsed.document.state.npcs[A].coins,100);
    assert.equal(lapsed.document.ledger.accounts[escrow]??0,0);
});

test('商号入会由现任代表本人同意，玩家代付从玩家钱袋直接入组织',async()=>{
    const s=setup(),{document:c0,id}=await found(s);
    const c=(await s.org(c0,{operation:'org_propose',org:id,action:'charter',cost:7,coins:2,consent:false},'shop-fees')).document;
    // An existing NPC business is the supported member; its representative remains an agent.
    c.state.records.fee_test_business={id:'fee_test_business',category:'business',owner:B,location:c.state.location,status:'营业'};
    await assert.rejects(s.org(c,{operation:'org_join',org:id,member:'fee_test_business'},'shop-unfunded'),/可由你代付入会费/);
    const joined=await s.run(c,'world_act',{action:'core:settlement.org_join',slots:{org:id,member:'fee_test_business',feePayer:'player'}},'shop-funded');
    assert.equal(joined.result.joined,true);assert.equal(joined.document.state.player.coins,491);assert.equal(joined.document.state.npcs[B].coins,100);
    const view=organization(s.engine,joined.document.state,id);assert.equal(view.treasury,9);assert.equal(view.members.fee_test_business.representative,B);
    assert.ok(joined.document.state.consentEvents.some(row=>row.from===B&&row.scope==='org.join'&&row.subject===id));
});

test('创立行会：玩家任会长，章程与公库可查；存入记账并提升组织立场；组织行为成为世界事件',async()=>{
    const s=setup(),{document:c0,id,result}=await found(s);
    assert.equal(result.kind,'行会');assert.equal(result.leaderTitle,'会长');
    const view=organization(s.engine,c0.state,id);
    assert.equal(view.leader,'player');assert.equal(view.members.player.position,'会长');assert.equal(view.charter.mode,'leader');
    assert.equal(c0.state.created[id].kind,'行会');
    assert.ok(Object.values(c0.state.records).some(r=>r.category==='world_event'&&r.verb==='organize'&&r.target===id&&r.tags.includes('org:found')));
    const dep=await s.org(c0,{operation:'org_deposit',org:'青灯互助会',coins:50,content:'开办经费'},'dep');
    assert.equal(dep.document.state.player.coins,450);assert.equal(dep.result.treasury,50);
    const v=organization(s.engine,dep.document.state,id);
    assert.equal(v.treasury,50);assert.deepEqual(v.ledger.map(l=>[l.kind,l.amount,l.party,l.balance]),[['存入',50,'player',50]]);
    assert.equal(standing(s.engine,dep.document.state,id,'player'),7,'2+50/10');
    const inspect=await s.org(dep.document,{operation:'org_inspect',org:id},'look');
    assert.equal(inspect.result.mode,'会长定');assert.equal(inspect.result.members.length,1);
    // Only org operations exist on the existing settlement tool; no new tool.
    assert.equal(toolDefinitions().length,27);
    assert.equal(resolveToolCall('world_settlement',{operation:'org_vote'}).tool,'world_settlement');
});

test('入会：章程要求审批时入会费暂存，会长当面批准后入账；否决退还；免审批直接入会',async()=>{
    const s=setup(),{document:c0,id}=await found(s);
    // 设计B：NPC先真实接受零费邀请和任命；原20铜托管/退款断言
    // 由玩家亲自申请承担，避免用调用参数替NPC答应付钱。
    const invitation=await s.org(c0,{operation:'org_join',org:id,member:A},'invite');
    let c=(await s.org(invitation.document,{operation:'org_vote',org:id,proposal:invitation.result.proposal,opinion:'approve'},'admit')).document;
    c=(await s.org(c,{operation:'org_propose',org:id,action:'appoint',member:A,name:'会长'},'handover')).document;
    assert.equal(organization(s.engine,c.state,id).leader,A);
    const fee=await s.org(c,{operation:'org_propose',org:id,speaker:A,action:'charter',choice:'vote',cost:20},'fee');
    assert.equal(fee.result.status,'通过','会长定：会长提出即决');
    assert.equal(organization(s.engine,fee.document.state,id).charter.fee,20);
    await assert.rejects(s.org(fee.document,{operation:'org_join',org:id,member:B},'nope'),/当面同意/);
    await assert.rejects(s.org(fee.document,{operation:'org_join',org:id,member:B,consent:true},'forged'),/当面同意/);
    c=(await s.org(fee.document,{operation:'org_leave',org:id},'leave-first')).document;
    const apply=await s.org(c,{operation:'org_join',org:id},'apply');
    assert.equal(apply.result.status,'议事中');assert.equal(apply.document.state.player.coins,480,'入会费暂存');
    assert.equal(organization(s.engine,apply.document.state,id).members.player,undefined);
    const ok=await s.org(apply.document,{operation:'org_vote',org:id,proposal:apply.result.proposal,speaker:A,opinion:'approve'},'ok');
    assert.equal(ok.result.status,'通过');
    const v=organization(s.engine,ok.document.state,id);assert.equal(v.members.player.position,'成员');assert.equal(v.treasury,20);
    assert.deepEqual(organizationsOf(ok.document.state,'player'),[id]);
    c=(await s.org(ok.document,{operation:'org_leave',org:id},'leave-second')).document;
    const applyB=await s.org(c,{operation:'org_join',org:id},'applyB');
    const no=await s.org(applyB.document,{operation:'org_vote',org:id,proposal:applyB.result.proposal,speaker:A,opinion:'reject'},'no');
    assert.equal(no.result.status,'否决');assert.equal(no.document.state.player.coins,480,'否决退还入会费');
    const open=await s.org(no.document,{operation:'org_propose',org:id,speaker:A,action:'charter',consent:false},'open');
    const join=await s.org(open.document,{operation:'org_join',org:id},'joinB');
    assert.equal(join.result.joined,true);assert.equal(organization(s.engine,join.document.state,id).treasury,40);
    await assert.rejects(s.org(join.document,{operation:'org_leave',org:id,member:A},'quit'),/先改任/);
    const leave=await s.org(join.document,{operation:'org_leave',org:id},'leaveB');
    assert.equal(organization(s.engine,leave.document.state,id).members.player,undefined);
});

async function withMembers(s){
    let {document:c,id}=await found(s);
    c=(await s.org(c,{operation:'org_propose',org:id,action:'charter',consent:false},'open')).document;
    c=(await s.org(c,{operation:'org_join',org:id,member:A,consent:true},'jA')).document;
    c=(await s.org(c,{operation:'org_join',org:id,member:B,consent:true},'jB')).document;
    c=(await s.org(c,{operation:'org_deposit',org:id,coins:100},'dep')).document;
    return {c,id};
}

test('三种议事方式：会长定即决；成员投票过半才执行支取；长老定由会长与长老决定，离屏人物按立场表态',async()=>{
    const s=setup();let {c,id}=await withMembers(s);
    // Member vote: the proposer's approval alone is 1/3.
    c=(await s.org(c,{operation:'org_propose',org:id,action:'charter',choice:'vote'},'mode')).document;
    assert.equal(organization(s.engine,c.state,id).charter.mode,'vote');
    const p=await s.org(c,{operation:'org_propose',org:id,action:'withdraw',member:A,coins:30,content:'修屋顶'},'pay');
    assert.equal(p.result.status,'议事中');assert.deepEqual(p.result.deciders,['npc_hw_ayan','npc_hw_linsui','player']);
    await assert.rejects(s.org(p.document,{operation:'org_vote',org:id,proposal:p.result.proposal,opinion:'approve'},'again'),/已表态/);
    const v=await s.org(p.document,{operation:'org_vote',org:id,proposal:p.result.proposal,speaker:B,opinion:'approve'},'vB');
    assert.equal(v.result.status,'通过');assert.equal(v.document.state.npcs[A].coins,130,'议决结果实际支付');
    const view=organization(s.engine,v.document.state,id);assert.equal(view.treasury,70);assert.equal(view.ledger.at(-1).kind,'支取');
    c=v.document;
    // Vote mode: appointing an elder and switching to elders need a majority too.
    for(const [args,e] of [[{action:'appoint',member:A,name:'长老'},'el'],[{action:'charter',choice:'elders'},'me']]){
        const r=await s.org(c,{operation:'org_propose',org:id,...args},e);
        c=(await s.org(r.document,{operation:'org_vote',org:id,proposal:r.result.proposal,speaker:A,opinion:'approve'},`${e}v`)).document;
    }
    const v2=organization(s.engine,c.state,id);assert.equal(v2.members[A].position,'长老');assert.equal(v2.charter.mode,'elders');
    const q=await s.org(c,{operation:'org_propose',org:id,action:'withdraw',member:'player',coins:10},'q');
    assert.deepEqual(q.result.deciders,['npc_hw_linsui','player']);assert.equal(q.result.status,'议事中');
    await assert.rejects(s.org(q.document,{operation:'org_vote',org:id,proposal:q.result.proposal,speaker:B,opinion:'reject'},'qb'),/无表决权/);
    const later=await s.run(q.document,'world_time',{minutes:1440},'wait');
    const closed=later.document.state.records[q.result.proposal];
    assert.equal(closed.status,'通过');assert.ok(closed.votes.some(x=>x.voter===A&&x.offscreen&&x.basis));
    assert.equal(organization(s.engine,later.document.state,id).treasury,60);
    assert.ok(later.document.state.records[`world_event:${q.result.proposal}:close`].tags.includes('passed'));
    // Under elders the leader alone is not a majority.
    const lead=await s.org(later.document,{operation:'org_propose',org:id,action:'expel',member:B},'ex');
    assert.equal(lead.result.status,'议事中','长老定下会长一人不足半数以上');
});

test('立场：伤害或帮助组织成员按比例传到组织；入会前不传导',async()=>{
    const s=setup(),bare=await found(s);
    assert.ok(!collectivesOf(s.engine,bare.document.state,A).some(r=>r.holder===bare.id));
    const {c,id}=await withMembers(s);
    assert.ok(collectivesOf(s.engine,c.state,A).some(r=>r.holder===id&&r.ratio===TRANSMISSION.organization));
    const before=standing(s.engine,c.state,id,'player');
    const d={document:c,get(...k){return k.reduce((o,x)=>o?.[x],this.document);},set(path,value){this.document=applyPatches(this.document,[{op:'set',path,value}]);}};
    transmitStanding(d,s.engine,[{id:'hit',verb:'harm',actor:'player',target:A,harm:10,witnesses:[],tags:['combat','hostile'],minute:600}]);
    assert.equal(standing(s.engine,d.document.state,id,'player'),before-10,'-(10+10)×0.5');
    transmitStanding(d,s.engine,[{id:'aid',verb:'gift',actor:'player',target:B,value:100,witnesses:[],tags:['gift'],minute:600}]);
    assert.equal(standing(s.engine,d.document.state,id,'player'),before-10+7,'13×0.5取整');
});

test('离屏会费按推进注册表结算：按期扣缴入库，欠费三期除名并产生世界事件',async()=>{
    assert.ok(advanceRegistry.some(x=>x.id==='organizations'));
    const s=setup();let {c,id}=await withMembers(s);
    c=(await s.org(c,{operation:'org_propose',org:id,action:'charter',coins:10},'dues')).document;
    const start=organization(s.engine,c.state,id);assert.equal(start.nextDues,c.state.minute+DUES_PERIOD);
    // 05 §5.1 / §5.7: a member can earn during a real month. The arrears
    // anchor is an empty purse when dues fall due, not a promise of no income
    // for thirty days. Keep the full elapsed month and every fee/expulsion check.
    c=(await s.run(c,'world_time',{minutes:DUES_PERIOD-1},'before_month')).document;
    c.state.npcs[B].coins=0;const coins=c.state.player.coins,treasury=organization(s.engine,c.state,id).treasury;
    const one=(await s.run(c,'world_time',{minutes:1},'month')).document;
    const v=organization(s.engine,one.state,id);
    assert.equal(one.state.player.coins,coins-10);assert.equal(v.treasury,treasury+20,'玩家与林岁缴费');
    assert.equal(v.members[B].arrears,1);assert.ok(v.ledger.some(l=>l.kind==='欠费'&&l.party===B));
    const r=one.state.records[`organization:${id}`];
    // Two more periods unpaid in one long rest: settled period by period.
    const d={document:structuredClone(one),get(...k){return k.reduce((o,x)=>o?.[x],this.document);},set(path,value){this.document=applyPatches(this.document,[{op:'set',path,value}]);}};
    d.document.state.npcs[B].coins=0;d.document.state.npcs[A].coins=50;
    advanceOrganizations(d,s.engine,{before:one.state.minute,after:one.state.minute+DUES_PERIOD*(EXPEL_ARREARS-1)});
    const three=d.document;
    const after=organization(s.engine,three.state,id);
    assert.equal(after.members[B],undefined);assert.ok(three.state.records[`organization:${id}`].removed[B].reason.includes('欠费'));
    assert.ok(Object.values(three.state.records).some(x=>x.category==='world_event'&&x.verb==='organize'&&x.target===B&&x.tags.includes('arrears')));
    assert.equal(after.treasury,treasury+60);assert.equal(three.state.npcs[A].coins,30);assert.ok(r.nextDues<three.state.records[`organization:${id}`].nextDues);
});

test('现有势力与家户识别为组织：引用目录不复制，加入只记本战役变化',async()=>{
    const s=setup(),f=world.factions.find(x=>x.id==='faction_saltboat');
    const v=organization(s.engine,s.doc.state,f.id);
    assert.equal(v.source,'faction');assert.equal(v.leader,f.leader);assert.equal(v.treasury,f.resources.treasuryCopper);
    assert.equal(v.members[f.leader].position,'首领');assert.equal(s.doc.state.records[`organization:${f.id}`],undefined);
    const house=organization(s.engine,s.doc.state,'house_hw_01');
    assert.equal(house.kind,'家户');assert.equal(house.charter.mode,'elders');assert.ok(house.members[A]);
    await assert.rejects(s.org(s.doc,{operation:'org_join',org:'house_hw_01'},'h'),/家户/);
    await assert.rejects(s.org(s.doc,{operation:'org_join',org:f.name},'far'),/联络处/);
    const c=structuredClone(s.doc);c.state.location=f.contactAnchor;
    const apply=await s.org(c,{operation:'org_join',org:f.name},'apply');
    assert.equal(apply.result.status,'议事中');
    const next=(await s.run(apply.document,'world_time',{minutes:1440},'wait')).document;
    const joined=organization(s.engine,next.state,f.id);
    assert.equal(joined.members.player.position,'成员','首领离屏按立场批准');
    const row=next.state.records[`organization:${f.id}`];assert.equal(row.name,undefined,'只存变化');
    assert.ok(!('resources' in row));
});
