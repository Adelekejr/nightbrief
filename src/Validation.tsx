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
 * Names which of the three kinds of statement follows.
 *
 * The distinction between "the code cannot do otherwise", "this is what one
 * run did" and "nobody has measured this" is the entire point of the page,
 * so it is a heading a reader passes through, not a one-word label they have
 * to notice and decode at the end of a row.
 */
function Kind({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-6 mb-1 font-mono text-micro tracking-wide text-paper-mid">{children}</h3>
  )
}

/**
 * A thing nobody has measured. No number and no basis mark, because both
 * would imply a reading exists. Cool blue, the same register this app uses
 * everywhere for "not established" — never red, which would read as an error
 * rather than as an honest boundary.
 */
function Gap({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-2 border-l-2 border-inferred/40 pl-3">
      <p className="font-serif text-body text-inferred">{title}</p>
      <p className="mt-1 font-serif text-caption text-inferred">{children}</p>
    </div>
  )
}

/**
 * What this project can measure about itself, and what it cannot — read
 * straight, not rounded up.
 *
 * FOUR kinds of statement, and the difference between them is the page:
 *
 *   TARGETED  — the code cannot do otherwise. A structural property of the
 *               pipeline, true of every run, checkable by reading the file
 *               named next to it. Never a rate.
 *   OBSERVED  — what one identified run did. Live on this load, or captured
 *               and dated. The sample size is always stated, because n=1 is
 *               a real finding and a hidden n=1 is a lie.
 *   ESTIMATED — reasoned from a real but partial or historical measurement.
 *   GAP       — nobody has assessed this. No number and no basis mark, since
 *               either would imply a reading exists.
 *
 * An earlier version of this page put a structural guarantee and a measured
 * result under one "100%", which made the strongest claim on the page rest
 * on a reader noticing a one-word label. Worse, "100% citation coverage" was
 * not even accurate: an inferred link cites nothing by design and is kept.
 * The three are now separated by heading, and each says in its own words
 * what it does and does not establish.
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

      {/* The legend is on the page rather than in a README, because a reader
          who cannot tell an enforced invariant from a single observation
          cannot read the rest of this correctly. */}
      <dl className="mt-5 border-t border-rule pt-4">
        {[
          [
            'targeted',
            'The code cannot do otherwise. A structural property of the pipeline, true of every run, checkable by reading the named file — not a rate and not a goal being worked toward.',
          ],
          [
            'observed',
            'What a specific run actually did. Measured live when this page loaded, or captured from one dated run that is named and linked. The sample size is stated every time.',
          ],
          [
            'estimated',
            'Reasoned from a real but partial or historical measurement — a probe run once during development, not re-checked on this load.',
          ],
        ].map(([term, meaning]) => (
          <div key={term} className="mb-2 grid grid-cols-[5.5rem_1fr] gap-x-3">
            <dt>
              <MetricBasisMark basis={term as 'observed' | 'estimated' | 'targeted'} />
            </dt>
            <dd className="font-serif text-caption text-paper-mid">{meaning}</dd>
          </div>
        ))}
        <div className="grid grid-cols-[5.5rem_1fr] gap-x-3">
          <dt className="font-mono text-micro font-medium tracking-wide text-inferred">gap</dt>
          <dd className="font-serif text-caption text-paper-mid">
            Not assessed. Stated as a gap and left without a number, because a
            figure here would need a labelled evaluation set that does not exist.
          </dd>
        </div>
      </dl>

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

      {/* ---- 02 citation coverage ---------------------------------------
       * Three different kinds of statement used to sit under one "100%".
       * They are separated here because conflating them is exactly the move
       * this page exists to refuse: what the code cannot do otherwise, what
       * one run actually did, and what nobody has evaluated. */}
      <Section
        title="Citation coverage"
        lede="Three separate questions, kept apart: what the code structurally prevents, what a real run measured, and what cannot be assessed without a labelled evaluation set."
      >
        <Kind>1 · What the code structurally prevents</Kind>
        <Metric
          label="Unsourced figures that can reach a reader"
          value="0, by construction"
          basis="targeted"
          detail="Not a rate and not a sample: three rules in lib/validate.ts run on every Brief, and a claim breaking one does not survive to be rendered. A chain link marked retrieved that cites no supplied source is dropped. A quote that is not verbatim in the source it names is dropped. A figure appearing in no supplied source is struck from the prose in place and the removal is shown."
        />
        <p className="mt-2 border-l-2 border-rule-strong pl-3 font-serif text-caption text-paper-mid">
          What this is not: a claim that every sentence carries a footnote. An
          inferred link cites nothing <em>by design</em> — it is reasoning, not
          retrieval, and it is kept and labelled inference rather than dropped.
          The guarantee is about traceability of what is presented as fact, and
          it says nothing about whether a surviving claim is correct.
        </p>

        <Kind>2 · What was measured, on which run</Kind>
        {demo.at === 'ready' && (
          <Metric
            label="Claims kept in one captured run"
            value={`${demo.data.validation.chainKept + demo.data.validation.exposuresKept + demo.data.validation.quotesKept} of ${demo.data.validation.chainKept + demo.data.validation.chainDropped + demo.data.validation.exposuresKept + demo.data.validation.exposuresDropped + demo.data.validation.quotesKept + demo.data.validation.quotesDropped}`}
            basis="observed"
            detail={`${demo.data.captured?.model ?? 'model'}, captured ${demo.data.captured ? new Date(demo.data.captured.capturedAt).toLocaleDateString() : ''} against a real ${demo.data.sources[0]?.publisher ?? 'article'} story. One run — n=1, not an average, and not a rate over production traffic, which this deployment does not record. Zero rejections here means the model asked for nothing that had to be removed on this occasion, not that removal goes untested.`}
          />
        )}

        {checks.at === 'ready' && (
          <Metric
            label="Rejections on the adversarial fixture"
            value={`${checks.data.validation.chainDropped + checks.data.validation.exposuresDropped + checks.data.validation.quotesDropped}`}
            basis="observed"
            detail="A model output written deliberately to break every rule once, run through the same validator when this page loaded. Deterministic rather than sampled: it demonstrates that removal works, and is not evidence about how often removal is needed."
          />
        )}

        <p className="mt-3">
          <a href="#/checks" className="font-serif text-caption text-signal underline underline-offset-4">
            Watch the checks reject a deliberately bad Brief →
          </a>
        </p>

        <Kind>3 · What needs a labelled evaluation set</Kind>
        <Gap title="Whether the claims that survive are right.">
          Traceable is not the same as correct. Nothing here establishes that a
          chain link names the mechanism that actually operated, that an
          exposure points the right way, or that the reasoning would hold up to
          a domain expert. Answering that needs a set of Briefs scored against
          human judgement. No such set exists for this project, so no number is
          offered in its place.
        </Gap>
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
        <Kind>What needs a labelled evaluation set</Kind>
        <Gap title="The false-positive rate itself.">
          Scoring precision means someone judging, story by story, whether a
          match was really about the holding. That needs a labelled sample
          this project does not have. What stands in its place is structural,
          not statistical: every direct match is a standalone-token string
          match the reader can open the source and check. Checkable is a
          weaker claim than measured, and it is not presented as the stronger
          one.
        </Gap>
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
