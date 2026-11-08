// Persistência simples em JSON (na produção: Supabase/PostgreSQL — ver db/schema.sql).
import fs from 'node:fs';
import path from 'node:path';
import { env } from './config.js';

const empty = () => ({ leads: {}, lawyerInbox: [], appointments: [], events: [] });
let db = empty();
let persist = true;
let timer = null;

export function load({ file = env.dataFile, inMemory = false } = {}) {
  persist = !inMemory;
  db = empty();
  if (persist && fs.existsSync(file)) {
    try { db = { ...empty(), ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { db = empty(); }
  }
  return db;
}

export function save(file = env.dataFile) {
  if (!persist) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(db, null, 2));
  }, 50);
}

export const getDb = () => db;
export const resetDb = () => { db = empty(); save(); return db; };
export const getLead = (phone) => db.leads[phone];
export const allLeads = () => Object.values(db.leads);
export function upsertLead(lead) { db.leads[lead.phone] = lead; save(); return lead; }
export function pushLawyer(msg) { db.lawyerInbox.push(msg); save(); return msg; }
export function logEvent(type, payload) { db.events.push({ type, ...payload }); save(); }
