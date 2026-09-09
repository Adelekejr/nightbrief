# Nightbrief

**An after-hours research desk for tokenized US stocks.**

**Live: https://nightbrief.vercel.app** — no account, no setup.

Three things worth opening, in order:

1. **The worked example** — one complete research task, from a real story that
   broke while New York was shut through to the holdings it reaches. Captured
   from a real run and replayed, so it is instant and cannot fail.
2. **`#/checks`** — a deliberately corrupted model output run through the real
   validator, so the anti-fabrication claim can be watched rather than believed.
3. **The desk itself** — name some holdings and see what the last thirty-six
   hours actually did to them.

Tokenized US equities (rTokens) trade 24/7. The market underneath them does not.
Macro news, policy decisions and geopolitical shocks land while US exchanges are
shut — and rToken prices keep moving in response, on thinner liquidity, with
far fewer people watching.

Nightbrief answers one question:

> A macro or news event happened while US markets were closed. What does it mean
> for the tokenized stocks I hold?

## Who this is for

A retail or semi-professional trader in an African or Asian timezone who holds
or trades tokenized US stocks, and whose waking hours overlap the US market's
closed hours.

In West Africa (UTC+1) the US close lands at 21:00 local. The entire after-hours
and weekend window falls across the evening and the following morning — awake
and trading precisely when US desks and analysts are asleep, and when the least
research coverage exists. That gap is the product.

## What it is not

Nightbrief is a **research tool**. It places no orders, holds no exchange
credentials, touches no funds, and has no execution path of any kind. It does
not tell anyone what to buy or sell. The human reads the reasoning and decides.

## Watch the checks work

"It never fabricates" is a claim, so the app puts the claim on trial at
`#/checks`. A deliberately corrupted model output — a citation to a source
never supplied, a figure in no article, an exposure to a holding the reader
never named, a plausible quote that is not in the text — goes through the same
validator every Brief passes through, against the same real article the worked
example uses. Five claims are removed and one figure struck from the prose, and
the page shows the validator's own reasons for each.

## Ground rules the code enforces

- **No fabricated data.** A price, figure, date or quote that was not retrieved
  from a named source does not appear. This is enforced by server-side
  validation of the model's output, not by asking the model nicely.
- **Retrieved and inferred are visibly different.** Facts pulled from a source
  and conclusions drawn by the model are rendered in distinct visual registers.
- **Sample data is tagged in the interface**, next to the number itself — not
  only in this README.
- **Gaps are shown.** What the tool does not know is a permanent section of
  every brief, never an empty one.

## How it works

**Name your holdings.** Nightbrief ranks everything that broke while New York
was shut against them, and reports how many were touched.

**Open a Brief.** One event, investigated: what happened, what the source
actually says, how the effect travels from the event to your holdings, which
are exposed and in which direction, how far to trust it, and what the evidence
cannot settle.

Ranking runs in two layers that never merge:

- **Named** — the story names the holding. A string match, checkable by the
  reader against the headline, reported as fact.
- **Inferred** — the story never names it, but a model judged a real mechanism.
  Reported as inference.

The second layer is the product's thesis, not a garnish. The best Brief here
came from a story about TSMC and ASML that never mentions Nvidia; keyword
ranking alone would have scored it zero against a portfolio holding Nvidia.

If the inference layer is rate limited, the named layer still stands and the
interface says the indirect pass was unavailable.

## Status

| Component | State |
| --- | --- |
| Public URL | live, no login |
| Overnight ranking | live, two layers |
| Brief pipeline | live |
| Provenance validator | live, and demonstrable at `#/checks` |
| Article body retrieval | live |
| News feed | live, 8 of 9 sources answering, plus per-holding feeds |
| rToken universe | 18 pairs, observed and dated |
| Worked example | captured, served instantly |
| Tests | 65, no test framework — Node's runner and type stripping |
| Prices | live — closing price of the underlying share, dated |

**What is real on screen.** Headlines, publishers, timestamps, links and
article bodies are fetched live. Market-session labels are computed from those
timestamps. The rToken list was observed from Bitget on a stated date. The
reasoning is generated, labelled as generated, and every claim is checked
against the sources before display.

**Prices are real, dated, and carefully labelled.** They are the last closing
price of the *underlying US-listed share*, from Yahoo Finance, shown with the
trading date and the provider that answered. They are **not** live quotes and
**not** rToken prices — an rToken trades around the clock and can move apart
from the share it tracks, most of all while the US market is shut, which is
exactly when this tool is used. The interface says so next to the numbers.

Stooq was tried first and refused: it answers a datacentre IP with a
JavaScript browser-verification page. That is an explicit anti-automation
measure and was treated as a closed door, not something to work around.

## Endpoints

| Route | Purpose |
| --- | --- |
| `/api/overnight` | Events ranked against a portfolio, in two labelled layers. `?report=1` returns pipeline metrics without a model call. |
| `/api/feed` | Aggregated live news. `?probe=1` measures each source. |
| `/api/universe` | The verified rToken listing and its provenance. |
| `/api/analyze` | POST an item and holdings. `GET ?demo=1` runs the worked example live. |
| `/api/models` | ListModels. `?generate=1` proves the key can actually generate. |
| `/api/prices` | Last close of the underlying shares, dated and attributed. |
| `/api/checks` | Runs a deliberately corrupted output through the real validator. |
| `/api/health` | Whether the key is configured, as a boolean only. |

## Model

Google Gemini, free tier. No model name here is taken from memory — every one
was checked by a real call from the deployed function, and two names that
memory would have suggested turned out to be wrong.

**Availability, verified 2026-09-08 via generateContent from production:**

| Model | Usable | Trivial call | Notes |
| --- | --- | --- | --- |
| `gemini-3.5-flash` | yes | 7.5s | Chosen. Best judgement of the usable set. |
| `gemini-3.5-flash-lite` | yes | 0.6s | Chosen as fallback. |
| `gemini-3-flash-preview` | yes | 2.2s | Preview; not relied on for a deadline. |
| `gemini-3.1-flash-lite` | yes | 2.6s | |
| `gemini-3.8-flash` | no | — | UNAVAILABLE: high demand. |
| `gemini-flash-latest` | no | — | Timed out at 20s. |
| `gemini-2.5-flash` | no | — | Retired: "no longer available to new users". |
| `gemini-2.5-flash-lite` | no | — | Retired: "no longer available to new users". |

The two retirements are the reason for the rule. Both were plausible names, both
appear in older documentation, and both return 404 for a key created today.

**Pinned, in order:** `gemini-3.5-flash` → `gemini-3-flash-preview` →
`gemini-3.5-flash-lite`. Explicit versions rather than the `-latest` alias, so
a Brief captured for review can be reproduced against the same model. Reproduce
the check any time at `/api/models?generate=1`.

The middle rung exists because the preferred model returned "experiencing high
demand" three times in one afternoon. Falling straight to the lite model is a
large quality drop — on the same article it found two chain links to the
stronger model's four, and missed the two most obvious exposures entirely — so
a preview build, reached only after the first choice has already failed, is
better than nothing. If it disappears, the chain continues past it.

**On the same worked example** (observed, single runs, not averages):

| Model | Latency | Chain links | Exposures found |
| --- | --- | --- | --- |
| `gemini-3.5-flash` | 22.8s | 3 | 3 |
| `gemini-3-flash-preview` | 13.7s | 4 | 5 |
| `gemini-3.5-flash-lite` | 2.8s | 2 | 1 |

The stronger model is slower and more discriminating: given a semiconductor
story and a six-holding portfolio it reached three holdings and left two
untouched, and read Intel as *ambiguous* because Intel both designs chips and
competes as a foundry. The lite model reached one holding. A tool that marks
every holding exposed to every event is not reasoning, so discrimination is
weighted above speed here — and the worked example is served pre-captured, so
a reader never waits for it.

## Data sources

**Market news — live, and measured.** Nine keyless RSS/Atom feeds are attempted
on every request. Eight answered when last measured (2026-09-09): the Federal
Reserve, the Bureau of Economic Analysis, CNBC, CNBC Markets, MarketWatch,
Yahoo Finance, the European Central Bank and the SEC.

One did not: the Bureau of Labor Statistics refuses this client on all four of
its feed paths. It is kept in the list anyway, because it fails in under a
tenth of a second and a reader looking for CPI or payrolls should see that the
source was sought and refused rather than find it quietly absent.

The US Treasury and Nasdaq were removed after every candidate URL timed out.
Sources are fetched together, so two that never answer were setting a
six-second floor under every request.

`/api/feed` names the sources that answered and the sources that did not, in
the response itself. `/api/feed?probe=1` reports status, latency and item count
per source, measured from the deployed function rather than asserted here.

**Per-holding news — live.** Each holding also gets the news filed against its
own ticker. General market feeds cover the largest names and barely touch the
rest: a Lumentum or Nebius story rarely reaches CNBC's top stories, so a holder
of those positions could see an empty desk on a night when there was real news
about what they hold.

These feeds syndicate other publishers, so attribution follows the journalism —
`fool.com via Yahoo Finance`, not "Yahoo Finance". Stories arriving from both
directions are deduplicated by canonical URL and headline; a single request
typically merges a dozen duplicates that would otherwise have been ranked twice.

**Prices — live, dated, and narrowly defined.** The last closing price of the
*underlying US-listed share*, from Yahoo Finance, shown with its trading date
and the provider that answered.

They are **not** live quotes, and **not** rToken prices. An rToken trades around
the clock and can move apart from the share it tracks, most of all while the US
market is shut — which is exactly when this tool is used. The interface states
both caveats next to the numbers rather than in a footnote.

Stooq was tried first and refused: it answers a datacentre IP with a JavaScript
browser-verification page. That is an explicit anti-automation measure, and it
was treated as a closed door rather than something to work around.

**Tokenized universe — observed, dated, partial.** Eighteen Bitget rToken pairs,
read off the Bitget app's "Spot stocks" tab on 2026-09-08. Prices were visible
in that capture and are deliberately not recorded: a price from a screenshot is
stale immediately and cannot be verified by a reader. The list is explicitly
incomplete, so an unrecognised symbol is reported as "not verified by us" rather
than treated as non-existent.

## Limitations

Stated plainly, because a tool that hides its edges is harder to trust than one
that names them.

**Exchange holidays are not modelled.** Session labels are computed from the
clock and the weekday. On Thanksgiving, Nightbrief will call it a regular session
and be wrong. The type that carries this says so in its name.

**The reasoning is generated, and generated reasoning can be wrong.** The
validator guarantees that claims are *traceable* — that a cited source was
supplied, that a quote is verbatim, that a figure appears in an article. It
cannot guarantee they are *correct*. A well-sourced chain can still reach a
poor conclusion, which is why every link carries its own confidence and why
falsifiers are a required part of every Brief.

**Indirect links are the model's judgement, not a fact.** The inference layer
finds connections the text never states. Those are labelled as inference
everywhere they appear, and they are the part of a Brief most worth arguing
with.

**Coverage is uneven.** Eight news sources is not the whole market. A story
carried only by a publisher Nightbrief does not read will not appear, and the
desk will say nothing rather than know it missed something.

**Prices are a day old by construction.** End-of-day closes for the underlying
share, not the token, and not live. See the section above.

**Free-tier capacity is not guaranteed.** The preferred model returned
"experiencing high demand" three times in one afternoon during development.
The fallback chain and the pre-captured worked example exist because of that,
not in anticipation of it.

**Single-event analysis.** A Brief reasons about one event at a time. It does
not aggregate several overnight events into a combined view of a portfolio, and
it holds no memory of yesterday's Briefs.

**No backtesting.** Nothing here has been tested against whether its reasoning
predicted subsequent price moves. No claim of accuracy is made, and none should
be inferred from the confidence marks — those describe how well-supported a
claim is, not how often such claims turn out right.

## Security

`GEMINI_API_KEY` is a server-side environment variable, read only inside
serverless functions. It is never bundled into client code and is never
prefixed `VITE_` — anything so prefixed is shipped to the browser by Vite.
The key is sent to Google in a request header rather than a query string, so it
cannot be captured in a URL or access log.

## Validation report

`#/validation` in the app, linked from the overnight desk and from every
Brief. Five things measured against this deployment: source uptime, duplicate
rate, freshness, feed and Brief latency, and match collision risk.

Four kinds of statement, separated by heading on the page rather than left to
be inferred from a one-word label:

| Label | Means |
| --- | --- |
| `targeted` | The code cannot do otherwise. A structural property of the pipeline, true of every run, checkable by reading the named file. Never a rate. |
| `observed` | What one identified run did — live on load, or captured and dated. The sample size is always stated. |
| `estimated` | Reasoned from a real but partial or historical measurement, such as a probe run once during development. |
| `gap` | Nobody has assessed this. No number and no label, because either would imply a reading exists. |

The structural guarantee is stated precisely, because "100% citation coverage"
would have been false: an inferred link cites nothing **by design** and is kept
and labelled as inference. What the code enforces is that no claim presented as
retrieved survives without a supplied citation, no quote survives that is not
verbatim, and no figure survives that appears in no source. That is a claim
about traceability, not about whether a surviving claim is correct — and the
page says so next to the guarantee rather than leaving it to be worked out.

The live section calls `/api/overnight?report=1`, which stops before the model
call — reading a report should not spend the deployment's free-tier quota.

**What the report does not claim.** Two things are marked as gaps and left
without numbers. Whether the claims that survive validation are *right* — the
mechanism named is the one that operated, the exposure points the right way —
needs Briefs scored against human judgement. And the false-positive rate on
matching needs someone judging, story by story, whether a match was really
about the holding. Neither labelled set exists, so neither gets a figure. What
stands in their place is structural: a collision-risk proxy (direct matches on
a bare ticker of three characters or fewer, the case the standalone-token
boundary exists to contain), and the fact that every direct match is a string
the reader can open the source and check. Checkable is a weaker claim than
measured, and the page does not present it as the stronger one.

## Ask the desk

A prompt entry on the overnight desk with five fixed shortcuts. It is not a
chat interface and nothing behind it parses free text: each shortcut routes to
a screen this app already builds — the desk, a category filter over it, a
Brief, or the worked example. Typing is disabled deliberately, so the phrasing
never implies an understanding that is not there.

## Tests

```
npm test           # 65 unit tests — the validator, matcher, universe, routing
npm run typecheck
npm run build && npm run test:browser   # 37 browser checks, phone and desktop
```

The browser checks exist because every defect a reader has had to report on
this project was invisible to the type checker and to the unit tests: a
control that rendered but did nothing, a colour pair that only fails to the
eye, state that only diverged after navigation. They run against a real
Chromium on a Pixel 7 viewport and a desktop one, with the API stubbed, so a
failure means the interface is wrong rather than that a publisher was slow.

They cover navigation (the masthead reaches the desk from anywhere and is
never dead; clearing the portfolio leaves nothing behind, including on disk;
no route renders a blank screen), contrast (every visible run of text is
measured against its composited background and held to WCAG AA, plus a check
that nothing uses a shadow, gradient or blur to carry meaning), and access
(every control is named, the whole gate is keyboard-drivable, the focus ring
is drawn, nothing moves when motion is declined, targets clear WCAG 2.2's
24px and navigation clears 40px, and no screen scrolls sideways on a phone).

Four defects were found and fixed the first time they ran:

| Found | Fix |
| --- | --- |
| `Clear all` in the holdings editor cleared the ticks but not the saved portfolio, and left no way off the screen but the masthead — which restored it | the editor clears saved state and returns to the gate |
| `#/example` rendered a blank screen on refresh or a shared link | the route rebuilds the worked example; a Brief with nothing behind it returns to the desk |
| the quietest ink read 3.4:1 on the stock — fine on a bright desktop, illegible on a phone at 1am | lightened to 4.7:1 |
| the wordmark was a 24px-tall tap target on a phone, and `Clear all` 20px | both given real hit areas without changing the layout |
| `#/checks` was linked from every Brief but never wired into the router — the link went to a blank screen | route added, and every route is now in the blank-screen check |
| `#/checks` rendered a nineteen-character loading line in place of the whole page until its fetch returned | the framing renders immediately; only the counts wait |

## Stack

Vite · React · TypeScript · Tailwind · Vercel serverless functions · Playwright.
