import { env } from '../config/env.js'

/*
 * Minimal client for Nebius Token Factory's OpenAI-compatible /chat/completions.
 * - The API key is read from the environment and only ever sent to Nebius.
 * - Every call has a timeout and returns parsed JSON, or throws AiUnavailableError.
 * - Callers ALWAYS validate the returned object (see validation/aiSchemas.js);
 *   nothing from the model is trusted for money, balances or risk levels.
 */

export class AiUnavailableError extends Error {
  constructor(message, { reason = 'error', status = null } = {}) {
    super(message)
    this.name = 'AiUnavailableError'
    this.reason = reason // 'disabled' | 'timeout' | 'http' | 'invalid_json' | 'invalid_output' | 'network'
    this.status = status
  }
}

export const isAiEnabled = () => env.nebius.enabled
export const aiModel = () => env.nebius.model

/** Extracts the first JSON object from model text (handles ```json fences and stray prose). */
export function extractJson(text) {
  if (typeof text !== 'string') throw new AiUnavailableError('Empty model response', { reason: 'invalid_json' })
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end <= start) throw new AiUnavailableError('Model did not return JSON', { reason: 'invalid_json' })
  try {
    return JSON.parse(cleaned.slice(start, end + 1))
  } catch {
    throw new AiUnavailableError('Model returned malformed JSON', { reason: 'invalid_json' })
  }
}

async function post(body, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${env.nebius.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.nebius.apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const data = await res.json().catch(() => null)
    return { res, data }
  } catch (error) {
    if (error.name === 'AbortError') throw new AiUnavailableError('Nebius request timed out', { reason: 'timeout' })
    throw new AiUnavailableError(`Could not reach Nebius: ${error.message}`, { reason: 'network' })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Sends a chat request expecting a JSON object back.
 * Retries once on 429/5xx, and once without response_format if the model rejects it.
 * Returns { json, model, usage }.
 */
export async function chatJson({ system, user, temperature = 0.3, maxTokens = 900, timeoutMs = env.nebius.timeoutMs }) {
  if (!isAiEnabled()) throw new AiUnavailableError('AI is not configured on this server', { reason: 'disabled' })

  const base = {
    model: env.nebius.model,
    temperature,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  }

  let body = { ...base, response_format: { type: 'json_object' } }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { res, data } = await post(body, timeoutMs)
    if (res.ok) {
      const content = data?.choices?.[0]?.message?.content
      return { json: extractJson(content), model: data?.model ?? env.nebius.model, usage: data?.usage ?? null }
    }
    const message = data?.error?.message ?? data?.detail ?? `HTTP ${res.status}`
    if (res.status === 400 && body.response_format && /response_format|json/i.test(message)) {
      body = base // model doesn't support JSON mode: ask via prompt only
      continue
    }
    if ((res.status === 429 || res.status >= 500) && attempt === 0) {
      await new Promise((r) => setTimeout(r, 800))
      continue
    }
    throw new AiUnavailableError(`Nebius error: ${message}`, { reason: 'http', status: res.status })
  }
  throw new AiUnavailableError('Nebius request failed', { reason: 'http' })
}

/** Lists model ids available to this API key (used by `npm run ai:models`). */
export async function listModels() {
  if (!env.nebius.apiKey) throw new AiUnavailableError('NEBIUS_API_KEY is not set', { reason: 'disabled' })
  const res = await fetch(`${env.nebius.baseUrl}/models`, { headers: { Authorization: `Bearer ${env.nebius.apiKey}` } })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new AiUnavailableError(data?.error?.message ?? `HTTP ${res.status}`, { reason: 'http', status: res.status })
  return (data?.data ?? []).map((m) => m.id).sort()
}
