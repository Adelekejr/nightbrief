import { useEffect, useState } from 'react'
import { SAMPLE } from './PortfolioGate'
import { Mono, MetricBasisMark } from './ui'

type ReportResponse = {
  ok: true
  reportedAt: string
  windowHours: number
  feedsMs: number
  sources: {
    live: Array<{ id: string; publisher: string }>
    unavailable: Array<{ id: string; publisher: string }>
    tickerFeedsLive: number
    tickerFeedsRequested: number
  }
  duplicates: { rawItems: number; kept: number; removed: number; rate: number }
  freshness: {
    sampledStories: number
    medianAgeMinutes: number
    oldestAgeMinutes: number
    newestAgeMinutes: number
  } | null
  matching: { directHits: number; shortTickerHits: number; note: string }
}

type ChecksResponse = {
  validation: {
    chainKept: number
    chainDropped: number
    exposuresKept: number
    exposuresDropped: number
    quotesKept: number
    quotesDropped: number
    figuresRedacted: number
  }
}

type DemoBrief = {
  captured?: { capturedAt: string; model: string; latencyMs: number }
  sources: Array<{ id: string; publisher: string; url: string }>
  validation: {
    chainKept: number
    chainDropped: number
    exposuresKept: number
    exposuresDropped: number
    quotesKept: number
    quotesDropped: number
  }
}

type Async<T> = { at: 'loading' } | { at: 'ready'; data: T } | { at: 'failed' }

function Metric({
  label,
  value,
  basis,
  detail,
}: {
  label: string
  value: string
  basis: 'observed' | 'estimated' | 'targeted'
  detail?: string
}) {
  return (
    <div className="border-t border-rule py-3">
      <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="font-serif text-body text-paper">{label}</span>
        <span className="flex items-baseline gap-2">
          <Mono className="text-lede font-semibold text-paper">{value}</Mono>
          <MetricBasisMark basis={basis} />
        </span>
      </p>
      {detail && <p className="mt-1 font-serif text-caption text-paper-mid">{detail}</p>}
    </div>
  )
}

function Section({
  title,
  lede,
  children,
}: {
  title: string
  lede: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-10">
      <h2 className="font-serif text-display text-paper">{title}</h2>
      <p className="mt-1.5 font-serif text-caption text-paper-mid">{lede}</p>
      <div className="mt-3">{children}</div>
    </section>
  )
}

/**
 * What this project can measure about itself, and what it cannot — read
 * straight, not rounded up.
 *
 * Every figure below is labelled OBSERVED, ESTIMATED or TARGETED, and never
 * silently promoted from one to the other. OBSERVED means measured, either
 * live on this load or from one dated, named run whose source is linked.
 * ESTIMATED means reasoned from a real but partial or historical
 * measurement — a probe run during development, not re-checked on every
 * page load. TARGETED means a goal or an invariant this project enforces in
 * code, not a measurement of anything that has happened. Where a number
 * that matters cannot honestly be measured — a false-positive rate against
 * a human-judged sample, chiefly — that is stated as a gap, the same way an
 * unresolved Brief states one, rather than filled in with a guess.
 */
export default function Validation({ onBack }: { onBack: () => void }) {
  const [report, setReport] = useState<Async<ReportResponse>>({ at: 'loading' })
  const [checks, setChecks] = useState<Async<ChecksResponse>>({ at: 'loading' })
  const [demo, setDemo] = useState<Async<DemoBrief>>({ at: 'loading' })

  useEffect(() => {
    fetch(`/api/overnight?holdings=${SAMPLE.join(',')}&report=1`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((data) => setReport({ at: 'ready', data }))
      .catch(() => setReport({ at: 'failed' }))

    fetch('/api/checks')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((data) => setChecks({ at: 'ready', data }))
      .catch(() => setChecks({ at: 'failed' }))

    fetch('/demo-brief.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((data) => setDemo({ at: 'ready', data }))
      .catch(() => setDemo({ at: 'failed' }))
  }, [])

  return (
    <div className="pb-16">
      <h1 className="font-serif text-page text-paper">Validation</h1>
      <p className="mt-3 font-serif text-body text-paper-mid">
        Citation coverage, latency, duplicate rate, match risk and freshness —
        measured against this deployment, not asserted about it. Nothing here
        is rounded up to look better than what was actually run.
      </p>

      {/* ---- 01 the pipeline, right now -------------------------------- */}
      <Section
        title="The pipeline, right now"
        lede="Fetched live when this page loaded, against the sample portfolio, with no model call — reading a report should not spend the deployment's quota."
      >
        {report.at === 'loading' && (
          <Mono className="text-micro text-paper-low">checking the live sources…</Mono>
        )}
        {report.at === 'failed' && (
          <p className="font-serif text-body text-inferred">
            The live check did not return. That failure is itself a data
            point, not hidden: shown as a gap below rather than papered over.
          </p>
        )}
        {report.at === 'ready' && (
          <>
            <Metric
              label="Source uptime, this load"
              value={`${report.data.sources.live.length} / ${report.data.sources.live.length + report.data.sources.unavailable.length}`}
              basis="observed"
              detail={
                report.data.sources.unavailable.length > 0
                  ? `Unreachable just now: ${report.data.sources.unavailable.map((s) => s.publisher).join(', ')}.`
                  : 'Every general-market source answered.'
              }
            />
            <Metric
              label="Duplicate rate"
              value={`${Math.round(report.data.duplicates.rate * 100)}%`}
              basis="observed"
              detail={`${report.data.duplicates.removed} of ${report.data.duplicates.rawItems} stories in the ${report.data.windowHours}h window were the same story arriving through a second feed, and were merged before ranking.`}
            />
            <Metric
              label="Freshness"
              value={
                report.data.freshness
                  ? `${report.data.freshness.medianAgeMinutes} min median age`
                  : 'no stories in window'
              }
              basis="observed"
              detail={
                report.data.freshness
                  ? `Newest story ${report.data.freshness.newestAgeMinutes} min old, oldest surfaced ${report.data.freshness.oldestAgeMinutes} min old, across ${report.data.freshness.sampledStories} stories considered.`
                  : undefined
              }
            />
            <Metric
              label="Feed fetch latency"
              value={`${(report.data.feedsMs / 1000).toFixed(1)}s`}
              basis="observed"
              detail="Wall time for every general and per-holding feed to answer or time out, fetched in parallel."
            />
          </>
        )}
      </Section>

      {/* ---- 02 citation coverage --------------------------------------- */}
      <Section
        title="Citation coverage"
        lede="Every claim in every real Brief passes through the same validator before a reader sees it — this is the code contract, not a sampled rate."
      >
        <Metric
          label="Enforced coverage"
          value="100%"
          basis="targeted"
          detail="A chain link claiming to be retrieved must cite a supplied source or it is dropped; a quote must appear verbatim in the source it names or it is dropped; a figure not present in any supplied source is redacted from the prose in place. This is lib/validate.ts running on every Brief, not a target this project is working toward."
        />

        {demo.at === 'ready' && (
          <Metric
            label="Claims kept in one captured run"
            value={`${demo.data.validation.chainKept + demo.data.validation.exposuresKept + demo.data.validation.quotesKept} of ${demo.data.validation.chainKept + demo.data.validation.chainDropped + demo.data.validation.exposuresKept + demo.data.validation.exposuresDropped + demo.data.validation.quotesKept + demo.data.validation.quotesDropped} claims kept`}
            basis="observed"
            detail={`${demo.data.captured?.model ?? 'model'}, captured ${demo.data.captured ? new Date(demo.data.captured.capturedAt).toLocaleDateString() : ''} — one dated run against a real ${demo.data.sources[0]?.publisher ?? 'article'} story, linked below. Zero rejections in this run means the model asked for nothing the validator had to remove, not that removal was never tested.`}
          />
        )}

        {checks.at === 'ready' && (
          <Metric
            label="Adversarial fixture"
            value={`${checks.data.validation.chainDropped + checks.data.validation.exposuresDropped + checks.data.validation.quotesDropped} rejected`}
            basis="observed"
            detail="A model output written deliberately to break every rule once, run through the same validator just now. This is where removal is actually exercised — open it below to read each rejection next to what was planted."
          />
        )}

        <p className="mt-3">
          <a href="#/checks" className="font-serif text-caption text-signal underline underline-offset-4">
            Watch the checks reject a deliberately bad Brief →
          </a>
        </p>
      </Section>

      {/* ---- 03 report latency -------------------------------------------- */}
      <Section
        title="Report latency"
        lede="How long a reader waits for a Brief, measured where it has actually been measured."
      >
        {demo.at === 'ready' && demo.data.captured && (
          <Metric
            label="One captured run, end to end"
            value={`${(demo.data.captured.latencyMs / 1000).toFixed(1)}s`}
            basis="observed"
            detail={`${demo.data.captured.model}, ${new Date(demo.data.captured.capturedAt).toLocaleDateString()}. One dated data point, not an average — no second real run has been captured to average it against.`}
          />
        )}
        <Metric
          label="Worst case, by design"
          value="≤150s"
          basis="targeted"
          detail="Three models in the fallback chain at a 50-second timeout each. A reader sees the next attempt begin, or a stated failure, before that ceiling — never a silent hang."
        />
      </Section>

      {/* ---- 04 false-positive holding matches ----------------------------- */}
      <Section
        title="False-positive holding matches"
        lede="What this project can actually claim about match precision, and what it cannot."
      >
        {report.at === 'ready' && (
          <Metric
            label="Collision-risk matches, this load"
            value={`${report.data.matching.shortTickerHits} of ${report.data.matching.directHits}`}
            basis="observed"
            detail={report.data.matching.note}
          />
        )}
        <Metric
          label="Alias-coverage probe"
          value="no gaps found"
          basis="estimated"
          detail="A one-time development-time check (lib/match.ts via /api/overnight?recall=1) ran the matcher over each of the 18 holdings' own ticker feeds and read every miss by hand. No missing alias was found. This was not re-run for this deployment and is not continuously monitored, so it is reported as a historical estimate, not a live number."
        />
        <div className="mt-3 border-l-2 border-inferred/40 pl-3">
          <p className="font-serif text-caption text-inferred">
            What is not measured: a false-positive rate against a
            human-judged sample of matched stories. That requires a labelled
            dataset this project does not have. Every direct match is a
            standalone-token string match the reader can verify by opening
            the source themselves — which is the mitigation in place — but
            "checkable" is not the same claim as "measured never wrong", and
            this report will not present it as one.
          </p>
        </div>
      </Section>

      {report.at === 'ready' && (
        <p className="mt-8 font-mono text-micro text-paper-low">
          Live section last checked {new Date(report.data.reportedAt).toLocaleTimeString()}.
          Reload this page to check again.
        </p>
      )}

      <button
        type="button"
        onClick={onBack}
        className="mt-9 w-full border border-rule-strong py-3 font-serif text-body text-paper hover:border-paper-low"
      >
        Back
      </button>
    </div>
  )
}
