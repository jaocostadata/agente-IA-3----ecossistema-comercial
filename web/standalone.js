// Versão standalone: o agente inteiro roda no navegador (sem servidor), em memória.
// Gerada por `npm run build:standalone` -> dist/sinapta-demo.html
import * as store from '../src/store.js';
import { route, tick } from '../src/api.js';

store.load({ inMemory: true });
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

window.SINAPTA_API = async (path, body) => {
  const r = await route(body === undefined ? 'GET' : 'POST', path, body || {}, { tz });
  return JSON.parse(JSON.stringify(r ? r.body : { error: 'rota não encontrada' }));
};
setInterval(tick, 60_000);

import('../public/app.js');
