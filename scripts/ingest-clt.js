// Importa a CLT oficial para a base de conhecimento do agente.
// Uso:
//   node scripts/ingest-clt.js                      (baixa de planalto.gov.br)
//   node scripts/ingest-clt.js caminho/clt.htm      (arquivo salvo pelo navegador: Ctrl+S)
import fs from 'node:fs';
import { parseClt, decodeHtmlBuffer } from '../src/knowledge/parse-clt.js';

const URL_CLT = 'https://www.planalto.gov.br/ccivil_03/decreto-lei/del5452compilado.htm';
const arg = process.argv[2] || URL_CLT;

let buf;
if (/^https?:\/\//.test(arg)) {
  console.log(`Baixando ${arg} …`);
  try {
    const res = await fetch(arg);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    buf = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    console.error(`❌ Não foi possível baixar a CLT (${e.cause?.code || e.message}).`);
    console.error('   Alternativa: abra o link no navegador, salve a página (Ctrl+S → "Página da Web, somente HTML")');
    console.error('   e rode:  node scripts/ingest-clt.js caminho/para/del5452compilado.htm');
    process.exit(1);
  }
} else {
  buf = fs.readFileSync(arg);
}

const data = parseClt(decodeHtmlBuffer(buf), { fonte: URL_CLT });
if (data.totalArtigos < 500) {
  console.error(`⚠️  Só ${data.totalArtigos} artigos encontrados — o arquivo parece incompleto. Nada foi gravado.`);
  process.exit(1);
}
const out = 'src/knowledge/clt-data.js';
fs.writeFileSync(out, `// GERADO por scripts/ingest-clt.js — não editar à mão.\n// Fonte: ${URL_CLT}\nexport default ${JSON.stringify(data)};\n`);
const chk = ['3', '58', '59', '477', '482', '483', '391-A'].map((n) => `${n}:${data.artigos.some((a) => a.numero === n) ? 'ok' : 'FALTA'}`);
console.log(`✅ ${data.totalArtigos} artigos gravados em ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
console.log(`   Conferência: ${chk.join('  ')}`);
