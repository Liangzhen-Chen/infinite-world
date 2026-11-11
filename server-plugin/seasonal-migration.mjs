import {moveFishPopulation} from './stock.mjs';
import {populationHealth,takePopulation,addPopulation} from './population-health.mjs';
import {isPhysicallyDead} from './lifecycle-state.mjs';
import {migrationPath,speciesInHabitat} from './wildlife-range.mjs';
import {forestHabitatCapacity} from './forest-water.mjs';
import {populationCapacity,territoryCapacityFactor} from './ecology-dynamics.mjs';
import {sapient} from './wildlife-awakening.mjs';
import {declareHoldingWriter,holdingSet} from './holdings.mjs';
declareHoldingWriter('seasonal-migration',{kinds:['tamed_by'],entities:['wreck'],locations:true});
const alive=(d,id,a)=>a&&!isPhysicallyDead(null,d,id)&&a.hp>0;
const ecology=h=>['state','records',`ecology:${h}`];
export function reservedMigrationCapacity(d,habitat,species){
    return (d.get(...migrationPath())?.transit??[]).filter(t=>t.to===habitat&&t.species===species)
        .reduce((n,t)=>n+t.count+t.actors.filter(id=>alive(d,id,d.get('state','creatures',id))).length,0);
}
export function advanceSeasonalMigration(d,engine,day){
    const rules=engine.rules.wildlife?.migration;if(!rules)return;
    const m=structuredClone(d.get(...migrationPath()));
    if(!m||m.lastDay!==day-1)throw new Error('迁徙日结不连续，拒绝重算历史');
    const habitats=new Map(engine.rules.wildlife.habitats.map(h=>[h.id,h])),now=day+1;
    for(const field of ['departed','arrived','lost'])if(!Number.isSafeInteger(m[field])||m[field]<0)throw new Error('迁徙总账损坏');
    let pending=0;const ids=new Set(),actorIds=new Set();
    for(const t of m.transit){
        if(ids.has(t.id)||!Number.isSafeInteger(t.count)||t.count<0||!Array.isArray(t.actors)||!Number.isSafeInteger(t.arriveDay)||t.arriveDay<=t.departDay)throw new Error('迁徙行程损坏');
        populationHealth({count:t.count,health:t.health});
        ids.add(t.id);pending+=t.count+t.actors.length;
        if(!rules.routes.some(r=>r.id===t.route&&r.species===t.species&&r.from===t.from&&r.to===t.to))throw new Error('迁徙行程与世界归档不符');
        for(const id of t.actors){const actor=d.get('state','creatures',id);
            if(actorIds.has(id)||!actor||actor.species!==t.species||actor.migration!==t.id||actor.location!==null||actor.owner||actor.boss)throw new Error('迁徙个体身份冲突');actorIds.add(id);
        }
    }
    if(m.departed!==m.arrived+m.lost+pending)throw new Error('迁徙总数不守恒');
    const remaining=[];
    for(const t of m.transit){
        if(t.arriveDay>now){remaining.push(t);continue;}
        const r=structuredClone(d.get(...ecology(t.to))),p=r.populations[t.species];
        if(!p)throw new Error('迁入地尚未迁移物种记录');
        moveFishPopulation(d,engine,t.species,`migration:${t.id}`,habitats.get(t.to).location,t.count,t.id);
        addPopulation(p,t.health??{S:t.count,I:0,R:0});p.immigrated+=t.count;d.set(ecology(t.to),r);m.arrived+=t.count;
        for(const id of t.actors){const actor=d.get('state','creatures',id);
            // A dead traveller stays dead; no revived replacement enters the pool.
            if(!alive(d,id,actor)){m.lost++;continue;}
            holdingSet(d,null,['state','creatures',id,'location'],habitats.get(t.to).location,'seasonal-migration');
            holdingSet(d,null,['state','creatures',id,'ecology'],t.to,'seasonal-migration');d.remove(['state','creatures',id,'migration']);m.arrived++;
        }
    }
    m.transit=remaining;d.set(migrationPath(),m);
    const season=engine.calendar(now*1440).season;
    for(const route of [...rules.routes].sort((a,b)=>a.id.localeCompare(b.id,'en'))){
        if(now%360!==route.departDay)continue;
        if(route.path.some(id=>engine.world.routes.find(r=>r.id===id).closedSeasons.includes(season)))continue;
        const home=habitats.get(route.from),destination=habitats.get(route.to),source=structuredClone(d.get(...ecology(route.from))),p=source.populations[route.species];
        const actors=Object.entries(d.get('state','creatures')??{}).filter(([id,a])=>a.species===route.species&&a.ecology===route.from&&a.location===home.location&&!a.owner&&!sapient(a)&&!a.boss&&!a.lair&&alive(d,id,a)).sort(([a],[b])=>a.localeCompare(b,'en'));
        const target=d.get(...ecology(route.to),'populations',route.species),definition=engine.byId.get(route.species);
        const present=Object.entries(d.get('state','creatures')??{}).filter(([id,a])=>a.species===route.species&&a.location===destination.location&&!a.owner&&!sapient(a)&&alive(d,id,a)).length;
        // Seasonal arrivals share the same room as daily ecology and territory
        // displacement; otherwise a displaced cohort can immediately move back.
        const populations=d.get(...ecology(route.to),'populations'),catalog=speciesInHabitat(engine.rules,engine.world.monsters,destination.id);
        const capacity=populationCapacity(d,engine,destination,definition,catalog,populations,forestHabitatCapacity(engine,d.get('state'),destination,definition)*territoryCapacityFactor(d,engine,destination),season);
        const room=Math.max(0,capacity-target.count-present-reservedMigrationCapacity(d,route.to,route.species));
        const amount=Math.min(room,Math.floor((p.count+actors.length)*route.fraction));if(!amount)continue;
        const unseen=Math.min(p.count,amount),travellers=actors.slice(0,amount-unseen).map(([id])=>id),id=`${route.id}:${now}`;
        moveFishPopulation(d,engine,route.species,home.location,`migration:${id}`,unseen,id);
        const health=takePopulation(p,unseen);p.emigrated+=unseen;d.set(ecology(route.from),source);
        for(const id of travellers){holdingSet(d,null,['state','creatures',id,'location'],null,'seasonal-migration');holdingSet(d,null,['state','creatures',id,'migration'],`${route.id}:${now}`,'seasonal-migration');}
        m.transit.push({id,route:route.id,species:route.species,from:route.from,to:route.to,departDay:now,arriveDay:now+route.travelDays,count:unseen,...(health.I||health.R||health.disease||health.diseaseRemainders?{health}:{}),actors:travellers});
        m.departed+=amount;d.set(migrationPath(),m);
    }
    m.lastDay=day;d.set(migrationPath(),m);
}
