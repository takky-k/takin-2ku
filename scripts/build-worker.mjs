import {build} from 'esbuild';
await build({entryPoints:['worker/index.ts'],outfile:'.npm-cache/worker.js',bundle:true,minify:true,format:'esm',platform:'browser',target:'es2022'});
