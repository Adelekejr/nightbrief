import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { Brief, Evidence } from '../lib/brief.js'
import { BRIEF_SCHEMA } from '../lib/brief.js'
import { generateJson, hasKey, type ThinkingLevel } from '../lib/gemini.js'
import { sessionAt } from '../lib/market.js'
import { buildPrompt, SYSTEM_INSTRUCTION } from '../lib/prompt.js'
import { resolve, type RToken } from '../lib/universe.js'
import { validateBrief } from '../lib/validate.js'
import { DEMO_ARTICLE, DEMO_HOLDINGS, DEMO_NOTE } from '../lib/demo.js'
import { extractArticle } from '../lib/extract.js'

/**
 * Verified 2026-09-08 by real generateContent calls from this deployment.
 * gemini-2.5-flash and gemini-2.5-flash-lite return 404 for new keys, and
 * gemini-flash-latest timed out, so neither memory nor the model listing was
 * a safe basis for this choice.
 *
 * Three rungs rather than two, because the preferred model has returned
 * UNAVAILABLE ("experiencing high demand") twice in one afternoon. The middle
 * rung is a preview build, which is not something to depend on but is strictly
 * better than nothing when it is only ever reached after the first has failed:
 * on the same article it found four chain links where the lite model found two
 * and missed both obvious exposures.
 */
const MODEL_CHAIN = [
  'gemini-3.5-flash',
  'gemini-3-flash-preview',
  'gemini-3.5-flash-lite',
] as const

const MAX_INPUT = 12_000

type Body = {
  /** Free text pasted by the reader, or the selected article's text. */
  text?: string
  title?: string
  publisher?: string
  url?: string
  publishedAt?: string
  holdings?: string[]
  /** Overrides the model chain. Present so the choice can be measured. */
  model?: string
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('cache-control', 'no-store')

  // GET ?demo=1 runs the canonical research task against the pinned article,
  // so the full flow can be exercised without composing a request.
  const isDemo = req.query.demo === '1'
  if (req.method !== 'POST' && !isDemo) {
    res.status(405).json({ ok: false, reason: 'Use POST, or GET ?demo=1 for the worked example.' })
    return
  }

  if (!hasKey()) {
    res.status(503).json({ ok: false, kind: 'no-key', reason: 'The model key is not configured on this deployment.' })
    return
  }

  const body: Body = isDemo
    ? {
        text: DEMO_ARTICLE.text,
        title: DEMO_ARTICLE.title,
        publisher: DEMO_ARTICLE.publisher,
        url: DEMO_ARTICLE.url,
        publishedAt: DEMO_ARTICLE.publishedAt ?? undefined,
        holdings: DEMO_HOLDINGS,
        model: typeof req.query.model === 'string' ? req.query.model : undefined,
      }
    : ((req.body ?? {}) as Body)
  const text = (body.text ?? '').trim().slice(0, MAX_INPUT)
  const title = (body.title ?? '').trim().slice(0, 500)

  if (!text && !title) {
    res.status(400).json({ ok: false, reason: 'Provide a headline or some article text to analyse.' })
    return
  }

  const holdingsInput = (body.holdings ?? []).map((h) => String(h)).slice(0, 25)
  if (holdingsInput.length === 0) {
    res.status(400).json({ ok: false, reason: 'List at least one holding.' })
    return
  }

  const held: RToken[] = []
  const unverified: string[] = []
  for (const raw of holdingsInput) {
    const r = resolve(raw)
    if (r.known) {
      if (!held.some((t) => t.symbol === r.token.symbol)) held.push(r.token)
    } else if (raw.trim()) {
      unverified.push(raw.trim())
    }
  }

  if (held.length === 0) {
    res.status(422).json({
      ok: false,
      kind: 'no-verified-holdings',
      reason: 'None of those symbols are in the verified rToken universe, so there is nothing we can responsibly analyse.',
      unverified,
    })
    return
  }

  // A feed item is one syndicated sentence. Reading the article itself gives
  // the model something to reason over, and gives the validator a far larger
  // pool of real figures to check claims against.
  const url = body.url?.slice(0, 500) ?? ''
  const extraction = url ? await extractArticle(url) : null
  const bodyText = extraction?.ok ? extraction.text : text

  // Pasted text is source material, but it is not a source we checked. The
  // publisher label says so rather than lending it borrowed authority.
  const pasted = !body.publisher
  const evidence: Evidence[] = [
    {
      id: 'src1',
      publisher: body.publisher?.slice(0, 120) || 'Pasted by the reader — not independently verified',
      title: title || text.slice(0, 160),
      url,
      publishedAt: body.publishedAt ?? null,
      sessionLabel: body.publishedAt ? sessionAt(new Date(body.publishedAt)).label : null,
      text: bodyText,
    },
  ]

  const now = sessionAt(new Date())
  const prompt = buildPrompt({ evidence, held, unverified, now })

  // ?dry=1 stops before the model call. Useful for checking what was actually
  // retrieved and what the model would be shown, without spending free-tier
  // quota to find out.
  if (req.query.dry === '1') {
    res.status(200).json({
      ok: true,
      dryRun: true,
      marketNow: now,
      extraction: extraction
        ? extraction.ok
          ? { retrieved: true, chars: extraction.chars, ms: extraction.ms }
          : { retrieved: false, reason: extraction.reason, ms: extraction.ms }
        : { retrieved: false, reason: 'no url supplied' },
      evidenceChars: bodyText.length,
      evidencePreview: bodyText.slice(0, 600),
      holdings: { verified: held.map((t) => t.symbol), unverified },
      promptChars: prompt.length,
    })
    return
  }
  const chain = body.model ? [body.model] : MODEL_CHAIN
  const thinkingLevel: ThinkingLevel | undefined =
    req.query.think === 'low' ? 'low' : req.query.think === 'high' ? 'high' : undefined

  const attempts: Array<{ model: string; kind: string; detail: string; ms: number }> = []

  for (const model of chain) {
    const started = Date.now()
    const out = await generateJson<Brief>({
      model,
      systemInstruction: SYSTEM_INSTRUCTION,
      prompt,
      schema: BRIEF_SCHEMA as unknown as Record<string, unknown>,
      // A good run has been observed at 39.9s. 40 would have cut it off.
      timeoutMs: 50_000,
      thinkingLevel,
    })

    if (out.ok) {
      const validated = validateBrief({
        brief: out.data,
        evidence,
        declaredSymbols: held.map((t) => t.symbol),
      })

      res.status(200).json({
        ok: true,
        demo: isDemo ? DEMO_NOTE : undefined,
        generatedAt: new Date().toISOString(),
        model: out.model,
        thinkingLevel: thinkingLevel ?? 'default',
        latencyMs: out.ms,
        fallbacksUsed: attempts,
        marketNow: now,
        sources: evidence.map((e) => ({
          id: e.id,
          publisher: e.publisher,
          title: e.title,
          url: e.url,
          publishedAt: e.publishedAt,
          sessionLabel: e.sessionLabel,
          unverifiedOrigin: pasted,
          // Whether the full article was read, or only the syndicated summary.
          body: extraction
            ? extraction.ok
              ? { retrieved: true as const, chars: extraction.chars }
              : { retrieved: false as const, reason: extraction.reason }
            : undefined,
        })),
        holdings: {
          verified: held.map((t) => ({ symbol: t.symbol, name: t.name, underlying: t.underlying })),
          unverified,
        },
        brief: validated.brief,
        // Deliberately part of the response, not a debug detail: a reader
        // should be able to see the checks removing things.
        validation: { rejections: validated.rejections, ...validated.stats },
      })
      return
    }

    attempts.push({ model, kind: out.kind, detail: out.detail, ms: Date.now() - started })

    // A rate limit will apply to the fallback too, so stop rather than burn it.
    if (out.kind === 'rate-limited') break
  }

  const rateLimited = attempts.some((a) => a.kind === 'rate-limited')
  res.status(rateLimited ? 429 : 502).json({
    ok: false,
    kind: rateLimited ? 'rate-limited' : 'model-unavailable',
    reason: rateLimited
      ? 'The Gemini free tier is rate limited right now. The worked example on the demo page shows the full flow in the meantime.'
      : 'No model in the chain could produce a brief.',
    attempts,
  })
}
