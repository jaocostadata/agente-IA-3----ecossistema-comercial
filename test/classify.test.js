import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../src/agent/classify.js';

test('quente: demissão recente, vínculo longo, com provas', () => {
  const c = classify({ problemas: ['verbas_rescisorias'], situacao: 'desligado', mesesDesdeSaida: 1, tempoVinculoMeses: 36, provas: true });
  assert.equal(c.temperatura, 'quente');
});

test('frio: prescrito (> 2 anos)', () => {
  const c = classify({ problemas: ['horas_extras', 'assedio'], situacao: 'desligado', mesesDesdeSaida: 30, tempoVinculoMeses: 48, provas: true });
  assert.equal(c.temperatura, 'frio');
  assert.equal(c.prescricao.status, 'prescrito');
});

test('urgente: prazo prescricional crítico', () => {
  const c = classify({ problemas: ['justa_causa'], situacao: 'desligado', mesesDesdeSaida: 22 });
  assert.equal(c.urgente, true);
  assert.equal(c.prescricao.status, 'critico');
});

test('urgente: acidente de trabalho', () => {
  assert.equal(classify({ problemas: ['acidente_doenca'] }).urgente, true);
});
