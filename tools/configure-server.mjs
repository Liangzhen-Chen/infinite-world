import fs from 'node:fs';
import path from 'node:path';
import YAML from '../SillyTavern/node_modules/yaml/dist/index.js';

const root = path.resolve(import.meta.dirname, '..', 'SillyTavern');
const configPath = path.join(root, 'config.yaml');
const config = YAML.parse(fs.readFileSync(configPath, 'utf8'));
config.listen = false;
config.port = 8000;
config.browserLaunch.enabled = false;
config.allowKeysExposure = false;
config.logging.minLogLevel = 1;
config.backups.chat.enabled = true;
config.backups.chat.maxTotalBackups = -1;
fs.writeFileSync(configPath, YAML.stringify(config));
console.log('Configured loopback-only server and chat backups.');
