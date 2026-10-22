// Corpus-overfit guard. The A3 intent corpus (tests/fixtures/a3-intents*.json) is a test set: engine
// code and the action catalog must not be keyed to its wording. Two scans fail the run when they hit:
//  1. server-plugin/ literals (Chinese sentences, regex alternatives, snake_case ids) that occur in the
//     corpus but nowhere in world/ or docs/架构设计/ (the loader contract may share ids with the corpus);
//  2. world/actions/*.json synonyms of 4+ characters that occur verbatim in the corpus and are not already
//     in the master catalog (a synonym added to make a corpus row route is a memorised answer).
// Ordinary wording (UI status text, engine system ids) is listed with a reason in
// tests/fixtures/overfit-allowlist.json; an entry that no longer matches anything must be removed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const walk=dir=>fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(dir,entry.name)):[path.join(dir,entry.name)]);
const slash=file=>file.split(path.sep).join('/');
const han=/[一-鿿]{2,}/;
const lineOf=(source,index)=>source.slice(0,index).split('\n').length;

// sources: {corpus, legit, contract} are plain strings; files: Map(file -> source) of engine modules.
export function scanEngineLiterals({corpus,legit,contract},files){
 const suspicious=text=>corpus.includes(text)&&!legit.includes(text);
 // snake_case ids are shared vocabulary when the setup loader contract defines them; ids found only in corpus rows are test wording.
 const suspiciousId=text=>suspicious(text)&&!contract.includes(text);
 const hits=[];
 for(const [file,source] of files){
  for(const match of source.matchAll(/(['"`])((?:(?!\1)[^\\\n]){3,40})\1/g)){
   const literal=match[2];
   const wording=han.test(literal)&&suspicious(literal),id=/^[a-z]+(?:_[a-z0-9]+)+$/.test(literal)&&suspiciousId(literal);
   if(wording||id)hits.push({file,line:lineOf(source,match.index),token:literal});
  }
  for(const match of source.matchAll(/\/((?:[^/\\\n]|\\.){3,80})\/[gimsuy]*/g)){
   const alternatives=match[1].split('|').map(part=>part.replace(/[()^$\\[\]?*+.]/g,'')).filter(part=>han.test(part));
   const bad=alternatives.filter(suspicious);
   if(bad.length)hits.push({file,line:lineOf(source,match.index),token:`/${bad.join('|')}/`});
  }
 }
 return hits;
}

// catalog/master: arrays of action rows; a synonym is new when master's row for the same id lacks it.
export function scanNewSynonyms(corpus,catalog,master){
 const before=new Map(master.map(action=>[action.id,new Set(action.synonyms??[])]));
 const hits=[];
 for(const action of catalog)for(const synonym of action.synonyms??[]){
  if([...synonym].length>=4&&corpus.includes(synonym)&&!before.get(action.id)?.has(synonym))hits.push({file:`world/actions (${action.id})`,line:0,token:synonym});
 }
 return hits;
}

const allowlist=JSON.parse(read('tests/fixtures/overfit-allowlist.json'));
const allowed=(hit,entries=allowlist.entries)=>entries.some(entry=>entry.token===hit.token&&(!entry.file||hit.file===entry.file));
const format=hits=>hits.map(hit=>`${hit.file}:${hit.line}  ${hit.token}`).join('\n');

const corpus=fs.readdirSync(path.join(root,'tests/fixtures')).filter(file=>/^a3-intents.*\.json$/.test(file)).map(file=>read(`tests/fixtures/${file}`)).join('\n');
const legit=[...walk('world'),...walk('docs/架构设计')].filter(file=>/\.(json|md|mjs)$/.test(file)).map(read).join('\n');
const contract=[...walk('tools/a3-setup').map(read),fs.existsSync(path.join(root,'docs/A3-接点归属2.md'))?read('docs/A3-接点归属2.md'):''].join('\n');
const engineFiles=new Map(walk('server-plugin').filter(file=>file.endsWith('.mjs')).map(file=>[slash(file),read(file)]));
let engineHits;const literalHits=()=>engineHits??=scanEngineLiterals({corpus,legit,contract},engineFiles);

test('overfit guard: no server-plugin literal exists only in the A3 intent corpus',()=>{
 const hits=literalHits().filter(hit=>!allowed(hit));
 assert.deepEqual(hits,[],`engine literals keyed to corpus wording (add to world/ data or the docs, or justify in tests/fixtures/overfit-allowlist.json):\n${format(hits)}`);
});

function newSynonymHits(){
 const show=spawnSync('git',['show','master:world/actions/core.json'],{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024});
 assert.equal(show.status,0,`the master catalog must be readable to detect new synonyms: ${show.stderr}`);
 const open=spawnSync('git',['show','master:world/actions/open.json'],{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024});
 const master=[...JSON.parse(show.stdout).actions,...open.status===0?JSON.parse(open.stdout).actions:[]];
 const catalog=fs.readdirSync(path.join(root,'world/actions')).filter(file=>file.endsWith('.json')).flatMap(file=>JSON.parse(read(`world/actions/${file}`)).actions);
 return scanNewSynonyms(corpus,catalog,master);
}
test('overfit guard: world/actions synonyms of 4+ characters are not copied from the corpus',()=>{
 const hits=newSynonymHits().filter(hit=>!allowed(hit));
 assert.deepEqual(hits,[],`new catalog synonyms copied verbatim from the corpus (remove them or justify in tests/fixtures/overfit-allowlist.json):
${format(hits)}`);
});

test('overfit guard: scanners find planted corpus wording and ignore shared vocabulary (positive and negative controls)',()=>{
 const sources={corpus:'我要把罐子推进深井里 snake_only_here shared_in_world 通用说法',legit:'shared_in_world 通用说法',contract:''};
 const planted=new Map([['x.mjs','const a="我要把罐子推进深井里";const id="snake_only_here";const ok="shared_in_world";const text="通用说法";if(/推进深井|其他/.test(a))return;']]);
 const tokens=scanEngineLiterals(sources,planted).map(hit=>hit.token).sort();
 assert.deepEqual(tokens,['/推进深井/','snake_only_here','我要把罐子推进深井里'].sort());
 // The loader contract may legitimately share an id with the corpus.
 assert.deepEqual(scanEngineLiterals({...sources,contract:'snake_only_here'},new Map([['y.mjs','const id="snake_only_here";']])),[]);
 // New synonyms: a corpus sentence is a hit, an old one or a short common verb is not.
 const catalog=[{id:'a',synonyms:['买','推进深井里','已有同义词','新增']}],master=[{id:'a',synonyms:['已有同义词']}];
 assert.deepEqual(scanNewSynonyms('买 推进深井里 已有同义词 新增',catalog,master).map(hit=>hit.token),['推进深井里']);
 assert.deepEqual(scanNewSynonyms('完全无关',catalog,master),[]);
 // An allowlist entry applies to its own token only.
 const entries=[{token:'已任命',file:'server-plugin/governance.mjs',reason:'x'}];
 assert.equal(allowed({file:'server-plugin/governance.mjs',token:'已任命'},entries),true);
 assert.equal(allowed({file:'server-plugin/other.mjs',token:'已任命'},entries),false);
 assert.equal(allowed({file:'server-plugin/governance.mjs',token:'已过期'},entries),false);
});

test('overfit guard: every allowlist entry carries a reason and still matches a real hit',()=>{
 assert.ok(allowlist.entries.length>0);
 for(const entry of allowlist.entries)assert.ok(typeof entry.reason==='string'&&entry.reason.trim().length>=8&&typeof entry.token==='string'&&entry.token,`entry needs token and reason: ${JSON.stringify(entry)}`);
 const hits=[...literalHits(),...newSynonymHits()];
 const stale=allowlist.entries.filter(entry=>!hits.some(hit=>hit.token===entry.token&&(!entry.file||hit.file===entry.file)));
 assert.deepEqual(stale,[],'stale allowlist entries must be removed');
});
