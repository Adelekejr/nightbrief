/**
 * Minimal Gemini client.
 *
 * The key is read here, server-side, and never returned, logged or echoed.
 * It travels in a header rather than the query string so it cannot be
 * captured in a URL or an access log.
 */

const HOST = 'https://generativelanguage.googleapis.com'

/** Newer models are not always exposed on every API version. */
export type ApiVersion = 'v1beta' | 'v1'

export type ThinkingLevel = 'low' | 'high'

/**
 * Ordered by preference. Every one of these was confirmed present via
 * ListModels against the live key on 2026-09-08; presence there is not proof
 * of free-tier generation quota, which is what `probeGeneration` measures.
 */
export const MODEL_CANDIDATES = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.8-flash',
  'gemini-flash-latest',
] as const

export type GenerateOutcome<T> =
  | { ok: true; data: T; model: string; ms: number }
  | { ok: false; kind: 'no-key' | 'rate-limited' | 'upstream' | 'unparsable'; detail: string }

export type JsonSchema = Record<string, unknown>

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> }
    finishReason?: string
  }>
  promptFeedback?: { blockReason?: string }
}

export function hasKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY)
}

/**
 * Asks for JSON and enforces it with a response schema, so the caller gets a
 * structure to validate rather than prose to parse.
 */
/**
 * Google error bodies carry a human-readable reason. Only the status and
 * message are surfaced, capped in length, and the key never appears in them.
 */
async function upstreamReason(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { status?: string; message?: string } }
    const status = body.error?.status ?? String(res.status)
    const message = body.error?.message ?? 'no message'
    return `${status}: ${message}`.slice(0, 300)
  } catch {
    return `HTTP ${res.status}`
  }
}

export async function generateJson<T>(opts: {
  model: string
  apiVersion?: ApiVersion
  systemInstruction: string
  prompt: string
  schema: JsonSchema
  timeoutMs?: number
  maxOutputTokens?: number
  /** Gemini 3 reasoning depth. Omitted entirely when not set. */
  thinkingLevel?: ThinkingLevel
}): Promise<GenerateOutcome<T>> {
  const key = process.env.GEMINI_API_KEY
  if (!key) return { ok: false, kind: 'no-key', detail: 'GEMINI_API_KEY is not set.' }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 45_000)
  const started = Date.now()

  try {
    const version = opts.apiVersion ?? 'v1beta'
    const res = await fetch(`${HOST}/${version}/models/${opts.model}:generateContent`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: opts.systemInstruction }] },
        contents: [{ role: 'user', parts: [{ text: opts.prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: opts.schema,
          // Low but not zero: the reasoning should be stable across runs
          // without collapsing into the same phrasing every time.
          temperature: 0.3,
          maxOutputTokens: opts.maxOutputTokens ?? 8192,
          ...(opts.thinkingLevel ? { thinkingLevel: opts.thinkingLevel } : {}),
        },
      }),
    })

    if (res.status === 429) {
      return {
        ok: false,
        kind: 'rate-limited',
        detail: 'Gemini free-tier rate limit reached.',
      }
    }

    if (!res.ok) {
      return { ok: false, kind: 'upstream', detail: await upstreamReason(res) }
    }

    const body = (await res.json()) as GeminiResponse

    if (body.promptFeedback?.blockReason) {
      return {
        ok: false,
        kind: 'upstream',
        detail: `Blocked upstream: ${body.promptFeedback.blockReason}`,
      }
    }

    const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
    if (!text.trim()) {
      const reason = body.candidates?.[0]?.finishReason ?? 'empty response'
      return { ok: false, kind: 'unparsable', detail: `No content returned (${reason})` }
    }

    try {
      return {
        ok: true,
        data: JSON.parse(text) as T,
        model: opts.model,
        ms: Date.now() - started,
      }
    } catch {
      return { ok: false, kind: 'unparsable', detail: 'Response was not valid JSON.' }
    }
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError'
    return {
      ok: false,
      kind: 'upstream',
      detail: aborted ? 'Gemini request timed out.' : 'Could not reach the Gemini API.',
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Does the key actually get to generate with this model, and how fast?
 * ListModels answers neither question.
 */
export async function probeGeneration(model: string, apiVersion: ApiVersion = 'v1beta') {
  const started = Date.now()
  const out = await generateJson<{ ok: boolean }>({
    model,
    apiVersion,
    systemInstruction: 'Reply with JSON only.',
    prompt: 'Return {"ok": true}.',
    schema: {
      type: 'OBJECT',
      properties: { ok: { type: 'BOOLEAN' } },
      required: ['ok'],
    },
    timeoutMs: 30_000,
    maxOutputTokens: 512,
  })

  return out.ok
    ? { model, apiVersion, usable: true as const, ms: out.ms }
    : {
        model,
        apiVersion,
        usable: false as const,
        ms: Date.now() - started,
        kind: out.kind,
        detail: out.detail,
      }
}
