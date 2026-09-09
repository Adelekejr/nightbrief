import type { VercelRequest, VercelResponse } from '@vercel/node'

/**
 * Reports what the server has, without ever revealing it.
 * Booleans only — no key material, no partial key, no length.
 */
export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('cache-control', 'no-store')
  res.status(200).json({
    ok: true,
    service: 'nightbrief',
    stage: 'scaffold',
    checkedAt: new Date().toISOString(),
    env: { geminiKey: Boolean(process.env.GEMINI_API_KEY) },
  })
}
