import {reviewResponse} from './helpers/consistency-response.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {npcRumors} from '../server-plugin/npc-rumors.mjs';
import {shareNpcMemory} from '../server-plugin/npc-cognition.mjs';
import {relationView} from '../server-plugin/npc-relations.mjs';
import {lieRecordKey,liesToldBy} from '../server-plugin/lies.mjs';
import {reviewNpcKnowledge} from '../server-plugin/consistency-evidence.mjs';
import {deterministicConsistencyReview,validateConsistencyResponse,consistencyReviewRequest} from '../server-plugin/consistency-review.mjs';
import {returnChanges} from '../server-plugin/return-summary.mjs';

const legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const liar='npc_hw_linsui',dupe='npc_hw_hezhou',third='npc_hw_ayan',smith='npc_hw_duanyan',child='npc_hw_duanhe',inn='bld_hw_qingdeng';
const cast=[liar,dupe,third,smith,child];
function draft(document){return {document,get(...p){return p.reduce((v,k)=>v?.[k],this.document);},set(path,value){this.document=applyPatches(this.document,[{op:'set',path,value}]);},remove(path){this.document=applyPatches(this.document,[{op:'delete',path}]);},say(){}};}
async function setup(location=inn){
    const world=await loadWorld();
    for(const id of cast){
        const npc=world.npcs.find(n=>n.id===id);npc.schedule={default:[{start:0,end:1440,location,activity:'营业',services:['trade']}]};
        npc.personality.flaws=[];npc.relationships=cast.filter(o=>o!==id).map(w=>({with:w,type:'朋友',trust:30}));
    }
    const engine=new WorldEngine(world),document=engine.initialFromLegacy(legacy,'lies');document.state.minute=540;document.state.location=location;
    for(const id of cast)Object.assign(document.state.npcs[id],{location,activity:'营业',status:'正常',memoryStream:[],relationships:{}});
    return {world,engine,document};
}
async function run(engine,document,args,eventId){const out=await engine.reduce(document,{tool:'world_remember',args,eventId});return {document:applyPatches(document,out.patches),result:out.result};}
const lie=(extra={})=>({subject:'player',source:liar,key:'面包来路',content:'这面包是今早现烤的',truth:'面包是前天剩下的',motive:'怕卖不出去',knowers:[dupe],...extra});
const record=(document,source,key)=>document.state.records[lieRecordKey(source,key)];
const events=document=>Object.values(document.state.records).filter(r=>r.category==='world_event'&&r.verb==='deceive');

test('成对记录：谁对谁说、说法、真相、动机、知情者；被骗者当事实记住，说谎者私下知情',async()=>{
    const {engine,document:start}=await setup();
    const {document,result}=await run(engine,start,lie(),'tell');
    const row=record(document,liar,'面包来路');
    assert.equal(result.lie,lieRecordKey(liar,'面包来路'));
    assert.deepEqual({liar:row.liar,truth:row.truth,motive:row.motive,knowers:row.knowers,status:row.status},{liar,truth:'面包是前天剩下的',motive:'怕卖不出去',knowers:[dupe,liar].sort(),status:'未揭穿'});
    assert.deepEqual(row.tellings.map(t=>[t.to,t.claim]),[['player','这面包是今早现烤的']]);
    const memory=document.memories['player::面包来路'];
    assert.equal(memory.content,'这面包是今早现烤的');assert.equal(memory.source,liar);assert.doesNotMatch(JSON.stringify(memory),/前天/);
    const own=document.state.npcs[liar].memoryStream.find(r=>r.kind==='lie');
    assert.equal(own.private,true);assert.match(own.content,/前天剩下/);
    assert.match(engine.scene(document,'面包'),/本人所撒的谎.*今早现烤.*实情面包是前天剩下的/);
    // 重复同一句不再记账；真相不能改写；说法与真相相同不是谎言。
    assert.equal((await run(engine,document,lie(),'again')).result.duplicate,true);
    await assert.rejects(run(engine,document,lie({truth:'别的实情'}),'rewrite'),/真相已登记/);
    await assert.rejects(run(engine,start,lie({truth:'这面包是今早现烤的'}),'same'),/不是谎言/);
    await assert.rejects(run(engine,start,lie({knowers:['player']}),'knower'),/知情者/);
    const away=structuredClone(start);away.state.npcs[liar].location='loc_bs';
    await assert.rejects(run(engine,away,lie(),'absent'),/在场/);
    await assert.rejects(run(engine,start,{subject:'player',key:'x',content:'某事',motive:'无'},'motive'),/truth/);
});

test('谎言作为认知传播：被骗者转述走K5传闻路线，失真照常，玩家可从转述者听到',async()=>{
    const {engine,document:start}=await setup();
    let {document}=await run(engine,start,lie({subject:dupe,key:'桥款',content:'修桥款12铜已经全数交给里正',truth:'修桥款被林穗挪去还了酒钱',knowers:[]}),'tell_dupe');
    const rumorId=`rumor_${lieRecordKey(liar,'桥款')}`;
    const held=npcRumors(engine,dupe,document).find(r=>r.id===rumorId);
    assert.equal(held.claim,'修桥款12铜已经全数交给里正');assert.equal(held.source,liar);
    const d=draft(document),memory=document.state.npcs[dupe].memoryStream.find(r=>r.rumor===rumorId);
    shareNpcMemory(d,engine,{from:dupe,to:third,memoryId:memory.id,channel:'conversation',eventId:'retell'});document=d.document;
    const retold=npcRumors(engine,third,document).find(r=>r.id===rumorId);
    assert.ok(retold,'第三人把谎言当传闻接收');assert.match(retold.claim,/修桥款/);assert.notEqual(retold.claim,held.claim,'转述照常失真');
    assert.doesNotMatch(JSON.stringify(npcRumors(engine,third,document)),/酒钱/,'真相不随传闻外传');
    const heard=await run(engine,document,{subject:'player',source:third,key:rumorId,rumor:rumorId,content:retold.claim},'hear');
    assert.equal(heard.result.reliability,'未核实');assert.equal(heard.document.memories[`player::${rumorId}::${third}`].rumor,rumorId);
});

test('揭穿一：知情者开口；玩家记忆改为已揭穿并生成世界事件',async()=>{
    const {engine,document:start}=await setup();
    let {document}=await run(engine,start,lie(),'tell');
    await assert.rejects(run(engine,document,{subject:'player',key:'面包来路',source:third,content:'阿砚说面包不新鲜'},'not_knower'),/知情者/);
    const out=await run(engine,document,{subject:'player',key:'面包来路',source:dupe,content:'贺舟说面包是前天剩的'},'expose');document=out.document;
    const row=record(document,liar,'面包来路');
    assert.equal(row.status,'已揭穿');assert.equal(row.exposures.player.route,'知情者开口');assert.equal(row.exposures.player.by,dupe);
    assert.match(document.memories['player::面包来路'].content,/已揭穿：面包是前天剩下的/);
    const [event]=events(document);assert.equal(event.actor,liar);assert.equal(event.target,'player');assert.ok(event.tags.includes('exposed'));
    assert.doesNotMatch(engine.scene(document,'面包'),/本人所撒的谎/,'已揭穿的谎不再提示');
});

test('揭穿二与三：被骗者自己的亲历矛盾证据；玩家出示相关物品',async()=>{
    const {engine,document:start}=await setup();
    const item=Object.entries(start.state.inventory).find(([id,v])=>id.startsWith('item_')&&(typeof v==='number'?v:v.quantity)>0)[0],itemName=engine.byId.get(item).name;
    let {document}=await run(engine,start,lie({subject:dupe,key:'货价',content:`${itemName}是城里来的上等货`,truth:`${itemName}是自家随手做的`,knowers:[],keywords:[itemName]}),'tell');
    // 被骗者的转述记忆、谎言本身不能当证据；无关亲历也不行。
    const told=document.state.npcs[dupe].memoryStream.find(r=>r.kind==='rumor');
    await assert.rejects(run(engine,document,{subject:dupe,key:'货价',source:told.id,content:'自己记得'},'self'),/亲历|有源/);
    const stream=document.state.npcs[dupe].memoryStream;
    document.state.npcs[dupe].memoryStream=[...stream,{id:'seen_unrelated',kind:'trade',minute:530,sourceType:'目击',participants:[third],content:'阿砚买了米'},
        {id:'seen_make',kind:'craft',minute:535,sourceType:'目击',participants:[liar],content:`看见林穗在后院随手削${itemName}`}];
    await assert.rejects(run(engine,document,{subject:dupe,key:'货价',source:'seen_unrelated',content:'对不上'},'unrelated'),/无关/);
    const a=await run(engine,document,{subject:dupe,key:'货价',source:'seen_make',content:'贺舟想起亲眼见过林穗削它'},'contradiction');
    assert.equal(record(a.document,liar,'货价').exposures[dupe].route,'矛盾证据');assert.equal(events(a.document).length,1);
    // 同一谎言改由玩家出示物品揭穿。
    const b=await run(engine,document,{subject:dupe,key:'货价',source:item,content:'玩家把东西拿给贺舟看'},'evidence');
    assert.equal(record(b.document,liar,'货价').exposures[dupe].route,'玩家出示证据');
    const empty=structuredClone(document);delete empty.state.inventory[item];
    await assert.rejects(run(engine,empty,{subject:dupe,key:'货价',source:item,content:'空手'},'no_item'),/没有可出示/);
});

test('揭穿四：灵智够高的被骗者发现前后不一（U7）；守常者不会',async()=>{
    const tell=async(level,claims)=>{
        const {engine,document:start}=await setup();start.state.npcs[dupe].intelligence={level,growth:0};let document=start,last;
        for(const [i,[key,content]] of claims.entries()){last=await run(engine,document,lie({subject:dupe,key,content,truth:`实情${key}`,knowers:[]}),`t${i}`);document=last.document;}
        return {engine,document,last};
    };
    const two=[['k1','我昨晚一直在店里'],['k2','酒窖钥匙从来不离身']];
    let r=await tell(1,two);assert.equal(liesToldBy(r.document.state,liar).every(l=>l.status==='未揭穿'),true);
    r=await tell(3,two);
    assert.deepEqual(r.last.result.exposed.sort(),[lieRecordKey(liar,'k1'),lieRecordKey(liar,'k2')].sort());
    assert.ok(liesToldBy(r.document.state,liar).every(l=>l.exposures[dupe].route==='识破'));
    r=await tell(2,[['k1','我昨晚一直在店里'],['k1','我昨晚去了河边']]);
    assert.equal(record(r.document,liar,'k1').exposures[dupe].route,'识破','同一件事说法改了');
    // 被识破者不再把这条谎当新闻传。
    assert.equal(npcRumors(r.engine,dupe,r.document).some(x=>x.id.startsWith('rumor_lie:')),false);
});

test('立场与记仇：玩家骗人被揭穿，被骗者信任下降并记仇，所属集体跟着记账',async()=>{
    const {engine,document:start}=await setup();
    const before=relationView(engine,start.state,dupe,'player').trust;
    let {document}=await run(engine,start,{subject:dupe,source:'player',key:'债',content:'我已经替你还清了欠款',truth:'玩家一文没还',motive:'拖延',knowers:[liar]},'tell');
    document=(await run(engine,document,{subject:dupe,key:'债',source:liar,content:'林穗说玩家根本没还'},'expose')).document;
    assert.equal(relationView(engine,document.state,dupe,'player').trust,before-15);
    const grudge=document.state.npcs[dupe].memoryStream.find(r=>r.kind==='grudge');
    assert.equal(grudge.grudge.against,'player');assert.equal(grudge.emotion,'愤怒');assert.match(grudge.content,/一文没还/);
    assert.ok(Object.values(document.state.records).some(r=>r.category==='standing'&&r.target==='player'&&r.history.some(h=>h.sourceEvent==='expose'&&h.delta<0)),'集体立场随世界事件下降');
    // NPC 之间：被骗者对说谎者的关系同样下降。
    let r2=await run(engine,start,lie({subject:dupe,knowers:[third]}),'n_tell');
    r2=await run(engine,r2.document,{subject:dupe,key:'面包来路',source:third,content:'阿砚说出实情'},'n_expose');
    assert.equal(relationView(engine,r2.document.state,dupe,liar).trust,relationView(engine,start.state,dupe,liar).trust-15);
    const changes=returnChanges(engine,r2.document.state,'loc_hw',{from:0}).map(r=>r.text??r).join('|');
    assert.match(changes,/林穗骗贺舟的事被揭穿了/);
});

test('一致性审查区分人物有意说谎与叙述出错',async()=>{
    const base={playerText:'还有铁钉吗',allowedEntities:[{id:'npc_a',name:'阿甲'},{id:'item_x',name:'铁钉'}],before:{state:{npcs:{npc_a:{inventory:{item_x:3}}}}},after:{state:{npcs:{npc_a:{inventory:{item_x:3}}}}}};
    const draftText='<q who="npc_a">铁钉没有了。</q>阿甲把手按在柜台上。';
    const plain=deterministicConsistencyReview({...base,draft:draftText});
    assert.ok(plain.issues.some(i=>i.category==='fact'&&/否认现有货物/.test(i.reason)),'没有登记谎言：仍是事实错误');
    const lies=[{key:'铁钉',claims:['铁钉早就卖光了'],truth:'柜里还有三份',to:['player'],status:'未揭穿',entities:['item_x']}];
    const lying=deterministicConsistencyReview({...base,draft:draftText,knowledge:{npc_a:{lies}}});
    assert.equal(lying.issues.some(i=>/否认现有货物/.test(i.reason)),false,'登记过的谎言：人物有意说谎');
    const otherSpeaker=deterministicConsistencyReview({...base,allowedEntities:[...base.allowedEntities,{id:'npc_b',name:'阿乙'}],after:{state:{npcs:{npc_a:{inventory:{item_x:3}},npc_b:{inventory:{item_x:1}}}}},draft:'<q who="npc_b">铁钉没有了。</q>',knowledge:{npc_a:{lies}}});
    assert.ok(otherSpeaker.issues.some(i=>/否认现有货物/.test(i.reason)),'别人的谎不替这个人开脱');
    const input={...base,draft:draftText+'柜里确实一枚铁钉也没有了。',knowledge:{npc_a:{lies}}};
    assert.match(consistencyReviewRequest(input).messages[0].content,/knowledge\.lies/);
    const response=issues=>reviewResponse(input,issues);
    const issue=quote=>({category:'fact',severity:'error',quote,reason:'与库存不符',evidence:[{id:'player',quote:'还有铁钉吗'}]});
    const kept=validateConsistencyResponse(response([issue('铁钉没有了'),issue('柜里确实一枚铁钉也没有了')]),input);
    assert.deepEqual(kept.map(i=>i.quote),['柜里确实一枚铁钉也没有了'],'旁白写成事实仍报，台词里的谎不报');
    // 真实引擎：撒谎后审稿证据带上这个人的谎言。
    const {engine,document:start}=await setup();
    const {document}=await run(engine,start,lie(),'tell');
    const knowledge=reviewNpcKnowledge(engine,document,{before:start,draft:`<q who="${liar}">这面包是今早现烤的</q>`});
    assert.deepEqual(knowledge[liar].lies.map(l=>[l.claims[0],l.truth]),[['这面包是今早现烤的','面包是前天剩下的']]);
    assert.equal(knowledge[dupe].lies,undefined);
});

test('私密与未成年保护：牵涉未成年人或私宅里的谎只记账，不成传闻、不外传，揭穿事件不进返场汇总',async()=>{
    const {engine,document:start}=await setup();
    let {document}=await run(engine,start,lie({subject:child,content:'你爹答应让你去河边',truth:'段岩没答应',knowers:[]}),'minor');
    const row=record(document,liar,'面包来路');assert.equal(row.private,true);
    const memory=document.state.npcs[child].memoryStream.find(r=>r.content==='你爹答应让你去河边');
    assert.equal(memory.private,true);assert.equal(memory.rumor,undefined);
    assert.equal(npcRumors(engine,child,document).length,npcRumors(engine,child,start).length);
    const d=draft(document);assert.throws(()=>shareNpcMemory(d,engine,{from:child,to:smith,memoryId:memory.id,channel:'conversation',eventId:'x'}),/私密/);
    // 关键词点到未成年人也算。
    const viaKeyword=await run(engine,start,lie({subject:dupe,key:'孩子',content:'段禾偷了东西',truth:'段禾什么也没拿',knowers:[],keywords:['段禾']}),'kw');
    assert.equal(record(viaKeyword.document,liar,'孩子').private,true);
    // 私宅里说的谎同样不外传；揭穿事件带 private 标签，不进返场汇总。
    const home='bld_hw_home_15',{engine:e2,document:h0}=await setup(home);
    let h=await run(e2,h0,lie({subject:dupe,knowers:[third]}),'home');
    assert.equal(record(h.document,liar,'面包来路').private,true);
    h=await run(e2,h.document,{subject:dupe,key:'面包来路',source:third,content:'阿砚说出实情'},'home_expose');
    const [event]=events(h.document);assert.ok(event.tags.includes('private'));
    assert.doesNotMatch(returnChanges(e2,h.document.state,'loc_hw',{from:0}).map(r=>r.text??r).join('|'),/骗/);
});
