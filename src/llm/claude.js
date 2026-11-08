// Claude (Anthropic Messages API) — usado para briefings e casos complexos (slide 6: "IA avançada").
import { env } from '../config.js';

export const available = () => !!env.anthropicKey;

export async function complete({ system, prompt, maxTokens = 800 }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: env.claudeModel,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Claude HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  return json.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
}
