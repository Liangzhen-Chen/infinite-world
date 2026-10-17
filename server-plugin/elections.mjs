import {purse,moveCoins} from './money.mjs';
import {declareLedgerWriter} from './ledger.mjs';
declareLedgerWriter('elections');
import {eligible,governanceAction} from './governance.mjs';
import {organization,electOrganizationLeader} from './organizations.mjs';
import {standing,adjustStanding} from './standing.mjs';
import {recordLie,exposeLieCall} from './lies.mjs';
import {registerIncident} from './law.mjs';
import {transferItems} from './items.mjs';
import {advanceWithNpcParticipants} from './npc-schedule.mjs';
import {personView} from './entity-view.mjs';
import {actorId,actorPath} from './npc-state.mjs';
import {resolveCreature} from './wildlife.mjs';
import {declareHoldingWriter,holdingSet} from './holdings.mjs';
declareHoldingWriter('elections',{kinds:['holds_office'],entities:['office']});

const path=id=>['state','records',id];
const awake=n=>n&&!['死亡','濒死','昏迷'].includes(n.status)&&!/睡/.test(n.activity??'');
function here(d,engine,name){
    const id=actorId(engine.world,resolveCreature(engine,d,name)),view=personView(engine,d.get('state'),id),n=view&&d.get(...view.actorPath.value);
    if(!awake(n)||n.location!==d.get('state','location'))throw Error('拉票或揭发当事人须实际在场');return id;
}
function voters(engine,state,row){
    if(row.org){const org=organization(engine,state,row.org);if(!org||org.charter.mode!=='vote')throw Error('组织已不实行成员选任');return Object.keys(org.members).sort();}
    return eligible(engine,row.settlement,state);
}
export function electionAction(d,args,id){
    const now=d.get('state','minute');
    if(args.operation==='election_start'){
        let org=null,settlement=null,office=null,incumbent=null;
        if(args.org){
            org=organization(this,d.get('state'),d.get('state','records',`organization:${args.org}`)?args.org:this.resolve(args.org));
            if(!org||org.charter.mode!=='vote'||!org.members.player)throw Error('只有实行成员投票的组织成员可竞选');
            if(d.get('state','location')!==org.seat)throw Error('须在组织议事地点登记竞选');
            incumbent=org.leader;
        }else{
            settlement=this.resolve(args.settlement,'loc');office=this.rules.governance?.authority?.offices[args.name??'office_village_head'];
            if(!office||!this.rules.governance.elections?.[office.id]?.settlements.includes(settlement))throw Error('该职位没有选任来源');
            if(d.get('state','records',`civic_citizen:${settlement}:player`,'status')!=='已登记')throw Error('须先成为本村公民');
            const g=this.world.settlementProfiles.find(s=>s.id===settlement)?.details.governance;
            if(!g||g.meetingPlace!==d.get('state','location'))throw Error('须在村议事屋登记竞选');incumbent=g.head;
        }
        if(incumbent==='player')throw Error('已在任，无需再次争取本任期');
        if(Object.values(d.get('state','records')??{}).some(r=>r.category==='election'&&r.status==='竞选中'&&r.org===(org?.id??null)&&r.settlement===settlement))throw Error('已有本职位竞选');
        const key=`election:${id}`,row={category:'election',id:key,org:org?.id??null,settlement,office:office?.id??null,incumbent,candidate:'player',
            status:'竞选中',started:now,due:now+this.rules.elections.campaignDays*1440,campaigns:[],frauds:[],sourceEvent:id};
        row.electorate=voters(this,d.get('state'),row);if(row.electorate.filter(v=>v!=='player').length===0)throw Error('没有实际选民');
        holdingSet(d,null,path(key),row,'elections');return {election:key,status:row.status,due:row.due,electorate:row.electorate};
    }
    const row=d.get(...path(args.proposal));if(row?.category!=='election')throw Error('没有该竞选');
    if(args.operation==='election_expose'){
        const fraud=row.frauds.find(f=>f.event===args.sourceEvent&&!f.exposed);if(!fraud)throw Error('没有该未揭发贿选凭据');
        const speaker=here(d,this,args.speaker);if(speaker!==fraud.recipient)throw Error('须由收贿知情者出面作证');
        here(d,this,fraud.observer);
        const exposure=exposeLieCall(d,this,{subject:fraud.observer,key:fraud.key,source:speaker,content:'参选人曾送钱要求我投票，声称只是无关选票的赠礼。'},id);
        const incident=registerIncident(d,this,{victim:speaker,offense:'vote_buying',value:fraud.coins,witnesses:[speaker,fraud.observer],eventId:id,optional:true});
        for(const v of voters(this,d.get('state'),row).filter(v=>v!=='player'))adjustStanding(d,this,v,'player',-20,{sourceEvent:id,reason:'贿选被揭发'});
        const next={...row,frauds:row.frauds.map(f=>f===fraud?{...f,exposed:true,case:incident}:f),disqualified:true};holdingSet(d,null,path(row.id),next,'elections');
        if(row.appointment){const a=d.get(...path(row.appointment));if(a?.status==='待审定')holdingSet(d,null,path(a.id),{...a,status:'撤回',reason:'贿选揭发'},'elections');}
        return {election:row.id,disqualified:true,case:incident,...exposure};
    }
    if(row.status!=='竞选中')throw Error('本轮投票已经结束');
    if(args.operation==='election_campaign'){
        if(now>=row.due)throw Error('拉票期已结束');
        const action=args.choice??'speech',electorate=voters(this,d.get('state'),row).filter(v=>v!=='player');
        if(!['gift','speech','promise','buy_votes'].includes(action))throw Error('拉票方式为gift、speech、promise或buy_votes');
        const targets=action==='speech'?electorate.filter(v=>awake(d.get(...actorPath(this.world,v)))&&d.get(...actorPath(this.world,v),'location')===d.get('state','location')):[here(d,this,args.speaker)];
        if(!targets.length||targets.some(v=>!electorate.includes(v)))throw Error('拉票对象须是本轮实际选民');
        if(row.campaigns.some(c=>c.day===Math.floor(now/1440)&&c.action===action&&targets.some(v=>c.targets.includes(v))))throw Error('今日已用同一方式向这些选民拉票');
        if(['speech','promise'].includes(action)&&(!args.content?.trim()||args.content.length>1200))throw Error('需要实际演说或承诺内容');
        let gift=null,coins=0,observer=null;
        if(action==='gift'){gift=this.resolve(args.item,'item');if(this.quantity(d,'player',gift)<1)throw Error('没有可送的礼物');}
        if(action==='buy_votes'){
            coins=args.coins;if(!Number.isSafeInteger(coins)||coins<1||coins>100000||d.get('state','player','coins')<coins)throw Error('贿选款不足或数额无效');
            observer=here(d,this,args.authority);if(targets.includes(observer))throw Error('须另有被赠礼说法误导的在场人');
        }
        advanceWithNpcParticipants(d,this,30,id,[...targets,...observer?[observer]:[]]);
        const check=this.check(d,{attribute:'魅力',difficulty:15},id),gain=action==='gift'?Math.min(10,2+Math.floor(this.byId.get(gift).basePrice/5)):action==='buy_votes'?Math.min(20,Math.floor(coins/2)):check.success?6:-2;
        if(gift)transferItems(d,this,'player',targets[0],gift,1);
        const frauds=[...row.frauds];let disqualified=row.disqualified??false;
        if(coins){
            moveCoins(d,{from:purse(this,'player'),to:purse(this,targets[0]),amount:coins,writer:'elections',eventId:id});d.set(['state','player','coins'],d.get('state','player','coins')-coins);d.set([...actorPath(this.world,targets[0]),'coins'],d.get(...actorPath(this.world,targets[0]),'coins')+coins);
            const key=`vote_gift:${id}`,lie=recordLie(d,this,{source:'player',subject:observer,key,content:'这笔赠礼与选票无关。',truth:'这笔钱是要求对方投我一票的贿选款。',motive:'掩盖贿选',knowers:[targets[0]]},id);
            const exposed=Boolean(lie.exposed?.length);
            const incident=exposed?registerIncident(d,this,{victim:targets[0],offense:'vote_buying',value:coins,witnesses:[targets[0],observer],eventId:`${id}_exposed`,optional:true}):null;
            frauds.push({event:id,recipient:targets[0],observer,coins,key,lie:lie.lie,exposed,case:incident});disqualified||=exposed;
        }
        for(const voter of targets)adjustStanding(d,this,voter,'player',gain,{sourceEvent:id,reason:`竞选${action}`});
        for(const voter of targets)d.set([...actorPath(this.world,voter),'memoryStream'],[...d.get(...actorPath(this.world,voter),'memoryStream')??[],{
            id:`campaign:${id}:${voter}`,kind:'campaign',sourceEvent:id,minute:d.get('state','minute'),location:d.get('state','location'),participants:['player',voter],sourceType:'亲历',
            content:args.content??(gift?'参选人当面送了礼物。':'参选人私下送钱求票。'),campaignSuccess:gain>0,...(coins?{private:true}:{})}]);
        holdingSet(d,null,path(row.id),{...row,frauds,disqualified,campaigns:[...row.campaigns,{action,targets,day:Math.floor(now/1440),content:args.content??null,gift,coins,check:check.success,sourceEvent:id}]},'elections');
        return {election:row.id,targets,gain,success:check.success,spent:{minutes:30,item:gift,coins},worldEvent:{verb:'gift',target:targets[0],value:Math.max(0,gain),witnesses:targets,tags:['election',action]}};
    }
    if(args.operation!=='election_finish')throw Error('未知竞选操作');
    if(now<row.due)throw Error('尚未到投票日');
    let won=false,proposal=null,appointment=null,votes=[];
    if(!row.disqualified&&row.org){
        const org=organization(this,d.get('state'),row.org);if(d.get('state','location')!==org.seat)throw Error('须在组织议事地点开票');
        const result=electOrganizationLeader(d,this,org,id);won=result.status==='通过';proposal=result.id;votes=result.votes;
    }else if(!row.org){
        votes=voters(this,d.get('state'),row).map(v=>({voter:v,candidate:standing(this,d.get('state'),v,'player')>Math.max(0,standing(this,d.get('state'),v,row.incumbent))?'player':row.incumbent}));
        won=!row.disqualified&&votes.filter(v=>v.candidate==='player').length*2>votes.length;
        if(won){
            // Election nominates; the sourced superior still checks the existing office requirements.
            const result=governanceAction.call(this,d,{operation:'governance_apply',settlement:row.settlement,name:row.office},`${id}_appointment`);appointment=result.application;
            holdingSet(d,null,[...path(appointment),'election'],row.id,'elections');
        }
    }
    holdingSet(d,null,path(row.id),{...row,status:won?'当选':'落选',votes,proposal,appointment,finished:now},'elections');
    return {election:row.id,won,proposal,appointment,status:won?'当选':'落选',votes};
}
