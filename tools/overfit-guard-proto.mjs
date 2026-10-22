// Prototype of the corpus-overfit guard: report string literals and regex
// alternatives in server-plugin/ that appear in the A3 intent corpus but
// nowhere in world/ or docs/架构设计/ (i.e. engine code keyed to test wording).
import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2];
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const walk = dir => fs.readdirSync(path.join(root, dir), {withFileTypes: true})
    .flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);

const corpus = fs.readdirSync(path.join(root, 'tests/fixtures'))
    .filter(file => /^a3-intents/.test(file))
    .map(file => read(path.join('tests/fixtures', file))).join('\n');
const legit = [...walk('world'), ...walk('docs/架构设计')]
    .filter(file => /\.(json|md|mjs)$/.test(file)).map(read).join('\n');
const suspicious = text => corpus.includes(text) && !legit.includes(text);
// snake_case ids are shared vocabulary when the setup loader contract or its
// field table defines them; ids found only in corpus rows are test wording.
const contract = [...walk('tools/a3-setup').map(read), ...(fs.existsSync(path.join(root, 'docs/A3-接点归属2.md')) ? [read('docs/A3-接点归属2.md')] : [])].join('\n');
const suspiciousId = text => suspicious(text) && !contract.includes(text);
const lineOf = (src, index) => src.slice(0, index).split('\n').length;

const hits = new Set();
for (const file of walk('server-plugin').filter(file => file.endsWith('.mjs'))) {
    const src = read(file);
    for (const match of src.matchAll(/(['"`])((?:(?!\1)[^\\\n]){3,40})\1/g)) {
        const literal = match[2];
        // Natural-language wording is the overfit signal; snake_case ids may be
        // shared vocabulary between the loader contract and the corpus.
        const wording = /[一-鿿]{2,}/.test(literal) && suspicious(literal);
        const id = /^[a-z]+(?:_[a-z0-9]+)+$/.test(literal) && suspiciousId(literal);
        if (wording || id) hits.add(`${file}:${lineOf(src, match.index)}  '${literal}'`);
    }
    for (const match of src.matchAll(/\/((?:[^/\\\n]|\\.){3,80})\/[gimsuy]*/g)) {
        const alternatives = match[1].split('|').map(part => part.replace(/[()^$\\[\]?*+.]/g, ''))
            .filter(part => /[一-鿿]{2,}/.test(part));
        const bad = alternatives.filter(suspicious);
        if (bad.length) hits.add(`${file}:${lineOf(src, match.index)}  /${bad.join('|')}/`);
    }
}
console.log(`${hits.size} hits`);
for (const hit of hits) console.log(hit);
