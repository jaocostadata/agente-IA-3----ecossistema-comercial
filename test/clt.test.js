import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseClt, decodeHtmlBuffer } from '../src/knowledge/parse-clt.js';
import * as clt from '../src/knowledge/clt.js';

// HTML SINTÉTICO que imita a estrutura da página do Planalto (windows-1252, <strike>, notas de redação).
// Os textos são marcadores de teste, NÃO o texto da lei.
const HTML = `<html><head><meta http-equiv="Content-Type" content="text/html; charset=windows-1252"></head><body>
<p align="center">TÍTULO IV</p><p align="center">DO CONTRATO INDIVIDUAL DO TRABALHO</p>
<p align="center">CAPÍTULO V</p><p align="center">DA RESCISÃO</p>
<p><strike>Art. 477 - Versão antiga revogada do marcador quatrocentos e setenta e sete.</strike></p>
<p><a name="art477"></a>Art. 477.&nbsp; Marcador caput rescisão contrato extinção.  (Redação dada pela Lei nº 13.467, de 2017)</p>
<p>§ 6<sup>o</sup>&nbsp; Marcador prazo dez dias pagamento verbas rescisórias. (Redação dada pela Lei nº 13.467, de 2017)</p>
<p>I - marcador inciso um;</p>
<p>§ 8º - Marcador multa atraso pagamento. (Incluído pela Lei nº 7.855, de 1989)</p>
<p>Art. 482 - Marcador justa causa empregador rescisão motivos:</p>
<p>a) marcador alínea improbidade;</p>
<p>Art. 391-A.&nbsp; Marcador gestante estabilidade confirmação gravidez. (Incluído pela Lei nº 12.812, de 2013)</p>
<p>Parágrafo único. Marcador parágrafo único adoção.</p>
<p>Art. 5º (Revogado pela Lei nº 9.999, de 2000)</p>
<p>Art. 58 - A marcador duração jornada oito horas.</p>
<p>Art. 58-A.&nbsp; Marcador tempo parcial.</p>
</body></html>`;

const buf = Buffer.from(new TextDecoder('utf-8').decode(Buffer.from(HTML)), 'latin1');

test('parser: decodifica windows-1252, remove revogado e notas, separa parágrafos', () => {
  const html = decodeHtmlBuffer(buf);
  assert.match(html, /TÍTULO IV/);
  const d = parseClt(html);
  const nums = d.artigos.map((a) => a.numero);
  assert.deepEqual(nums, ['58', '58-A', '391-A', '477', '482']); // "Art. 58 - A ..." não vira 58-A // art. 5º revogado fica de fora
  const a477 = d.artigos.find((a) => a.numero === '477');
  assert.ok(!/antiga revogada/.test(a477.texto), 'texto tachado removido');
  assert.ok(!/Redação dada/.test(a477.texto), 'notas de redação removidas');
  assert.deepEqual(a477.paragrafos.map((p) => p.id), ['caput', '§6', '§8']);
  assert.match(a477.paragrafos[1].texto, /inciso um/);
  assert.match(a477.capitulo, /CAPÍTULO V — DA RESCISÃO/);
  assert.equal(d.artigos.find((a) => a.numero === '391-A').paragrafos[1].id, 'pu');
});

test('base: consulta por artigo, trecho, busca BM25 e fundamentos por tema', () => {
  clt.carregar(parseClt(decodeHtmlBuffer(buf)));
  assert.equal(clt.artigo('391-a').numero, '391-A');
  assert.equal(clt.trecho({ art: '477', par: '§8' }).rotulo, 'Art. 477, § 8º');
  assert.equal(clt.buscar('estabilidade da gestante gravidez')[0].numero, '391-A');
  const f = clt.fundamentos(['verbas_rescisorias']).map((x) => x.rotulo);
  assert.deepEqual(f, ['Art. 477, § 6º', 'Art. 477, § 8º']); // 467 não existe na base de teste -> ignorado
  assert.match(clt.contextoLLM(['justa_causa']), /\[CLT 482\]/);
  clt.carregar({ artigos: [] });
  assert.deepEqual(clt.fundamentos(['verbas_rescisorias']), []);
});
