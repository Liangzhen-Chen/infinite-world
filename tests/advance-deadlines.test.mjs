import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceRegistry} from '../server-plugin/advance-registry.mjs';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {scheduleAt} from '../server-plugin/npc-schedule.mjs';
import {educationCourses} from '../server-plugin/education-state.mjs';
import {applyPatches,withRecordIndex} from '../server-plugin/storage.mjs';
import {legacy} from './farm-pests-fixture.mjs';

test('legacy systems declare actual pending deadlines',()=>{
    const state={records:{
        application:{category:'upper_application',status:'待审定',due:97},
        old:{category:'upper_application',status:'已任命',due:40},
        news:{category:'society_news',status:'在途',arrivesAt:85},
        agreement:{category:'society_agreement',status:'有效',nextDue:95,expires:120},
    },effects:{summon:{kind:'summon',expires:100,nextUpkeep:80}},player:{status:'濒死',dyingSince:60},obligations:{a:{type:'送货',status:'待履行',deadline:90},closed:{type:'送货',status:'已履行',deadline:75}}};
    const d={get:(...path)=>path.slice(1).reduce((v,key)=>v?.[key],state)};
    const engine={rules:{death:{dyingMinutes:30}}};
    const next=id=>advanceRegistry.find(s=>s.id===id).nextMinute(engine,d,70);
    assert.equal(next('upper_appointments'),97);assert.equal(next('society_news'),85);
    assert.equal(next('summons'),80);assert.equal(next('effect_expiry'),100);
    assert.equal(next('dying'),90);assert.equal(next('deliveries'),90);
});

test('identical adjacent routine slots keep one boundary and preserve changed services',async()=>{
    const world=await loadWorld(),id='npc_hw_ayan',npc=world.npcs.find(n=>n.id===id),location='loc_hw_fields';
    npc.schedule={default:[
        {start:0,end:600,location,activity:'same',services:[]},
        {start:600,end:720,location,activity:'same',services:[]},
        {start:720,end:1440,location,activity:'same',services:['trade']},
    ]};
    const engine=new WorldEngine(world),doc=engine.createCharacter(legacy,{},'r39-slots');
    engine.educationCourseContext=[];
    const slot=scheduleAt(engine,id,550,doc.state);
    assert.equal(slot.until,720);assert.deepEqual(slot.services,[]);
    assert.deepEqual(scheduleAt(engine,id,720,doc.state).services,['trade']);
    npc.schedule.default[1].production=true;
    assert.equal(scheduleAt(engine,id,550,doc.state).until,600,'a production flag change still owns its boundary');
});

test('course reuse matches fresh derivation after movement, learning and a pending contract start',async()=>{
    const engine=new WorldEngine(await loadWorld());let doc=engine.createCharacter(legacy,{},'r39-courses');
    const check=()=>{
        const cached=withRecordIndex(()=>educationCourses(engine,doc.state));
        assert.deepEqual(cached,educationCourses(engine,doc.state));return cached;
    };
    const first=check(),teacher=first.find(c=>c.teacher)?.teacher;assert.ok(teacher);
    doc=applyPatches(doc,[{op:'set',path:['state','npcs',teacher,'activity'],value:'temporary movement'}]);check();
    doc=applyPatches(doc,[{op:'set',path:['state','npcs',teacher,'skills','skill_literacy'],value:0}]);check();
    const starts=doc.state.minute+5;
    doc=applyPatches(doc,[{op:'set',path:['state','records','r39-course-contract'],value:{id:'r39-course-contract',category:'contract',kind:'workshop',status:'有效',education:1,worker:teacher,owner:'player',location:first[0].location,task:'授业',starts,createdAt:starts,deadline:starts+1440,workMinutes:480}}]);
    check();doc=applyPatches(doc,[{op:'set',path:['state','minute'],value:starts}]);check();
});
