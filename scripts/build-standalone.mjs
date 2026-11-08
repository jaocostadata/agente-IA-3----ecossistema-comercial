// Gera dist/sinapta-demo.html: um único arquivo HTML com a demo completa (abre com duplo clique, sem servidor).
// Requer esbuild: `npm i -D esbuild` (ou ESBUILD=/caminho/para/esbuild).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const esbuild = process.env.ESBUILD_MODULE ? require(process.env.ESBUILD_MODULE) : await import('esbuild');

const stub = {
  name: 'node-stubs',
  setup(b) {
    b.onResolve({ filter: /^node:/ }, (a) => ({ path: a.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: 'export const existsSync=()=>false,readFileSync=()=>"",writeFileSync=()=>{},mkdirSync=()=>{},dirname=()=>"";export default {existsSync,readFileSync,writeFileSync,mkdirSync,dirname};',
      loader: 'js',
    }));
  },
};

const r = await esbuild.build({
  entryPoints: ['web/standalone.js'],
  bundle: true, write: false, format: 'iife', target: 'es2020', minify: true,
  banner: { js: 'var process={env:{}};' },
  plugins: [stub],
});
const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync('public/style.css', 'utf8');
let html = fs.readFileSync('public/index.html', 'utf8')
  .replace('<link rel="stylesheet" href="/style.css" />', `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="/app.js"></script>', () => `<script>\n${js}\n</script>`);
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync(path.join('dist', 'sinapta-demo.html'), html);
console.log(`dist/sinapta-demo.html gerado (${(html.length / 1024).toFixed(0)} KB)`);
