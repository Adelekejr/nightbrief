import type { VercelRequest, VercelResponse } from '@vercel/node'

/**
 * TEMPORARY — PREVIEW ONLY. DELETE BEFORE MERGING TO MAIN.
 *
 * Phase 1 asks whether a Vercel serverless function can reach the Bitget agent
 * MCP endpoint. That question cannot be answered from a laptop: the endpoint
 * sits behind Cloudflare, Vercel functions run on datacentre IPs, and this
 * repository has already lost one provider to exactly that combination —
 * Stooq answers a datacentre IP with a browser-verification page. So the probe
 * has to run from a deployed function, which means this file exists for one
 * run and then goes.
 *
 * It is the same sequence as `scripts/probe-bitget-mcp.mjs`, which was verified
 * against a local stub speaking the same transport. Nothing in the app imports
 * it, it reads no environment variable, and it holds no credential — the
 * endpoint is documented as keyless, and if that turns out to be false the
 * probe reports the refusal rather than authenticating past it.
 *
 * Gated three ways, because a probe route on production is not shippable:
 *
 *   1. 404 on production, indistinguishable from a route that does not exist.
 *   2. `no-store` and `noindex`, so nothing caches or lists it.
 *   3. Read-only by construction — any tool whose name or description suggests
 *      an order, a transfer or an account operation scores below zero in the
 *      ranking and is never called.
 */

const ENDPOINT = 'https://agent.bitget.com/mcp'
const PROTOCOL_VERSION = '2025-06-18'

/** Per-call ceiling, and a total budget under the function's 60s maxDuration.
 *  A probe that dies at the platform's limit reports nothing at all, which is
 *  the one outcome worse than a refusal. */
const CALL_TIMEOUT_MS = 12_000
const TOTAL_BUDGET_MS = 45_000

type Step = {
  method: string
  ok: boolean
  status: number | null
  ms: number
  contentType?: string
  limits?: Record<string, string> | null
  reason?: string
  cause?: string | null
  body?: string
}

type Findings = {
  endpoint: string
  probedAt: string
  runtime: string
  region: string | null
  reachable: boolean
  steps: Step[]
  sessionId: string | null
  serverInfo: unknown
  tools: { name: string; description: string | null; inputSchema: unknown }[]
  sample: unknown
  payloadCarriesTimestamp: 'yes' | 'no' | 'unknown'
  timestampEvidence: string | null
  notes: string[]
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (process.env.VERCEL_ENV === 'production') {
    res.status(404).json({ error: 'not found' })
    return
  }

  res.setHeader('cache-control', 'no-store')
  res.setHeader('x-robots-tag', 'noindex, nofollow')

  const ticker = typeof req.query.ticker === 'string' ? req.query.ticker : 'AAPL'
  const deadline = Date.now() + TOTAL_BUDGET_MS

  const findings: Findings = {
    endpoint: ENDPOINT,
    probedAt: new Date().toISOString(),
    runtime: `node ${process.version}`,
    region: process.env.VERCEL_REGION ?? null,
    reachable: false,
    steps: [],
    sessionId: null,
    serverInfo: null,
    tools: [],
    sample: null,
    payloadCarriesTimestamp: 'unknown',
    timestampEvidence: null,
    notes: [],
  }

  const rpc = async (
    method: string,
    params: unknown,
    { notification = false } = {},
  ): Promise<{ ok: boolean; result?: any; step: Step }> => {
    const remaining = deadline - Date.now()
    if (remaining <= 500) {
      const step: Step = { method, ok: false, status: null, ms: 0, reason: 'total budget exhausted' }
      findings.steps.push(step)
      return { ok: false, step }
    }

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': PROTOCOL_VERSION,
      'user-agent': 'Nightbrief-probe/0.1 (research prototype)',
    }
    if (findings.sessionId) headers['mcp-session-id'] = findings.sessionId

    const body = notification
      ? { jsonrpc: '2.0', method, params }
      : { jsonrpc: '2.0', id: Date.now(), method, params }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), Math.min(CALL_TIMEOUT_MS, remaining))
    const started = Date.now()

    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
        redirect: 'follow',
      })
      const ms = Date.now() - started

      const session = response.headers.get('mcp-session-id')
      if (session && !findings.sessionId) {
        findings.sessionId = session
        findings.notes.push('server issued an mcp-session-id: session-oriented, not one-shot')
      }

      const limits: Record<string, string> = {}
      response.headers.forEach((v, k) => {
        if (/ratelimit|retry-after|x-rate/i.test(k)) limits[k] = v
      })

      const contentType = response.headers.get('content-type') ?? ''
      const raw = await response.text()
      const step: Step = {
        method,
        ok: false,
        status: response.status,
        ms,
        contentType,
        limits: Object.keys(limits).length ? limits : null,
      }

      if (!response.ok) {
        // The body of a refusal is the finding. A WAF, a proxy and an
        // interstitial all explain themselves there.
        step.body = raw.slice(0, 600)
        findings.steps.push(step)
        return { ok: false, step }
      }

      if (notification) {
        step.ok = true
        findings.steps.push(step)
        return { ok: true, step, result: null }
      }

      const parsed = parseBody(raw, contentType)
      if (!parsed.ok) {
        step.reason = parsed.reason
        step.body = raw.slice(0, 600)
        findings.steps.push(step)
        return { ok: false, step }
      }
      if (parsed.message.error) {
        step.reason = `JSON-RPC error ${parsed.message.error.code}: ${parsed.message.error.message}`
        findings.steps.push(step)
        return { ok: false, step }
      }

      step.ok = true
      findings.steps.push(step)
      return { ok: true, step, result: parsed.message.result }
    } catch (err: any) {
      const ms = Date.now() - started
      const aborted = err?.name === 'AbortError'
      const step: Step = {
        method,
        ok: false,
        status: null,
        ms,
        reason: aborted ? `timed out after ${ms}ms` : `transport failure: ${err?.message ?? err}`,
        cause: err?.cause?.message ?? err?.cause?.code ?? null,
      }
      findings.steps.push(step)
      return { ok: false, step }
    } finally {
      clearTimeout(timer)
    }
  }

  const init = await rpc('initialize', {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: 'nightbrief-probe', version: '0.1.0' },
  })

  if (!init.ok) {
    findings.notes.push('handshake failed — nothing below was measured')
    res.status(200).json(findings)
    return
  }

  findings.reachable = true
  findings.serverInfo = init.result?.serverInfo ?? null
  findings.notes.push(`handshake completed in ${init.step.ms}ms`)

  await rpc('notifications/initialized', {}, { notification: true })

  const list = await rpc('tools/list', {})
  if (!list.ok) {
    findings.notes.push('handshake succeeded but tools/list did not — reachable, not usable as documented')
    res.status(200).json(findings)
    return
  }

  findings.tools = (list.result?.tools ?? []).map((t: any) => ({
    name: t.name,
    description: t.description ?? null,
    inputSchema: t.inputSchema ?? null,
  }))

  for (const tool of rankQuoteTools(findings.tools).slice(0, 3)) {
    const args = argsFor(tool, ticker)
    const call = await rpc('tools/call', { name: tool.name, arguments: args })
    if (call.ok) {
      findings.sample = { tool: tool.name, arguments: args, ms: call.step.ms, result: call.result }
      const stamped = findTimestamp(call.result)
      findings.payloadCarriesTimestamp = stamped ? 'yes' : 'no'
      findings.timestampEvidence = stamped
      findings.notes.push(
        stamped
          ? `payload carries its own time: ${stamped} — an observed time can be printed alongside the retrieval time`
          : 'payload carries NO time of its own — the Phase 3 block may state a retrieval time only, and nothing may be called live',
      )
      break
    }
  }

  if (!findings.sample) {
    findings.notes.push(`no candidate quote tool answered for ${ticker}`)
  }

  // Does a cold call work? A serverless function has nowhere to keep a session
  // between invocations, so a server that demands one costs two round trips
  // per Brief rather than one.
  if (findings.sessionId) {
    const held = findings.sessionId
    findings.sessionId = null
    const cold = await rpc('tools/list', {})
    findings.notes.push(
      cold.ok
        ? 'a call without the session id still answered — one-shot use is viable from a serverless function'
        : 'a call without the session id was refused — every invocation must re-handshake',
    )
    findings.sessionId = held
  }

  res.status(200).json(findings)
}

/** JSON, or the last `data:` frame of an SSE stream. */
function parseBody(raw: string, contentType: string): { ok: true; message: any } | { ok: false; reason: string } {
  let text = raw
  if (contentType.includes('text/event-stream')) {
    const frames = raw
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .filter(Boolean)
    if (!frames.length) return { ok: false, reason: 'SSE stream carried no data frame' }
    text = frames[frames.length - 1]
  }
  try {
    return { ok: true, message: JSON.parse(text) }
  } catch {
    return { ok: false, reason: 'response was not JSON' }
  }
}

/**
 * The question that decides how the Phase 3 block can be worded: does the
 * value arrive with a time of its own, or only with the time we asked?
 *
 * Walks the whole result, including JSON encoded inside an MCP text content
 * block, and accepts either an ISO-8601 string or a plausible epoch. A key
 * named `ts` holding 214.32 is a price, not a time, so the value is checked
 * and not just the key.
 */
function findTimestamp(result: unknown): string | null {
  const seen = new Set<unknown>()
  const TIME_KEY = /time|ts$|timestamp|date|updated|asof|as_of/i

  const plausibleEpoch = (n: number): boolean => {
    // Seconds or milliseconds, between 2001 and 2050. Narrow on purpose.
    const ms = n > 1e12 ? n : n * 1000
    return ms > 1_000_000_000_000 && ms < 2_500_000_000_000
  }

  const walk = (node: unknown): string | null => {
    if (node === null || node === undefined) return null
    if (typeof node === 'string') {
      // An MCP text block often carries the real payload as encoded JSON.
      const trimmed = node.trim()
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          return walk(JSON.parse(trimmed))
        } catch {
          return null
        }
      }
      return null
    }
    if (typeof node !== 'object') return null
    if (seen.has(node)) return null
    seen.add(node)

    if (Array.isArray(node)) {
      for (const item of node) {
        const hit = walk(item)
        if (hit) return hit
      }
      return null
    }

    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (TIME_KEY.test(key)) {
        if (typeof value === 'string' && /\d{4}-\d{2}-\d{2}|\d{10}/.test(value)) {
          return `${key}=${value}`
        }
        if (typeof value === 'number' && plausibleEpoch(value)) {
          return `${key}=${value}`
        }
      }
    }
    for (const value of Object.values(node as Record<string, unknown>)) {
      const hit = walk(value)
      if (hit) return hit
    }
    return null
  }

  return walk(result)
}

/** Discover, never assume — and never call anything that writes. */
function rankQuoteTools(tools: { name: string; description: string | null }[]) {
  const score = (t: { name: string; description: string | null }) => {
    const text = `${t.name} ${t.description ?? ''}`.toLowerCase()
    let n = 0
    if (/quote|price|ticker|last|close/.test(text)) n += 3
    if (/stock|equity|share|us/.test(text)) n += 2
    if (/symbol|search|lookup|info|profile|company/.test(text)) n += 1
    if (/order|withdraw|transfer|account|balance|trade|position/.test(text)) n -= 10
    return n
  }
  return tools
    .map((tool) => ({ tool, score: score(tool) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.tool)
}

function argsFor(tool: any, ticker: string) {
  const props = tool.inputSchema?.properties ?? {}
  const args: Record<string, unknown> = {}
  for (const [key, spec] of Object.entries<any>(props)) {
    const k = key.toLowerCase()
    if (/symbol|ticker|code|instrument|pair|query|keyword/.test(k)) args[key] = ticker
    else if (/market|type|category/.test(k) && spec?.enum?.length) args[key] = spec.enum[0]
  }
  return args
}
