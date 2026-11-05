import fs from 'node:fs/promises';
import path from 'node:path';
import { digest, atomicJSON } from './storage.mjs';
import { WorldEngine } from './engine.mjs';
const pendingWrites=new Map();
export class WorldRegistry {
    // The engine works on its own runtime copy (A1), so the registry keeps the
    // archived world object whose digest is the hash; exports return that one.
    constructor(root){this.root=path.resolve(root);this.engines=new Map();this.archived=new Map();}
    async put(world){
        const hash=digest(world);
        const file=path.join(this.root,`${hash}.json`);
        let pending=pendingWrites.get(file);
        if(!pending){
            pending=(async()=>{
                await fs.mkdir(this.root,{recursive:true});
                try{const existing=JSON.parse(await fs.readFile(file,'utf8'));if(digest(existing)!==hash)throw Error('世界归档损坏');}
                catch(error){if(error.code!=='ENOENT')throw error;await atomicJSON(file,world);}
            })();pendingWrites.set(file,pending);
        }
        try{await pending;}finally{if(pendingWrites.get(file)===pending)pendingWrites.delete(file);}
        this.archived.set(hash,world);this.engines.set(hash,new WorldEngine(world));return hash;
    }
    async get(hash){
        if(typeof hash!=='string'||!/^[a-f0-9]{64}$/.test(hash))throw Error('世界版本校验值无效');
        if(this.engines.has(hash))return this.engines.get(hash);
        const world=JSON.parse(await fs.readFile(path.join(this.root,`${hash}.json`),'utf8'));
        if(digest(world)!==hash)throw Error('战役世界版本校验失败');
        const engine=new WorldEngine(world);this.archived.set(hash,world);this.engines.set(hash,engine);return engine;
    }
    // The archived world itself (digest equals hash), not the engine's runtime copy.
    async world(hash){await this.get(hash);return this.archived.get(hash);}
}
