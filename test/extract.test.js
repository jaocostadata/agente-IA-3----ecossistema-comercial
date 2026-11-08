import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractAll, extractNome, extractMesesDesdeSaida, parseDurationMonths, intencoes } from '../src/agent/extract.js';

const REF = new Date('2026-11-08T12:00:00');

test('nome', () => {
  assert.equal(extractNome('meu nome é joão da silva'), 'João da Silva');
  assert.equal(extractNome('Maria'), 'Maria');
  assert.equal(extractNome('saí em março'), null);
  assert.equal(extractNome('boa noite'), null);
});

test('problemas e situação', () => {
  const e = extractAll('fui demitido mês passado e até agora não recebi minha rescisão', REF);
  assert.deepEqual(e.problemas, ['verbas_rescisorias']);
  assert.equal(e.situacao, 'desligado');
  assert.equal(e.mesesDesdeSaida, 1);
  assert.equal(extractAll('ainda trabalho lá e faço hora extra', REF).situacao, 'empregado');
  assert.ok(extractAll('a empresa nunca assinou minha carteira', REF).problemas.includes('sem_carteira'));
  assert.ok(extractAll('sofri um acidente e estou afastado pelo INSS', REF).problemas.includes('acidente_doenca'));
  assert.ok(extractAll('faz 2 anos que não tiro férias', REF).problemas.includes('ferias'));
});

test('datas e durações', () => {
  assert.equal(parseDurationMonths('2 anos e meio'), 30);
  assert.equal(parseDurationMonths('uns 8 meses'), 8);
  assert.equal(extractMesesDesdeSaida('fui mandada embora há 3 meses, trabalhei lá 2 anos', REF), 3);
  assert.equal(extractMesesDesdeSaida('faz 1 ano e meio que saí', REF), 18);
  assert.ok(Math.abs(extractMesesDesdeSaida('saí em março', REF) - 7.8) < 0.5);
});

test('intenções', () => {
  assert.ok(intencoes('quanto custa a consulta?').includes('preco'));
  assert.ok(!intencoes('quanto custa a consulta?').includes('agendar'));
  assert.ok(intencoes('quero falar com o advogado').includes('humano'));
  assert.ok(intencoes('não quero mais receber mensagens').includes('sair'));
});
