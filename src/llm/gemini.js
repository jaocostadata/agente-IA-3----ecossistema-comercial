// Gemini (Google Generative Language API) — Flash para respostas simples, Pro para qualificação.
import { env } from '../config.js';

export const available = () => !!env.geminiKey;

export async function complete({ system, prompt, tier = 'flash', maxTokens = 600, json = false }) {
  const model = tier === 'pro' ? env.geminiPro : env.geminiFlash;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env.geminiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.4, ...(json ? { responseMimeType: 'application/json' } : {}) },
    }),
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
}
