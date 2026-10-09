import fs from 'node:fs';
import path from 'node:path';
const root=fs.realpathSync(path.resolve(import.meta.dirname,'..'));
const entry=JSON.parse(fs.readFileSync(path.join(root,'跑团资料/战役入口.json'),'utf8'));
const source=fs.realpathSync(path.join(root,'SillyTavern/data/default-user/chats',entry.avatar.slice(0,-4)));
const destination=path.join(root,'logs/test-campaigns');
if(!source.toLowerCase().startsWith(root.toLowerCase()+path.sep))throw new Error('Unexpected archive source');
fs.mkdirSync(destination,{recursive:true});
let archived=0;
for(const file of fs.readdirSync(source)) {
    if(!/^(配置验证|导入存档)-\d+(?:-[a-z0-9]+)?\.jsonl$/.test(file))continue;
    const originalPath=path.join(source,file);
    const transcript=fs.readFileSync(originalPath,'utf8');
    const rows=transcript.split('\n').filter(Boolean).map(v=>JSON.parse(v));
    if(rows.find(v=>v.is_user)?.mes !== '我对林穗说：“我先住一晚，六枚铜币。”我数出六枚铜币交给她，确认她收下，再把行囊拿到她安排的房间。')continue;
    fs.copyFileSync(originalPath,path.join(destination,file));
    fs.unlinkSync(originalPath);
    archived++;
}
const extension=path.join(root,'SillyTavern/public/scripts/extensions/third-party/infinite-fields');
const portable=path.join(root,'跑团资料/无限原野扩展');
fs.mkdirSync(portable,{recursive:true});
for(const file of ['manifest.json','index.js','core.js','style.css','seed.json'])fs.copyFileSync(path.join(extension,file),path.join(portable,file));
console.log(JSON.stringify({archived,portableSourceSaved:true}));
