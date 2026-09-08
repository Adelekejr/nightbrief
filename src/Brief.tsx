import type { AnalysisResponse } from './types'
import {
  BasisMark,
  ConfidenceMark,
  Heading,
  Mono,
  SampleStamp,
  SensitivityMark,
  SourceChip,
  TimeStamp,
} from './ui'

/**
 * The answer comes first. Everything that justifies it lives underneath,
 * reached by scrolling — never stacked on top of the conclusion.
 */
export default function BriefView({ data }: { data: AnalysisResponse }) {
  const { brief, sources, validation } = data
  const sourceUrl = (id: string) => sources.find((s) => s.id === id)?.url || undefined
  const held = new Map(data.holdings.verified.map((h) => [h.symbol, h]))

  return (
    <article className="pb-16">
      {/* ---- the answer ---------------------------------------------- */}
      <p className="font-serif text-[22px] leading-[1.35] text-paper">{brief.headline}</p>

      {brief.exposures.length === 0 ? (
        <p className="mt-5 border-l-2 border-rule pl-3 font-serif text-[15px] leading-relaxed text-inferred">
          None of your holdings were judged exposed to this. That is a finding,
          not a failure — the reasoning below shows why the chain stops short.
        </p>
      ) : (
        <ul className="mt-6 space-y-5">
          {brief.exposures.map((e) => (
            <li key={e.symbol} className="border-t border-rule pt-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="flex items-baseline gap-2">
                  <Mono className="text-[15px] font-bold text-signal">{e.symbol}</Mono>
                  <span className="font-serif text-[13px] text-paper/55">
                    {held.get(e.symbol)?.name}
                  </span>
                </span>
                <ConfidenceMark level={e.confidence} />
              </div>

              <div className="mt-1.5">
                <SensitivityMark direction={e.direction} />
              </div>

              <p className="mt-2 font-serif text-[15px] leading-relaxed text-paper/85">
                {e.rationale}
              </p>

              {e.chainSteps.length > 0 && (
                <p className="mt-1.5">
                  <Mono className="text-[10px] text-paper/40">
                    via {e.chainSteps.map((n) => `step ${n}`).join(', ')}
                  </Mono>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {data.holdings.unverified.length > 0 && (
        <p className="mt-6 border-l-2 border-signal/40 pl-3 font-serif text-[14px] leading-relaxed text-paper/70">
          We could not verify{' '}
          <Mono className="text-[13px] text-paper">
            {data.holdings.unverified.join(', ')}
          </Mono>{' '}
          against the rToken listing we captured, so they were left out entirely
          rather than guessed at.
        </p>
      )}

      {/* ---- what this was read from --------------------------------- */}
      <section className="mt-10">
        <Heading>Read from</Heading>
        {sources.map((s) => (
          <div key={s.id} className="border-t border-rule py-3">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <SourceChip id={s.id} href={s.url} />
              <Mono className="text-[11px] text-paper/60">{s.publisher}</Mono>
              {s.unverifiedOrigin && <SampleStamp label="Unverified origin" />}
            </div>
            <p className="mt-1.5 font-serif text-[15px] leading-snug text-paper/85">
              {s.url ? (
                <a href={s.url} target="_blank" rel="noreferrer noopener" className="hover:text-signal">
                  {s.title}
                </a>
              ) : (
                s.title
              )}
            </p>
            <p className="mt-1">
              <TimeStamp iso={s.publishedAt} session={s.sessionLabel} />
            </p>
          </div>
        ))}
      </section>

      {/* ---- the chain ------------------------------------------------ */}
      <section className="mt-10">
        <Heading>How the event reaches your holdings</Heading>
        <ol className="space-y-5">
          {brief.chain.map((step) => (
            <li
              key={step.step}
              className={
                step.basis === 'inferred'
                  ? 'border-l-2 border-inferred/30 pl-3'
                  : 'border-l-2 border-signal/40 pl-3'
              }
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <Mono className="text-[11px] text-paper/45">step {step.step}</Mono>
                <span className="flex items-center gap-3">
                  <BasisMark basis={step.basis} />
                  <ConfidenceMark level={step.confidence} />
                </span>
              </div>

              <p className="mt-1.5 font-serif text-[15px] leading-snug text-paper">
                {step.from}
                <span className="px-1.5 text-signal">→</span>
                {step.to}
              </p>

              <p
                className={`mt-1.5 font-serif text-[15px] leading-relaxed ${
                  step.basis === 'inferred' ? 'text-inferred' : 'text-paper/85'
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
      </section>

      {/* ---- the event ------------------------------------------------ */}
      <section className="mt-10">
        <Heading>The event, extracted</Heading>
        <p className="font-serif text-[15px] leading-relaxed text-paper/85">
          {brief.event.summary}
        </p>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          {[
            ['category', brief.event.category],
            ['magnitude', brief.event.magnitude],
            ['expected?', brief.event.surprise],
            ['entities', brief.event.entities.join(', ') || 'none named'],
          ].map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-mono text-[11px] text-paper/40">{k}</dt>
              <dd className="font-mono text-[11px] text-paper/75">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 font-serif text-[14px] leading-relaxed text-inferred">
          {brief.event.magnitudeBasis}
        </p>
      </section>

      {/* ---- watch ---------------------------------------------------- */}
      {brief.watchAtOpen.length > 0 && (
        <section className="mt-10">
          <Heading>What to watch at the next US open</Heading>
          <ul className="space-y-2">
            {brief.watchAtOpen.map((w, i) => (
              <li key={i} className="font-serif text-[15px] leading-relaxed text-paper/85">
                {w}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---- falsifiers ------------------------------------------------ */}
      {brief.falsifiers.length > 0 && (
        <section className="mt-10">
          <Heading>What would prove this reasoning wrong</Heading>
          <ul className="space-y-2">
            {brief.falsifiers.map((f, i) => (
              <li
                key={i}
                className="border-l-2 border-falsify/60 pl-3 font-serif text-[15px] leading-relaxed text-paper/85"
              >
                {f}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---- unknowns --------------------------------------------------- */}
      <section className="mt-10">
        <Heading>What this does not know</Heading>
        <ul className="space-y-2">
          {brief.unknowns.map((u, i) => (
            <li key={i} className="font-serif text-[15px] leading-relaxed text-inferred">
              {u}
            </li>
          ))}
        </ul>
      </section>

      {/* ---- the checks -------------------------------------------------- */}
      <section className="mt-10">
        <Heading>Checks applied to this brief</Heading>
        <p className="font-serif text-[14px] leading-relaxed text-paper/70">
          Every claim was tested against the sources above before you saw it. A
          claim citing a source that was never supplied is removed. So is a
          quote that is not word for word in the source it names, and a figure
          that appears in none of them.
        </p>

        <div className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
          {[
            ['chain links', `${validation.chainKept} kept, ${validation.chainDropped} removed`],
            ['exposures', `${validation.exposuresKept} kept, ${validation.exposuresDropped} removed`],
            ['quotes', `${validation.quotesKept} kept, ${validation.quotesDropped} removed`],
            ['figures redacted', String(validation.figuresRedacted)],
          ].map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-mono text-[11px] text-paper/40">{k}</dt>
              <dd className="font-mono text-[11px] text-paper/75">{v}</dd>
            </div>
          ))}
        </div>

        {validation.rejections.length > 0 && (
          <ul className="mt-4 space-y-1.5">
            {validation.rejections.map((r, i) => (
              <li key={i} className="font-mono text-[11px] leading-relaxed text-falsify/90">
                removed {r.reference} — {r.reason}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---- provenance of the brief itself ------------------------------ */}
      <footer className="mt-10 border-t border-rule pt-4">
        <p className="font-mono text-[10px] leading-relaxed text-paper/40">
          {data.model} · {(data.latencyMs / 1000).toFixed(1)}s
          {data.captured ? ' · captured run, replayed' : ''}
          {data.fallbacksUsed.length > 0 &&
            ` · fell back from ${data.fallbacksUsed.map((f) => f.model).join(', ')}`}
        </p>
        <p className="mt-3 font-serif text-[13px] leading-relaxed text-paper/45">
          Analysis, not advice. Nightdesk places no orders, holds no exchange
          credentials, and does not tell you what to buy or sell.
        </p>
      </footer>
    </article>
  )
}
