# Nightdesk

**An after-hours research desk for tokenized US stocks.**

Tokenized US equities (rTokens) trade 24/7. The market underneath them does not.
Macro news, policy decisions and geopolitical shocks land while US exchanges are
shut — and rToken prices keep moving in response, on thinner liquidity, with
far fewer people watching.

Nightdesk answers one question:

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

Nightdesk is a **research tool**. It places no orders, holds no exchange
credentials, touches no funds, and has no execution path of any kind. It does
not tell anyone what to buy or sell. The human reads the reasoning and decides.

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

## Status

Early. The public URL exists so that a working demo predates the deadline
rather than arriving on it.

| Component | State |
| --- | --- |
| Public URL | live |
| Serverless functions | live (`/api/health`, `/api/models`) |
| Model | Flash access verified via ListModels, 2026-09-08 |
| News sources | not wired |
| Price data | not wired |

Nothing currently rendered in the interface is market data, because no market
data is wired up yet.

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

**Pinned:** `gemini-3.5-flash`, falling back to `gemini-3.5-flash-lite`.
Explicit versions rather than the `-latest` alias, so a brief captured for
review can be reproduced against the same model. Reproduce the check any time
at `/api/models?generate=1`.

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

**News — live.** Eleven keyless RSS/Atom feeds are attempted on every request.
Six answered when last measured (2026-09-08): Federal Reserve, CNBC, CNBC
Markets, MarketWatch, Yahoo Finance and the European Central Bank. Five did
not: the Bureau of Labor Statistics (403), the Bureau of Economic Analysis
(404), the US Treasury (timeout), Nasdaq (timeout) and the SEC (403).

Rather than hide that, `/api/feed` names the sources that answered and the
sources that did not, in the response itself. `/api/feed?probe=1` reports
status, latency and item count per source, measured from the deployed function.

**Tokenized universe — observed, dated, partial.** Eighteen Bitget rToken
pairs, read off the Bitget app's "Spot stocks" tab on 2026-09-08. Prices were
visible in that capture and are deliberately not recorded: a price from a
screenshot is stale immediately and cannot be verified by a reader. The list
is explicitly incomplete, so an unrecognised symbol is reported as "not
verified by us" rather than treated as non-existent.

**Prices — not yet wired.** Nothing in the interface currently shows a price.

## Security

`GEMINI_API_KEY` is a server-side environment variable, read only inside
serverless functions. It is never bundled into client code and is never
prefixed `VITE_` — anything so prefixed is shipped to the browser by Vite.
The key is sent to Google in a request header rather than a query string, so it
cannot be captured in a URL or access log.

## Stack

Vite · React · TypeScript · Tailwind · Vercel serverless functions.
