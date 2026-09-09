import { useEffect, useState } from "react";
import { Mono, SampleStamp, SourceChip } from "./ui";
import type { Rejection } from "./types";

type Fault = { label: string; detail: string };

type ChecksResponse = {
  ok: true;
  disclaimer: string;
  evidence: Array<{
    id: string;
    publisher: string;
    title: string;
    url: string;
    text: string;
  }>;
  declaredHoldings: string[];
  faults: Fault[];
  submitted: {
    headline: string;
    chain: unknown[];
    exposures: unknown[];
    quotes: unknown[];
  };
  survived: { headline: string; unknowns: string[] };
  validation: {
    rejections: Rejection[];
    chainKept: number;
    chainDropped: number;
    exposuresKept: number;
    exposuresDropped: number;
    quotesKept: number;
    quotesDropped: number;
    figuresRedacted: number;
  };
};

/**
 * "It never fabricates" is a claim. This is the claim being tested in public:
 * a deliberately corrupted model output, run through the same validator every
 * Brief passes through, against the same real article the worked example uses.
 */
export default function Checks({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<ChecksResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/checks")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then(setData)
      .catch(() => setFailed(true));
  }, []);

  const v = data?.validation;
  const removed = v ? v.chainDropped + v.exposuresDropped + v.quotesDropped : 0;

  // The framing renders immediately and the counts arrive under it. An
  // earlier version returned a single loading line in place of the whole
  // page, which on a slow connection is a screen with nineteen characters
  // on it — the blank-screen failure this project keeps finding.
  return (
    <div className="pb-16">
      <p className="mb-5 flex flex-wrap items-center gap-2">
        <SampleStamp label="Not a Brief" />
        <span className="font-serif text-caption text-paper-mid">
          A fixture, on purpose.
        </span>
      </p>

      <h1 className="font-serif text-page text-paper">
        Nightbrief claims it will not present a fabricated claim as fact. Here
        is that claim being tested.
      </h1>

      <p className="mt-4 font-serif text-body text-paper-mid">
        Below is a model output written deliberately badly — every claim in it
        breaks one specific rule. It was run through the same validator every
        Brief passes through, against the same real article the worked example
        uses. Nothing is simulated: the counts and reasons come from that run.
      </p>

      {failed && (
        <p className="mt-6 font-serif text-body text-inferred">
          The demonstration could not be loaded. Nothing is shown in place of it
          — an invented set of counts here would be the exact failure this page
          exists to rule out.
        </p>
      )}

      {!data && !failed && (
        <p className="mt-6">
          <Mono className="text-micro text-paper-low">running the checks…</Mono>
        </p>
      )}

      {data && v && (
        <>
          {/* ---- what survived, as a number ------------------------------- */}
          <div className="mt-7 border-y border-rule py-4">
            <p className="font-serif text-display text-paper">
              <span className="text-signal">{removed}</span> claims removed,{" "}
              <span className="text-signal">{v.figuresRedacted}</span> figure
              struck from the prose.
            </p>
            <dl className="mt-3 grid grid-cols-[9.5rem_1fr] gap-x-4 gap-y-1.5">
              {[
                [
                  "chain links",
                  `${v.chainKept} kept · ${v.chainDropped} removed`,
                ],
                [
                  "exposures",
                  `${v.exposuresKept} kept · ${v.exposuresDropped} removed`,
                ],
                ["quotes", `${v.quotesKept} kept · ${v.quotesDropped} removed`],
              ].map(([k, val]) => (
                <div key={k} className="contents">
                  <dt className="font-mono text-micro text-paper-low">{k}</dt>
                  <dd className="font-mono text-micro text-paper-mid">{val}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* ---- the evidence it was checked against ---------------------- */}
          <section className="mt-9">
            <h2 className="mb-3 font-serif text-caption font-semibold tracking-wide text-paper-mid">
              Checked against
            </h2>
            {data.evidence.map((e) => (
              <div key={e.id}>
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <SourceChip id={e.id} href={e.url} />
                  <Mono className="text-micro text-paper-mid">
                    {e.publisher}
                  </Mono>
                </p>
                <p className="mt-1.5 font-serif text-body text-paper">
                  {e.title}
                </p>
                <p className="mt-2 border-l-2 border-signal-deep pl-3 font-serif text-caption text-paper-mid">
                  {e.text}
                </p>
              </div>
            ))}
            <p className="mt-3 font-serif text-caption text-paper-mid">
              Declared holdings:{" "}
              {data.declaredHoldings.map((h) => (
                <Mono key={h} className="text-caption text-paper-mid">
                  {h}{" "}
                </Mono>
              ))}
            </p>
          </section>

          {/* ---- each fault, and what the validator did about it ---------- */}
          <section className="mt-9">
            <h2 className="mb-1 font-serif text-caption font-semibold tracking-wide text-paper-mid">
              What was planted, and what happened
            </h2>
            <ol className="mt-4 space-y-6">
              {data.faults.map((fault, i) => (
                <li key={fault.label} className="border-t border-rule pt-4">
                  <p className="flex items-baseline gap-2">
                    <Mono className="text-micro text-paper-low">
                      {String(i + 1).padStart(2, "0")}
                    </Mono>
                    <Mono className="text-micro tracking-wide text-falsify/90">
                      rejected
                    </Mono>
                  </p>
                  <p className="mt-1.5 font-serif text-lede text-paper">
                    {fault.label}
                  </p>
                  <p className="mt-1.5 font-serif text-body text-paper-mid">
                    {fault.detail}
                  </p>
                </li>
              ))}
            </ol>
          </section>

          {/* ---- the validator's own words -------------------------------- */}
          <section className="mt-9">
            <h2 className="mb-3 font-serif text-caption font-semibold tracking-wide text-paper-mid">
              What the validator reported
            </h2>
            <ul className="space-y-1.5 border-l-2 border-falsify/50 pl-3">
              {v.rejections.map((r, i) => (
                <li key={i} className="font-mono text-micro text-falsify/90">
                  removed {r.reference} — {r.reason}
                </li>
              ))}
            </ul>
          </section>

          {/* ---- and what it left alone ----------------------------------- */}
          <section className="mt-9">
            <h2 className="mb-3 font-serif text-caption font-semibold tracking-wide text-paper-mid">
              What survived
            </h2>
            <p className="font-serif text-body text-paper">
              {data.survived.headline}
            </p>
            <p className="mt-3 font-serif text-caption text-paper-mid">
              One chain link — an inference, honestly labelled as one, citing
              nothing and claiming no figures. One exposure, for a holding the
              reader actually declared. One quote, word for word in the article.
              And where the model offered no gaps, the absence is reported
              rather than hidden:
            </p>
            <ul className="mt-3">
              {data.survived.unknowns.map((u, i) => (
                <li
                  key={i}
                  className="border-l-2 border-rule pl-3 font-serif text-body text-inferred"
                >
                  {u}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <button
        type="button"
        onClick={onBack}
        className="mt-9 w-full border border-rule-strong py-3 font-serif text-body text-paper hover:border-paper-low"
      >
        Back
      </button>
    </div>
  );
}
