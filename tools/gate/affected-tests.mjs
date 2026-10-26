// Retired import-only CLI; historical invocation delegates to the unified selector.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from './test-impact/select.mjs';
main([process.cwd(), process.argv[2] || 'master', '--map',
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'tia-map.json'), ...process.argv.slice(3)]);
