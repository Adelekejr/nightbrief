import type { VercelRequest, VercelResponse } from '@vercel/node'
import { MODEL_CANDIDATES, probeGeneration } from '../lib/gemini.js'

const LIST_MODELS = 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200'

type ListedModel = {
  name?: string
  displayName?: string
  description?: string
  inputTokenLimit?: number
  outputTokenLimit?: number
  supportedGenerationMethods?: string[]
}

/**
 * Calls ListModels so the model ID in the README is a verified fact with a date,
 * not something recalled from training. The key travels in a header rather than
 * the query string so it cannot end up in a proxy or access log.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('cache-control', 'no-store')

  const key = process.env.GEMINI_API_KEY
  if (!key) {
    res.status(503).json({
      ok: false,
      reason: 'GEMINI_API_KEY is not set on this deployment.',
    })
    return
  }

  // Listing proves a model exists. Only a real generation call proves the
  // free-tier key can use it, which is what decides the pinned model ID.
  if (req.query.generate === '1') {
    const probes = []
    for (const model of MODEL_CANDIDATES) {
      probes.push(await probeGeneration(model))
    }
    res.status(200).json({
      probedAt: new Date().toISOString(),
      usable: probes.filter((p) => p.usable).map((p) => p.model),
      probes,
    })
    return
  }

  try {
    const upstream = await fetch(LIST_MODELS, { headers: { 'x-goog-api-key': key } })

    if (!upstream.ok) {
      res.status(upstream.status === 429 ? 429 : 502).json({
        ok: false,
        reason: `ListModels returned ${upstream.status}`,
      })
      return
    }

    const body = (await upstream.json()) as { models?: ListedModel[] }
    const generative = (body.models ?? []).filter((m) =>
      m.supportedGenerationMethods?.includes('generateContent'),
    )

    res.status(200).json({
      ok: true,
      verifiedAt: new Date().toISOString(),
      totalGenerative: generative.length,
      // Free tier is Flash-only; Pro requires billing.
      flash: generative
        .filter((m) => (m.name ?? '').includes('flash'))
        .map((m) => ({
          id: m.name,
          displayName: m.displayName,
          inputTokenLimit: m.inputTokenLimit,
          outputTokenLimit: m.outputTokenLimit,
        })),
    })
  } catch {
    res.status(502).json({ ok: false, reason: 'Could not reach the Gemini API.' })
  }
}
