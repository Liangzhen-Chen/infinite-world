import { legacyReplayReducer } from './migrations.mjs';
import {planR1}from'./migrations/r1.mjs';
import {applyPatches}from'./storage.mjs';
export function campaignReducer(engine) {
    return async(document,input,options={})=>{
        if(input.event||input.type==='world_migration')return legacyReplayReducer(document,input);
        if(input.type==='schema_migration'){
            const raw=engine.initialFromLegacy({version:1,state:document.state,memories:document.memories,manualPins:document.manualPins},input.randomSeed,{prepare:false});
            const migration=engine.compat||input.release!=='R1'?{patches:[],report:null}:planR1(raw,engine.world),converted=applyPatches(raw,migration.patches);
            return {patches:Object.entries(converted).map(([key,value])=>({op:'set',path:[key],value})),result:{migration:true,worldVersion:engine.world.version,releaseReport:migration.report}};
        }
        return engine.reduce(document,input,options);
    };
}
