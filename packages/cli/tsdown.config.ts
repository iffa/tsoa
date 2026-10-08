import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: { index: 'src/index.ts', bin: 'src/bin.ts' },
  platform: 'node',
  target: 'node24',
  format: 'esm',
  fixedExtension: false,
  dts: { resolver: 'tsc' },
  sourcemap: true,
  copy: [{ from: 'src/routeGeneration/templates/express.hbs', to: 'dist/templates' }],
  deps: { neverBundle: true },
});
