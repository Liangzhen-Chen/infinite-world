import test from 'node:test';
import assert from 'node:assert/strict';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';

test('等时路线保留世界地点顺序和原路费；世界改路后下次查询重新建图',async()=>{
 const world=await loadWorld();delete world.rules.weather;
 world.locations=['loc_start','loc_earlier','loc_later','loc_end'].map(id=>({id,name:id}));
 const edge=(id,from,to,toll)=>({id,from,to,toll,lengthKm:0,modes:['walk'],closedSeasons:[]});
 // Discover the later-ordered node first. A frontier insertion-order tie
 // would incorrectly pick its route and charge a different real toll.
 world.routes=[edge('late_1','loc_start','loc_later',7),edge('late_2','loc_later','loc_end',7),
  edge('early_1','loc_start','loc_earlier',1),edge('early_2','loc_earlier','loc_end',2)];
 const engine=new WorldEngine(world);
 assert.deepEqual(engine.route('loc_start','loc_end','walk',0),{minutes:2,movingMinutes:2,cost:3,edges:['early_1','early_2']});
 world.routes[2].closedSeasons=[0];
 assert.deepEqual(engine.route('loc_start','loc_end','walk',0),{minutes:2,movingMinutes:2,cost:14,edges:['late_1','late_2']});
 assert.deepEqual(engine.route('loc_start','loc_end','walk',90*1440),{minutes:2,movingMinutes:2,cost:3,edges:['early_1','early_2']});
});
