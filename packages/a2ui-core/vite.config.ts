import catalog from './src/schemas/catalog.json' with { type: 'json' };
import common from './src/schemas/common_types.json' with { type: 'json' };
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
export default defineConfig({ plugins: [{name:'catalog',generateBundle(){this.emitFile({type:'asset',fileName:'catalog.json',source:JSON.stringify(catalog)});this.emitFile({type:'asset',fileName:'common_types.json',source:JSON.stringify(common)});}},dts({tsconfigPath:'./tsconfig.build.json', entryRoot:'src', exclude:['src/**/*.test.*']})], build: {lib:{entry:{index:'src/index.ts',demo:'src/demo.ts'},formats:['es'],fileName:(_format,entry)=>entry+'.js',cssFileName:'styles'},rollupOptions:{external:['react','react/jsx-runtime','vue','@eliteforge/agent-ui-a2ui-core']}} });
