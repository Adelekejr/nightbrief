import { Marker, StageRail, StageSection } from './Chain'
import Closes from './Closes'
import type { AnalysisResponse } from './types'
import { ago, ConfidenceLegend } from './states'
import { ConfidenceMark, Mono, SampleStamp, SensitivityMark, SourceChip, TimeStamp } from './ui'

/**
 * One event, one Brief.
 *
 * The conclusion comes first and the argument follows in a fixed order, so a
 * reader half awake at 6am gets what happened, what is exposed and how sure
 * before deciding whether to read the reasoning at all.
 */
export default function BriefView({ data }: { data: AnalysisResponse }) {
  const { brief, sources, validation } = data
  const sourceUrl = (id: string) => sources.find((s) => s.id === id)?.url || undefined
  const held = new Map(data.holdings.verified.map((h) => [h.symbol, h]))
  const untouched = data.holdings.verified.filter(
    (h) => !brief.exposures.some((e) => e.symbol === h.symbol),
  )

  return (
    <article className="pb-16">
      {/* ---- conclusion, before anything else ------------------------- */}
      <p className="font-serif text-page text-paper">{brief.headline}</p>

      {/* ---- who is exposed, at a glance ------------------------------ */}
      {brief.exposures.length === 0 ? (
        <p className="mt-5 border-l-2 border-rule pl-3 font-serif text-body text-inferred">
          The chain did not reach any of your holdings. That is a conclusion,
          not a gap — the reasoning below shows where it stops.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-rule border-y border-rule">
          {brief.exposures.map((e) => (
            <li key={e.symbol} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
              <span className="flex items-baseline gap-2">
                <Mono className="text-body font-bold text-signal">{e.symbol}</Mono>
                <span className="font-serif text-caption text-paper-mid">
                  {held.get(e.symbol)?.name}
                </span>
              </span>
              <span className="flex items-center gap-3">
                <SensitivityMark direction={e.direction} />
                <ConfidenceMark level={e.confidence} />
              </span>
            </li>
          ))}
        </ul>
      )}

      {untouched.length > 0 && (
        <p className="mt-3 font-serif text-caption text-paper-low">
          Checked and not reached:{' '}
          {untouched.map((h) => (
            <Mono key={h.symbol} className="text-caption text-paper-low">
              {h.symbol}{' '}
            </Mono>
          ))}
        </p>
      )}

      {data.holdings.unverified.length > 0 && (
        <p className="mt-4 border-l-2 border-signal/40 pl-3 font-serif text-caption text-paper-mid">
          <Mono className="text-caption text-paper">
            {data.holdings.unverified.join(', ')}
          </Mono>{' '}
          could not be matched to the verified rToken listing, so they were left
          out rather than guessed at.
        </p>
      )}

      <div className="mt-7">
        <StageRail current="event" />
      </div>

      {/* ---- 01 event -------------------------------------------------- */}
      <StageSection stage="event" title="What happened" lede="Extracted from the source, not summarised loosely.">
        <p className="font-serif text-lede text-paper">
          {brief.event.summary}
        </p>

        <dl className="mt-4 grid grid-cols-[7.5rem_1fr] gap-x-4 gap-y-2">
          {[
            ['category', brief.event.category],
            ['magnitude', brief.event.magnitude],
            ['expected?', brief.event.surprise],
            ['entities', brief.event.entities.join(', ') || 'none named'],
          ].map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-mono text-micro text-paper-low">{k}</dt>
              <dd className="font-mono text-micro text-paper-mid">{v}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-3 border-l-2 border-inferred/30 pl-3 font-serif text-caption text-inferred">
          <Marker kind="inference" />{' '}
          {brief.event.magnitudeBasis}
        </p>
      </StageSection>

      {/* ---- 02 evidence ------------------------------------------------ */}
      <StageSection
        stage="evidence"
        title="What the source actually says"
        lede="Quoted word for word, and checked against the source before display."
      >
        {sources.map((s) => (
          <div key={s.id} className="mb-4">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <SourceChip id={s.id} href={s.url} />
              <Mono className="text-micro text-paper-mid">{s.publisher}</Mono>
              {s.unverifiedOrigin && <SampleStamp label="Unverified origin" />}
            </div>

            <p className="mt-1.5 font-serif text-body text-paper">
              {s.url ? (
                <a href={s.url} target="_blank" rel="noreferrer noopener" className="hover:text-signal">
                  {s.title}
                </a>
              ) : (
                s.title
              )}
            </p>

            <p className="mt-1 flex flex-wrap items-baseline gap-x-3">
              <TimeStamp iso={s.publishedAt} session={s.sessionLabel} />
              {s.body && (
                <Mono className="text-micro text-paper-low">
                  {s.body.retrieved
                    ? `full article read · ${s.body.chars} chars`
                    : `body not retrieved — ${s.body.reason}`}
                </Mono>
              )}
            </p>
          </div>
        ))}

        {brief.quotes.length > 0 ? (
          <ul className="mt-5 space-y-3">
            {brief.quotes.map((q, i) => (
              <li key={i} className="border-l-2 border-signal/50 pl-3">
                <p className="font-serif text-body text-paper">“{q.text}”</p>
                <p className="mt-1 flex items-baseline gap-2">
                  <Marker kind="fact" />
                  <SourceChip id={q.sourceId} href={sourceUrl(q.sourceId)} />
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-serif text-caption text-paper-mid">
            No passage survived the verbatim check, so none is quoted here.
          </p>
        )}
      </StageSection>

      {/* ---- 03 transmission -------------------------------------------- */}
      <StageSection
        stage="transmission"
        title="How it reaches your holdings"
        lede="One link at a time. Disagree with any single step and the rest follows differently."
      >
        <ol className="space-y-6">
          {brief.chain.map((step) => (
            <li key={step.step}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="flex items-baseline gap-2">
                  <Mono className="text-micro text-paper-low">
                    {String(step.step).padStart(2, '0')}
                  </Mono>
                  <Marker kind={step.basis === 'retrieved' ? 'fact' : 'inference'} />
                </span>
                <ConfidenceMark level={step.confidence} />
              </div>

              <p className="mt-2 font-serif text-lede text-paper">
                {step.from}
              </p>
              <p className="my-1 font-mono text-caption text-signal">↓</p>
              <p className="font-serif text-lede text-paper">{step.to}</p>

              <p
                className={`mt-2 border-l-2 pl-3 font-serif text-body ${
                  step.basis === 'inferred'
                    ? 'border-inferred/30 text-inferred'
                    : 'border-signal/40 text-paper'
                }`}
              >
                {step.mechanism}
              </p>

              {step.sourceIds.length > 0 && (
                <p className="mt-2 flex flex-wrap gap-1.5">
                  {step.sourceIds.map((id) => (
                    <SourceChip key={id} id={id} href={sourceUrl(id)} />
                  ))}
                </p>
              )}
            </li>
          ))}
        </ol>
      </StageSection>

      {/* ---- 04 exposure -------------------------------------------------- */}
      <StageSection
        stage="exposure"
        title="What that means for each holding"
        lede="Direction of sensitivity. Nightbrief does not tell you what to do about it."
      >
        {brief.exposures.length === 0 ? (
          <p className="font-serif text-body text-inferred">
            None of your holdings sit at the end of this chain.
          </p>
        ) : (
          <ul className="space-y-6">
            {brief.exposures.map((e) => (
              <li key={e.symbol}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="flex items-baseline gap-2">
                    <Mono className="text-body font-bold text-signal">{e.symbol}</Mono>
                    <span className="font-serif text-caption text-paper-mid">
                      {held.get(e.symbol)?.name}
                    </span>
                  </span>
                  <SensitivityMark direction={e.direction} />
                </div>

                <p className="mt-2 font-serif text-body text-paper">
                  {e.rationale}
                </p>

                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <ConfidenceMark level={e.confidence} />
                  {e.chainSteps.length > 0 && (
                    <Mono className="text-micro text-paper-low">
                      follows steps {e.chainSteps.join(', ')}
                    </Mono>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </StageSection>

      {/* ---- where the shares last closed ------------------------------- */}
      <section className="mt-8">
        <h3 className="mb-3 font-serif text-caption font-semibold tracking-wide text-paper-mid">
          Where the underlying shares last closed
        </h3>
        <Closes symbols={data.holdings.verified.map((h) => h.symbol)} />
      </section>

      {/* ---- 05 confidence -------------------------------------------------- */}
      <StageSection
        stage="confidence"
        title="How far to trust this"
        lede="What the checks removed, and what would show the reasoning is wrong."
      >
        <p className="font-serif text-body text-paper">
          Every claim was tested against the sources before you saw it. A claim
          citing a source that was never supplied is removed. So is a quote that
          is not word for word in the source it names, and a figure that appears
          in none of them.
        </p>

        <dl className="mt-4 grid grid-cols-[9.5rem_1fr] gap-x-4 gap-y-1.5">
          {[
            ['chain links', `${validation.chainKept} kept · ${validation.chainDropped} removed`],
            ['exposures', `${validation.exposuresKept} kept · ${validation.exposuresDropped} removed`],
            ['quotes', `${validation.quotesKept} kept · ${validation.quotesDropped} removed`],
            ['figures redacted', String(validation.figuresRedacted)],
          ].map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-mono text-micro text-paper-low">{k}</dt>
              <dd className="font-mono text-micro text-paper-mid">{v}</dd>
            </div>
          ))}
        </dl>

        {validation.rejections.length > 0 && (
          <ul className="mt-4 space-y-1.5 border-l-2 border-falsify/50 pl-3">
            {validation.rejections.map((r, i) => (
              <li key={i} className="font-mono text-micro text-falsify/90">
                removed {r.reference} — {r.reason}
              </li>
            ))}
          </ul>
        )}

        <p className="mt-3">
          <a
            href="#/checks"
            className="font-serif text-caption text-signal underline underline-offset-4"
          >
            Watch the checks reject a deliberately bad Brief →
          </a>
        </p>

        <div className="mt-6">
          <h3 className="mb-2 font-serif text-caption font-semibold tracking-wide text-paper-mid">
            What the confidence marks mean
          </h3>
          <ConfidenceLegend />
        </div>

        {brief.falsifiers.length > 0 && (
          <div className="mt-6">
            <h3 className="mb-2 font-serif text-caption font-semibold tracking-wide text-paper-mid">
              What would prove this wrong
            </h3>
            <ul className="space-y-2">
              {brief.falsifiers.map((f, i) => (
                <li
                  key={i}
                  className="border-l-2 border-falsify/60 pl-3 font-serif text-body text-paper"
                >
                  {f}
                </li>
              ))}
            </ul>
          </div>
        )}

        {brief.watchAtOpen.length > 0 && (
          <div className="mt-6">
            <h3 className="mb-2 font-serif text-caption font-semibold tracking-wide text-paper-mid">
              Watch at the next US open
            </h3>
            <ul className="space-y-2">
              {brief.watchAtOpen.map((w, i) => (
                <li key={i} className="font-serif text-body text-paper">
                  {w}
                </li>
              ))}
            </ul>
          </div>
        )}
      </StageSection>

      {/* ---- 06 gaps ---------------------------------------------------------- */}
      <StageSection
        stage="gaps"
        title="What the evidence cannot settle"
        lede="Not missing fields. Questions the available sources do not answer."
      >
        <ul className="space-y-3">
          {brief.unknowns.map((u, i) => (
            <li key={i} className="flex flex-col gap-1">
              <Marker kind="unknown" />
              <span className="font-serif text-body text-paper-mid">{u}</span>
            </li>
          ))}
        </ul>
      </StageSection>

      <footer className="mt-11 border-t border-rule pt-4">
        <p className="font-mono text-micro text-paper-low">
          written {ago(data.generatedAt)} · {data.model} · {(data.latencyMs / 1000).toFixed(1)}s
          {data.captured ? ' · captured run, replayed' : ''}
          {data.fallbacksUsed.length > 0 &&
            ` · fell back from ${data.fallbacksUsed.map((f) => f.model).join(', ')}`}
        </p>
        <p className="mt-3 font-serif text-caption text-paper-low">
          Analysis, not advice. Nightbrief places no orders, holds no exchange
          credentials, and does not tell you what to buy or sell. rTokens track
          the price of a US-listed stock; holding one is not the same as owning
          the share, and the two can move apart.
        </p>
      </footer>
    </article>
  )
}
