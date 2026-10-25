import {isPhysicallyDead} from './lifecycle-state.mjs';
import {reputationFactions,reputationSettlements}from'./reputation-registry.mjs';
import {digest} from './storage.mjs';
import {standing} from './standing.mjs';

const path=id=>['state','records',id];
const key=(...parts)=>digest(parts).slice(0,24);
const awake=(state,id,n)=>n&&n.location&&!isPhysicallyDead(null,state,id)&&!['濒死','昏迷','患病'].includes(n.status)&&!/睡眠|睡觉|熟睡/.test(n.activity??'');

export function settlementAt(engine,location) {
    const allowed=new Set(reputationSettlements(engine)),seen=new Set();
    while(location&&!seen.has(location)) {
        if(allowed.has(location))return location;
        seen.add(location);location=engine.byId.get(location)?.parent;
    }
    return null;
}

// The canonical notification must exist in the case. A retold memory cannot
// introduce a new judgment or turn the listener into an eyewitness.
export function observeLegalReputation(d,engine,npc,memory,location=memory.location) {
    const row=d.get(...path(memory.legalCase)),event=row?.reputationHistory?.find(event=>event.sourceEvent===memory.sourceEvent)??row?.reputationEvents?.[memory.legalStage];
    if(row?.category!=='legal_case'||!event||event.sourceEvent!==memory.sourceEvent||event.stage!==memory.legalStage||event.minute>memory.minute)return;
    const rules=engine.rules.reputation;
    if(!rules)return;
    const local=settlementAt(engine,location),scopes=[];
    if(local)scopes.push({scope:'settlement',id:local,sign:1,source:rules.source});
    for(const faction of reputationFactions(engine,d.get('state'))) {
        if(!(faction.members??[]).includes(npc)||!engine.byId.has(faction.id))continue;
        // The member's faction judges a case by how it now regards the case's faction.
        scopes.push({scope:'faction',id:faction.id,sign:row.faction&&standing(engine,d.get('state'),faction.id,row.faction)<0?-1:1,source:faction.source});
    }
    for(const scope of scopes) {
        const id=`reputation:${key(row.offender,scope.scope,scope.id)}`;
        const prior=d.get(...path(id));
        if(prior&&prior.category!=='reputation')throw Error('声望账记录编号冲突');
        const account=prior??{category:'reputation',subject:row.offender,scope:scope.scope,target:scope.id,reputation:0,fame:0,notoriety:0,deltas:[]};
        if(account.deltas.some(delta=>delta.sourceEvent===event.sourceEvent&&delta.case===row.id))continue;
        const convicted=account.deltas.find(delta=>delta.case===row.id&&delta.sourceEvent===event.reverses&&delta.stage==='conviction');
        const corrected=account.deltas.some(delta=>delta.case===row.id&&delta.reverses===event.sourceEvent&&delta.stage==='overturned');
        const base=(scope.scope==='settlement'?(rules.settlementDeltas?.[scope.id]?.[memory.legalStage]??(scope.id!==row.settlement?rules.remoteDeltas?.[memory.legalStage]:null)):null)??rules.deltas?.[memory.legalStage];
        if(!base&&memory.legalStage!=='overturned')continue;
        const delta=memory.legalStage==='overturned'
            ?{reputation:0-(convicted?.reputation??0),fame:0-(convicted?.fame??0),notoriety:0-(convicted?.notoriety??0)}
            :memory.legalStage==='conviction'&&corrected?{reputation:0,fame:0,notoriety:0}
            :{reputation:base.reputation*scope.sign,fame:scope.sign<0?base.notoriety:base.fame,notoriety:scope.sign<0?base.fame:base.notoriety};
        d.set(path(id),{...account,reputation:account.reputation+delta.reputation,fame:account.fame+delta.fame,notoriety:account.notoriety+delta.notoriety,
            deltas:[...account.deltas,{...delta,case:row.id,stage:memory.legalStage,sourceEvent:event.sourceEvent,minute:memory.minute,
                reverses:event.reverses??null,observer:npc,sourceType:memory.sourceType,heardFrom:memory.heardFrom??null,ruleSource:scope.source}]});
    }
}

export function recordLegalNotification(d,engine,row,stage,eventId,observers,{fresh=false,location=d.get('state','location')}={}) {

    const minute=d.get('state','minute'),sourceEvent=`${eventId}:law:${stage}`;
    const old=d.get(...path(row.id));
    const event=(!fresh&&old.reputationEvents?.[stage])||{sourceEvent,stage,minute,location,
        ...(stage==='overturned'?{reverses:old.reputationEvents?.conviction?.sourceEvent}:{} )};
    if(fresh||!old.reputationEvents?.[stage])d.set(path(row.id),{...old,procedureVersion:1,reputationEvents:{...old.reputationEvents,[stage]:event},reputationHistory:[...old.reputationHistory??[],event]});
    for(const npc of new Set(observers)) {
        if(!awake(d.get('state'),npc,d.get('state','npcs',npc))||d.get('state','npcs',npc,'location')!==event.location)continue;
        const memoryId=`legal_${key(event.sourceEvent,npc)}`;
        if(d.get('state','npcs',npc,'memoryStream')?.some(memory=>memory.id===memoryId))continue;
        const memory={id:memoryId,sourceEvent:event.sourceEvent,kind:'law',minute,location:event.location,
            participants:[row.offender,npc],sourceType:'目击',visibility:'public',salience:3,emotion:'留意',
            legalCase:row.id,legalStage:stage,
            content:stage==='conviction'?`${row.id}依${row.law}作出裁判，罚款${row.judgment.fine}铜，尚未履行。`
                :stage==='overturned'?`${row.id}复核证据不足，原裁判已撤销。`:`${row.id}的罚款或服役及赔偿义务已履行。`};
        d.set(['state','npcs',npc,'memoryStream'],[...d.get('state','npcs',npc,'memoryStream')??[],memory]);
        observeLegalReputation(d,engine,npc,memory);
    }
    return event;
}

export function reputationView(document) {
    return Object.values(document.state.records??{}).filter(row=>row?.category==='reputation'&&row.subject==='player').map(row=>structuredClone(row));
}
