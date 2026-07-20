import cfg from './config.mjs';
import scenes from './scenes.mjs';
import { build } from './engine.mjs';
import { readFileSync } from 'node:fs';

const narration = JSON.parse(readFileSync(new URL('./narration.json', import.meta.url), 'utf8'));
await build(cfg, narration, scenes);
