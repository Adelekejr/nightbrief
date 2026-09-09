import { useCallback, useEffect, useRef, useState } from "react";
import BriefView from "./Brief";
import Browse, { type BriefRequest } from "./Browse";
import Overnight, {
  type OvernightResponse,
  type RankedEvent,
} from "./Overnight";
import PortfolioGate from "./PortfolioGate";
import TopBar from "./TopBar";
import { loadHoldings, navigate, saveHoldings, useRoute } from "./routes";
import type { AnalysisResponse, Session } from "./types";
import { failureCopy, Working } from "./states";
import { Mono, SampleStamp } from "./ui";

type Async<T> =
  | { at: "idle" }
  | { at: "loading"; since: number }
  | { at: "ready"; data: T }
  | { at: "failed"; kind: string; reason: string };

function Masthead({ session }: { session: Session | null }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="border-b border-rule pb-5">
      <p className="mt-1 max-w-md font-serif text-caption text-paper-mid">
        Investigates what broke while the US market was shut, and works out
        which of your tokenized holdings it reaches.
      </p>
      <p className="mt-3 font-mono text-micro tracking-wide text-paper-low">
        {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        {" · "}
        {Intl.DateTimeFormat().resolvedOptions().timeZone}
        {session && (
          <>
            {" · "}
            <span className={session.closed ? "text-signal" : ""}>
              {session.label}
            </span>
          </>
        )}
      </p>
    </div>
  );
}

export default function App() {
  const route = useRoute();
  const [holdings, setHoldings] = useState<string[]>(() => loadHoldings());
  const [overnight, setOvernight] = useState<Async<OvernightResponse>>({
    at: "idle",
  });
  const [brief, setBrief] = useState<Async<AnalysisResponse>>({ at: "idle" });
  const [session, setSession] = useState<Session | null>(null);
  const top = useRef<HTMLDivElement>(null);

  const fetchOvernight = useCallback((symbols: string[]) => {
    if (symbols.length === 0) return;
    setOvernight({ at: "loading", since: Date.now() });

    fetch(`/api/overnight?holdings=${encodeURIComponent(symbols.join(","))}`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok || !body.ok)
          throw new Error(body.reason ?? "The overnight desk did not respond.");
        setOvernight({ at: "ready", data: body as OvernightResponse });
        setSession(body.marketNow ?? null);
      })
      .catch((err: Error) =>
        setOvernight({ at: "failed", kind: "overnight", reason: err.message }),
      );
  }, []);

  // The desk is only meaningful once there is a portfolio to rank against.
  useEffect(() => {
    if (holdings.length > 0 && overnight.at === "idle")
      fetchOvernight(holdings);
  }, [holdings, overnight.at, fetchOvernight]);

  // Only the first-run gate forwards. The holdings editor is its own route
  // precisely so that it can never be redirected away from — an earlier
  // version bounced every attempt to reach it straight back here, which made
  // "Change holdings" a button that silently did nothing.
  useEffect(() => {
    if (route.name === "gate" && holdings.length > 0) navigate("overnight");
    // A desk with no portfolio behind it has nothing to show. Anything still
    // pointing at it after a clear — a Brief's back link, a stale hash — goes
    // to the gate rather than rendering an empty screen.
    if (route.name === "overnight" && holdings.length === 0) navigate("gate");
  }, [route.name, holdings.length]);

  const runBrief = useCallback(
    async (req: BriefRequest) => {
      setBrief({ at: "loading", since: Date.now() });
      navigate("brief");

      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...req, holdings }),
        });
        const body = await res.json();

        if (res.ok && body.ok)
          setBrief({ at: "ready", data: body as AnalysisResponse });
        else
          setBrief({
            at: "failed",
            kind: body.kind ?? String(res.status),
            reason: body.reason ?? "The Brief could not be produced.",
          });
      } catch {
        setBrief({
          at: "failed",
          kind: "network",
          reason:
            "The request did not complete. Check your connection and try again.",
        });
      }
    },
    [holdings],
  );

  const loadExample = useCallback(() => {
    setBrief({ at: "loading", since: Date.now() });
    fetch("/demo-brief.json")
      .then((r) => r.json())
      .then((data: AnalysisResponse) => setBrief({ at: "ready", data }))
      .catch(() =>
        setBrief({
          at: "failed",
          kind: "example-unavailable",
          reason: "The worked example could not be loaded.",
        }),
      );
  }, []);

  const openExample = useCallback(() => {
    setBrief({ at: "idle" });
    navigate("example");
  }, []);

  // A Brief exists only as the result of a run, so arriving at one directly —
  // a refresh, a shared link, a stale hash — has nothing to render. The
  // worked example is the one that can always be rebuilt from nothing; every
  // other Brief sends the reader back to where one can be started, rather
  // than to the blank screen this used to be.
  useEffect(() => {
    if (route.name === "example" && brief.at === "idle") loadExample();
    if (route.name === "brief" && brief.at === "idle")
      navigate(holdings.length ? "overnight" : "gate");
  }, [route.name, brief.at, holdings.length, loadExample]);

  /**
   * Clearing is immediate and total: the saved portfolio goes, and the desk
   * built from it goes with it. Keeping a desk for holdings the reader has
   * just cleared would be showing them somebody else's answer.
   */
  const clearHoldings = () => {
    saveHoldings([])
    setHoldings([])
    setOvernight({ at: 'idle' })
    // Clearing from the editor used to leave the reader on a screen with a
    // disabled primary action and no way out but the masthead, which restored
    // the portfolio they had just cleared. Starting over means starting at the
    // start.
    navigate('gate')
  }

  const commitHoldings = (picked: string[]) => {
    saveHoldings(picked);
    setHoldings(picked);
    setOvernight({ at: "idle" }); // force a rebuild against the new portfolio
    navigate("overnight");
  };

  const briefPane = (
    <>
      {brief.at === "loading" && (
        <Working
          since={brief.since}
          headline="Investigating this event against your holdings."
          steps={[
            "Fetching the full article from the publisher",
            "Extracting what happened, and when, relative to the US session",
            "Tracing the path from the event to each holding",
            "Checking every claim and figure against the source",
          ]}
        />
      )}

      {brief.at === "ready" && (
        <>
          {brief.data.captured && (
            <p className="mb-6 flex flex-wrap items-center gap-2">
              <SampleStamp label="Worked example" />
              <span className="font-serif text-caption text-paper-mid">
                A real run, captured and replayed.
              </span>
            </p>
          )}
          {brief.data.demo && (
            <p className="mb-6 flex flex-wrap items-center gap-2">
              <SampleStamp />
              <span className="font-serif text-caption text-paper-mid">
                {brief.data.demo}
              </span>
            </p>
          )}
          <BriefView data={brief.data} />
          <button
            type="button"
            onClick={() => navigate("overnight")}
            className="mt-2 w-full border border-rule-strong py-3 font-serif text-body text-paper hover:border-paper-low"
          >
            Back to the overnight desk
          </button>
        </>
      )}

      {brief.at === "failed" && (
        <div className="mt-6">
          <p className="font-serif text-display text-paper">
            {failureCopy(brief.kind, brief.reason).title}
          </p>
          <p className="mt-3 font-serif text-body text-paper-mid">
            {failureCopy(brief.kind, brief.reason).body}
          </p>
          <p className="mt-2">
            <Mono className="text-micro text-paper-low">{brief.kind}</Mono>
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={openExample}
              className="w-full border border-signal bg-signal py-3.5 font-serif text-body font-semibold text-signal-on hover:border-signal-deep hover:bg-signal-deep"
            >
              Read the worked example instead
            </button>
            <button
              type="button"
              onClick={() => navigate("overnight")}
              className="w-full border border-rule py-3 font-serif text-body text-paper-mid"
            >
              Back to the overnight desk
            </button>
          </div>
        </div>
      )}
    </>
  );

  // Discovery wants width; a finished Brief wants a reading measure.
  const reading = route.name === "brief" || route.name === "example";

  const editing = route.name === "holdings";

  return (
    <div className="min-h-dvh">
      <TopBar
        count={holdings.length}
        editing={editing}
        onHome={() => {
          navigate(holdings.length ? "overnight" : "gate");
          window.scrollTo({ top: 0 });
        }}
        onEditHoldings={() => navigate("holdings")}
        atHome={route.name === (holdings.length ? "overnight" : "gate")}
      />

      <div
        className={`mx-auto w-full px-5 pb-10 pt-7 ${reading ? "max-w-[34rem]" : "max-w-[38rem]"}`}
      >
        <div ref={top} />
        {!reading && (
          <Masthead session={session} />
        )}

        <main className={reading ? "" : "mt-8"}>
          {route.name === "gate" && (
            <>
              <PortfolioGate initial={holdings} onReady={commitHoldings} onClear={clearHoldings} />
              <div className="mt-8 border-t border-rule pt-6">
                <p className="font-serif text-caption text-paper-mid">
                  Or read a complete worked example first — a real story that
                  broke while New York was shut, followed all the way to the
                  holdings it reaches.
                </p>
                <button
                  type="button"
                  onClick={openExample}
                  className="mt-2 font-serif text-body text-signal underline underline-offset-4"
                >
                  Read the worked example →
                </button>
              </div>
            </>
          )}

          {route.name === "overnight" && (
            <>
              {overnight.at === "loading" && (
                <Working
                  since={overnight.since}
                  headline="Checking everything that broke overnight against your holdings."
                  steps={[
                    "Fetching every live news source",
                    "Matching your holdings by name",
                    "Looking for indirect links the stories never state",
                  ]}
                />
              )}
              {overnight.at === "ready" && (
                <Overnight
                  data={overnight.data}
                  onOpen={(e: RankedEvent) =>
                    runBrief({
                      title: e.title,
                      text: e.summary || e.title,
                      publisher: e.publisher,
                      url: e.url,
                      publishedAt: e.publishedAt ?? undefined,
                    })
                  }
                  onBrowse={() => navigate("browse")}
                  onEdit={() => navigate("holdings")}
                />
              )}
              {overnight.at === "failed" && (
                <div className="mt-6">
                  <p className="font-serif text-display text-paper">
                    The overnight desk could not be assembled.
                  </p>
                  <p className="mt-3 font-serif text-body text-paper-mid">
                    {overnight.reason}
                  </p>
                  <p className="mt-3 font-serif text-caption text-inferred">
                    Nothing is shown in place of it. An empty desk here would
                    read as “nothing happened overnight”, which is not what was
                    found.
                  </p>
                  <button
                    type="button"
                    onClick={() => fetchOvernight(holdings)}
                    className="mt-6 w-full border border-signal bg-signal py-3.5 font-serif text-body font-semibold text-signal-on hover:border-signal-deep hover:bg-signal-deep"
                  >
                    Try again
                  </button>
                </div>
              )}
            </>
          )}

          {route.name === "holdings" && (
            <PortfolioGate
              initial={holdings}
              editing
              onReady={commitHoldings}
              onClear={clearHoldings}
              onCancel={() => navigate(holdings.length ? "overnight" : "gate")}
            />
          )}

          {route.name === "browse" && <Browse onOpen={runBrief} />}
          {(route.name === "brief" || route.name === "example") && briefPane}
        </main>
      </div>
    </div>
  );
}
