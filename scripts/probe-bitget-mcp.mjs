/**
 * Throwaway probe — is the Bitget agent MCP endpoint reachable server-side?
 *
 * NOT part of the app. Nothing in `src/`, `lib/` or `api/` imports this, and it
 * ships no types anyone else depends on. It exists to answer one question
 * before any product code is written: can a plain server-side HTTP client
 * complete an MCP handshake against `https://agent.bitget.com/mcp`, and what
 * does it actually offer when it does?
 *
 * It is committed rather than discarded because the question could not be
 * answered from the machine that wrote it — see `docs/bitget-mcp-notes.md`.
 * Whoever runs it next needs the same probe, not a description of one.
 *
 *   node scripts/probe-bitget-mcp.mjs
 *   node scripts/probe-bitget-mcp.mjs --ticker MSFT
 *   node scripts/probe-bitget-mcp.mjs --endpoint https://agent.bitget.com/mcp
 *   node scripts/probe-bitget-mcp.mjs --json > probe.json
 *
 * Zero dependencies and no key: Node 18+ `fetch` only. Every failure is caught
 * and reported as a result, because "it refused us, here is how" is the finding
 * this script exists to produce — a stack trace would throw that away.
 *
 * MCP's Streamable HTTP transport lets a server answer a POST with either
 * `application/json` or an SSE stream, and may hand back a session id in
 * `mcp-session-id` that later calls must echo. Both are handled, because which
 * one Bitget does is part of what is being measured.
 */

const DEFAULT_ENDPOINT = 'https://agent.bitget.com/mcp'
const PROTOCOL_VERSION = '2025-06-18'
const TIMEOUT_MS = 20_000

function arg(name, fallback) {
  const at = process.argv.indexOf(`--${name}`)
  return at === -1 ? fallback : (process.argv[at + 1] ?? fallback)
}

const ENDPOINT = arg('endpoint', DEFAULT_ENDPOINT)
const TICKER = arg('ticker', 'AAPL')
const AS_JSON = process.argv.includes('--json')

/** Everything observed, written out at the end whatever happened. */
const findings = {
  endpoint: ENDPOINT,
  probedAt: new Date().toISOString(),
  runtime: `node ${process.version} on ${process.platform}`,
  reachable: false,
  steps: [],
  sessionId: null,
  serverInfo: null,
  tools: [],
  sample: null,
  notes: [],
}

const log = (...parts) => {
  if (!AS_JSON) console.log(...parts)
}

/**
 * One JSON-RPC call over Streamable HTTP.
 *
 * Returns a result record rather than throwing, and keeps the raw body on
 * failure: a proxy, a WAF or a browser-verification interstitial all answer
 * with something readable, and that text is usually the actual finding. Stooq
 * refused this project exactly that way, and the body said so.
 */
async function rpc(method, params, { notification = false } = {}) {
  const body = notification
    ? { jsonrpc: '2.0', method, params }
    : { jsonrpc: '2.0', id: Date.now(), method, params }

  const headers = {
    'content-type': 'application/json',
    // Both, per the transport spec — the server picks.
    accept: 'application/json, text/event-stream',
    'mcp-protocol-version': PROTOCOL_VERSION,
    'user-agent': 'Nightbrief-probe/0.1 (research prototype)',
  }
  if (findings.sessionId) headers['mcp-session-id'] = findings.sessionId

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const started = Date.now()

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
      redirect: 'follow',
    })
    const ms = Date.now() - started

    // The session id arrives on the initialize response and is required on
    // every later call if the server is session-oriented. Whether it appears
    // at all is one of the questions Phase 1 asks.
    const session = res.headers.get('mcp-session-id')
    if (session && !findings.sessionId) {
      findings.sessionId = session
      findings.notes.push('server issued an mcp-session-id: it is session-oriented, not one-shot')
    }

    // Rate-limit headers are recorded whether or not they are standard: a
    // keyless public endpoint that publishes a budget is telling us the
    // per-request cost of the integration.
    const limits = {}
    for (const [k, v] of res.headers) {
      if (/ratelimit|retry-after|x-rate/i.test(k)) limits[k] = v
    }

    const contentType = res.headers.get('content-type') ?? ''
    const raw = await res.text()

    const step = {
      method,
      status: res.status,
      ms,
      contentType,
      limits: Object.keys(limits).length ? limits : null,
    }

    if (!res.ok) {
      step.ok = false
      step.body = raw.slice(0, 600)
      findings.steps.push(step)
      return { ok: false, step }
    }

    // A notification has no reply body to parse.
    if (notification) {
      step.ok = true
      findings.steps.push(step)
      return { ok: true, step, result: null }
    }

    const parsed = parseBody(raw, contentType)
    if (!parsed.ok) {
      step.ok = false
      step.reason = parsed.reason
      step.body = raw.slice(0, 600)
      findings.steps.push(step)
      return { ok: false, step }
    }

    if (parsed.message.error) {
      step.ok = false
      step.reason = `JSON-RPC error ${parsed.message.error.code}: ${parsed.message.error.message}`
      findings.steps.push(step)
      return { ok: false, step }
    }

    step.ok = true
    findings.steps.push(step)
    return { ok: true, step, result: parsed.message.result }
  } catch (err) {
    const ms = Date.now() - started
    const aborted = err instanceof Error && err.name === 'AbortError'
    const step = {
      method,
      ok: false,
      ms,
      status: null,
      reason: aborted ? `timed out after ${TIMEOUT_MS}ms` : `transport failure: ${err?.message ?? err}`,
      // The proxy or egress layer's own words, when there are any. A CONNECT
      // refusal and a refusal by Bitget look identical without this.
      cause: err?.cause?.message ?? err?.cause?.code ?? null,
    }
    findings.steps.push(step)
    return { ok: false, step }
  } finally {
    clearTimeout(timer)
  }
}

/** JSON, or the last `data:` frame of an SSE stream. */
function parseBody(raw, contentType) {
  if (contentType.includes('text/event-stream')) {
    const frames = raw
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .filter(Boolean)
    if (!frames.length) return { ok: false, reason: 'SSE stream carried no data frame' }
    raw = frames[frames.length - 1]
  }
  try {
    return { ok: true, message: JSON.parse(raw) }
  } catch {
    return { ok: false, reason: 'response was not JSON' }
  }
}

/**
 * Pick the tools most likely to answer "what is AAPL doing" without assuming
 * the documented names exist. Phase 1 says discover them, so the ranking is
 * over whatever `tools/list` actually returned.
 */
function rankQuoteTools(tools) {
  const score = (t) => {
    const text = `${t.name} ${t.description ?? ''}`.toLowerCase()
    let n = 0
    if (/quote|price|ticker|last|close/.test(text)) n += 3
    if (/stock|equity|share|us/.test(text)) n += 2
    if (/symbol|search|lookup|info|profile|company/.test(text)) n += 1
    if (/order|withdraw|transfer|account|balance|trade|position/.test(text)) n -= 10
    return n
  }
  return tools
    .map((t) => ({ tool: t, score: score(t) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.tool)
}

/** Best-effort argument guess from a tool's own input schema. */
function argsFor(tool, ticker) {
  const props = tool.inputSchema?.properties ?? {}
  const args = {}
  for (const [key, spec] of Object.entries(props)) {
    const k = key.toLowerCase()
    if (/symbol|ticker|code|instrument|pair|query|keyword/.test(k)) args[key] = ticker
    else if (/market|type|category/.test(k) && spec?.enum?.length) args[key] = spec.enum[0]
  }
  return args
}

async function main() {
  log(`\nProbing ${ENDPOINT}`)
  log(`Node ${process.version} · ticker ${TICKER}\n`)

  // 1 — handshake
  log('1. initialize')
  const init = await rpc('initialize', {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: 'nightbrief-probe', version: '0.1.0' },
  })

  if (!init.ok) {
    findings.notes.push(
      'handshake failed — nothing below this line was measured, and no conclusion about the endpoint itself is available unless the failure names Bitget',
    )
    return report()
  }

  findings.reachable = true
  findings.serverInfo = init.result?.serverInfo ?? null
  findings.notes.push(`handshake completed in ${init.step.ms}ms`)
  log(`   ok · ${init.step.ms}ms · ${JSON.stringify(findings.serverInfo)}`)

  // Servers that issue a session id expect the initialized notification before
  // they will answer anything else.
  await rpc('notifications/initialized', {}, { notification: true })

  // 2 — discover, never assume
  log('2. tools/list')
  const list = await rpc('tools/list', {})
  if (!list.ok) {
    findings.notes.push('handshake succeeded but tools/list did not — the endpoint is reachable but not usable as documented')
    return report()
  }

  findings.tools = (list.result?.tools ?? []).map((t) => ({
    name: t.name,
    description: t.description ?? null,
    inputSchema: t.inputSchema ?? null,
  }))
  log(`   ok · ${list.step.ms}ms · ${findings.tools.length} tools`)
  for (const t of findings.tools) log(`     - ${t.name}`)

  // 3 — one real call, for a real response shape
  const candidates = rankQuoteTools(findings.tools)
  if (!candidates.length) {
    findings.notes.push(
      `no listed tool looks like a US equity quote lookup — the ${findings.tools.length} tools offered may not cover this use at all`,
    )
    return report()
  }

  for (const tool of candidates.slice(0, 3)) {
    const args = argsFor(tool, TICKER)
    log(`3. tools/call ${tool.name} ${JSON.stringify(args)}`)
    const call = await rpc('tools/call', { name: tool.name, arguments: args })
    if (call.ok) {
      findings.sample = { tool: tool.name, arguments: args, ms: call.step.ms, result: call.result }
      log(`   ok · ${call.step.ms}ms`)
      break
    }
    log(`   failed · ${call.step.reason ?? call.step.status}`)
  }

  if (!findings.sample) {
    findings.notes.push('every candidate quote tool was listed but none answered for ' + TICKER)
  }

  // 4 — does a second call on a fresh connection still work? A session-oriented
  // server is a different integration from a one-shot one, and a serverless
  // function has no place to keep a session between invocations.
  if (findings.sessionId) {
    const held = findings.sessionId
    findings.sessionId = null
    const cold = await rpc('tools/list', {})
    findings.notes.push(
      cold.ok
        ? 'a call without the session id still answered — one-shot use is viable from a serverless function'
        : 'a call without the session id was refused — every invocation must re-handshake, which doubles the round trips',
    )
    findings.sessionId = held
  }

  return report()
}

function report() {
  if (AS_JSON) {
    console.log(JSON.stringify(findings, null, 2))
    return
  }
  log('\n--- findings ---')
  log(`reachable:  ${findings.reachable}`)
  log(`session:    ${findings.sessionId ?? 'none issued'}`)
  log(`tools:      ${findings.tools.length}`)
  log(`sample:     ${findings.sample ? findings.sample.tool : 'none captured'}`)
  for (const n of findings.notes) log(`note:       ${n}`)
  log('\nsteps:')
  for (const s of findings.steps) {
    log(`  ${s.ok ? 'ok  ' : 'FAIL'} ${s.method.padEnd(26)} ${String(s.status ?? '-').padEnd(4)} ${s.ms}ms ${s.reason ?? ''}`)
    if (s.cause) log(`       cause: ${s.cause}`)
    if (s.body) log(`       body:  ${s.body.replace(/\s+/g, ' ').slice(0, 200)}`)
  }
  log('\nRe-run with --json to capture this as a fixture for Phase 2.\n')
}

main()
