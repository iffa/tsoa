import { globSync } from 'node:fs';
import { rm } from 'node:fs/promises';

await Promise.all(globSync('fixtures/**/routes.ts').map(file => rm(file)));
