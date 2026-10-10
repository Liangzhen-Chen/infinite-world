import { legacyReplayReducer } from './migrations.mjs';
export function campaignReducer(engine) {
    return async(document,input,options={})=>{
        if(input.event||input.type==='world_migration')return legacyReplayReducer(document,input);
        if(input.type==='schema_migration'){
            const converted=engine.initialFromLegacy({version:1,state:document.state,memories:document.memories,manualPins:document.manualPins},input.randomSeed);
            return {patches:Object.entries(converted).map(([key,value])=>({op:'set',path:[key],value})),result:{migration:true,worldVersion:engine.world.version}};
        }
        return engine.reduce(document,input);
    };
}
