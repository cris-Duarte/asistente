import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    server: 'src/server.ts',
    'owner-init': 'src/cli/owner-init.ts',
  },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  noExternal: [
    '@productivity-assistant/db-schema',
    '@productivity-assistant/shared',
  ],
});
