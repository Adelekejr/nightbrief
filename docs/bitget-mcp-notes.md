# Bitget agent MCP — Phase 1 findings

**Status: viable, and built on.** Probed 2026-09-17 against
`https://agent.bitget.com/mcp`. The three constraints below shaped the adapter
in `lib/providers/bitget-mcp.ts` and the Market context block that reads it.

The one question left open by this phase — whether a Vercel function could
reach the endpoint at all — was settled in production on 2026-09-17. See
*Reaching it from Vercel*.

## Verdict

| Question | Answer |
| --- | --- |
| Reachable server-side without a key | **yes** — no account, no API key, no auth header |
| MCP handshake completes | **yes** — `bitget-mcp-server` 4.0.3 |
| US equity data available | **yes** — 21 entries, all `data_tier: free` |
| Real AAPL quote retrieved | **yes** — `equity_price_quote`, 661ms |
| **Payload carries its own timestamp** | **YES** — see below |
| One-shot calls viable | **no** — a session is mandatory |
| Rate limits published | none observed |
| Confirmed from a Vercel function | **yes** — confirmed in production 2026-09-17 |

## The timestamp question

**Yes. Two of them, and they agree.**

```
"last_timestamp": "2026-09-17T19:11:25.619389Z"     ISO-8601, UTC, microseconds
"time": 1789672285619                                same instant, epoch ms
```

Verified: `1789672285619` → `2026-09-17T19:11:25.619Z`, matching `last_timestamp`
to under a second. So the Phase 3 block **may state an observed time as well as
a retrieval time**, and the two are independently checkable against each other.

**But the quote is never current, and how stale it is depends on the clock.**

| Run | Observed (`last_timestamp`) | Read at | Age | Market |
| --- | --- | --- | --- | --- |
| 1 | 19:11:25Z | 19:26:28Z | **15.0 min** | open |
| 2 | 19:13:15Z | 19:28:14Z | **15.0 min** | open |
| 3 | 20:04Z | 20:44Z | **40 min** | shut (closed 20:00Z) |

Runs 1 and 2 are the in-session case: exactly fifteen minutes, twice, and the
response names its own upstream as `extra_params.source: "iex"` — a standard IEX
delayed feed.

Run 3 is the case that matters more here. It was read forty-four minutes after
the 16:00 ET close, and the quote is from four minutes past it. Nothing is
delaying that value any more; it is simply the last print of a session that has
ended, and its age grows for as long as the market stays shut. By the middle of
a Lagos evening it is hours old, and over a weekend it is days.

**That is the normal case for this app, not the exception.** Nightbrief exists
to be read while New York is shut, so a reader will usually meet a figure that
is hours old rather than fifteen minutes old.

Two consequences, both already true of the code:

- The age is **computed per reading** from the payload's own timestamp, never
  from a hard-coded fifteen minutes. Had the adapter assumed the constant, run 3
  would have printed a lie.
- `sourceType: 'delayed-intraday-quote'` is accurate in-session and loose once
  the market shuts, where the value is closer to a close. It is an internal
  discriminator and is not shown to a reader, so it misleads nobody today — but
  it would need splitting before anything renders it.

It is not a live quote, and the word "live" must not appear near it.

**Do not use `extra.metadata.timestamp`.** It reads `2026-09-18T03:26:28.465836`
— no timezone marker, and eight hours ahead of the UTC wall clock. It is the
platform's own local processing time, naive, and it is not the observation time.
Reading it as UTC would put the quote eight hours in the future.

## What the endpoint actually is

Not what the documentation describes. `tools/list` returns **exactly two tools**:

| Tool | What it does |
| --- | --- |
| `guide` | Lists data categories, or the entries within one. Params: `category`, `subcategory`, `keyword`, all optional |
| `do_query` | Executes a catalog entry by id. Params: `entry_id` (required), `params` (object) |

There are no named tools like `get_stock_quote`. Everything is reached by
walking a catalog, so **assuming tool names from the documentation would have
failed outright** — which is exactly why Phase 1 said to discover them.

### Categories

```json
{"categories":[
  {"key":"crypto",   "name":"加密货币", "entry_count":40},
  {"key":"equity",   "name":"美股",     "entry_count":21},
  {"key":"etf",      "name":"ETF",      "entry_count":3},
  {"key":"news",     "name":"新闻",     "entry_count":1},
  {"key":"sentiment","name":"市场情绪", "entry_count":2}
]}
```

**Address a category by `key`, never by `name`.** The names are localised — 美股
is "US stocks" — and `guide({category: "美股"})` returns `{"entries":[]}` rather
than an error. A quiet empty list reads as "the catalog is empty" and cost one
probe run before it was spotted.

### The 21 US equity entries

All `data_tier: free`. `*` marks a required parameter.

```
equity_price_quote                实时报价           [symbol*]
equity_price_historical           历史K线            [symbol*, start_date, end_date, start_time, end_time]
equity_profile                    公司基本信息        [symbol*]
equity_fundamental_management     管理层             [symbol*]
equity_calendar_earnings          财报日历            [symbol, start_date, end_date]
equity_fundamental_balance        资产负债表          [symbol*, limit, report_type, statement_year, …]
equity_fundamental_income         利润表             [symbol*, limit, report_type, statement_year, …]
equity_fundamental_cash           现金流量表          [symbol*, limit, report_type, statement_year, …]
equity_fundamental_metrics        财务分析指标        [symbol*]
equity_fundamental_ratios         估值指标            [symbol*, limit, start_date, end_date, page]
equity_fundamental_dividends      股票分红            [symbol*, start_date, end_date, limit]
equity_ownership_insider_trading  内部人交易          [symbol*, limit, start_time, end_time, …]
equity_ownership_major_holders    主要股东持股        [symbol*, page, start_date, end_date, limit]
equity_ownership_form_13f         机构持仓 13F       [symbol*, date, limit]
equity_ownership_institutional    机构持仓明细/汇总    [symbol*, limit]
equity_estimates_price_target     分析师价格预测       [symbol, start_date, end_date, limit, action]
equity_estimates_forward_pe       前瞻 PE           [symbol]
equity_estimates_forward_eps      前瞻 EPS          [symbol, fiscal_year, fiscal_period]
equity_estimates_forward_ebitda   前瞻 EBITDA       [symbol, fiscal_period, estimate_type]
equity_estimates_forward_sales    前瞻营收           [symbol, fiscal_year, fiscal_period]
equity_estimates_consensus        分析师一致预期       [symbol*]
```

Everything is read-only. There is no order, transfer or account entry anywhere
in the equity category — the read-only constraint is satisfied by what the
surface offers, not only by our restraint.

## The AAPL response, verbatim

`do_query { entry_id: "equity_price_quote", params: { symbol: "AAPL" } }` — 661ms.

```json
{"success":true,"status_code":200,"data":{"id":"06aac3ee-4eb5-7f58-8000-4c1e4e04708b",
"results":[{"symbol":"AAPL","bid":337.1,"bid_size":80,"ask":337.12,"ask_size":400,
"last_price":337.1,"last_size":40,"last_timestamp":"2026-09-17T19:11:25.619389Z",
"open":334.77,"high":337.448,"low":330.247,"close":337.1,"volume":21370955.0,
"prev_close":332.41,"change":4.689999999999998,"change_percent":1.4109082157576478,
"time":1789672285619}],
"provider":"massive","warnings":[…PydanticDeprecationWarning ×2…],"chart":null,
"extra":{"metadata":{"arguments":{"provider_choices":{"provider":"massive"},
"standard_params":{"symbol":"AAPL"},"extra_params":{"market":"a_share","source":"iex"}},
"duration":453859428,"route":"/equity/price/quote",
"timestamp":"2026-09-18T03:26:28.465836"}}},"error":null}
```

Three things in that payload are worth naming.

**`provider: "massive"`.** Bitget is not the origin. The real chain is
Bitget MCP → `massive` → IEX. A Phase 3 block that says "Bitget" as the
provider would be naming the reseller and calling it the source. Attribution
here should follow the journalism rule this project already uses for syndicated
news — `IEX via Bitget`, not "Bitget".

**`extra_params.market: "a_share"`.** AAPL is not a Chinese A-share. The field
is wrong, and it is wrong in the metadata rather than the data. Treat everything
under `extra.metadata` as untrusted decoration; the numbers in `results` are the
payload.

**`warnings` carries upstream Pydantic deprecation notices.** Internal server
chatter leaking through the API. Harmless, but it should never reach a reader,
and a Phase 2 adapter should drop the field rather than pass it along.

## Transport behaviour

- `initialize` answers `application/json`; every subsequent call answers
  `text/event-stream` with the JSON-RPC message in one `data:` frame. Both forms
  must be handled.
- **A session is mandatory.** The server issues `mcp-session-id` on initialize,
  and a `tools/list` sent without it is refused. Measured, not assumed:
  `oneShotViable: false`.
- **So each cold invocation costs at least two round trips** — handshake, then
  the query — plus the `notifications/initialized` the server expects between
  them. A serverless function has nowhere to keep a session between
  invocations, so this is the floor, not the average.
- Latency observed: handshake 238–329ms, `tools/list` 173–190ms, `guide`
  ~190ms, `do_query` 661ms. A full cold sequence is therefore roughly
  **1.1–1.3s**, which is the number the Phase 2 timeout must be built around.
- **No rate-limit headers on any response.** No `x-ratelimit-*`, no
  `retry-after`. The budget is unpublished, which means it is unknown rather
  than generous — Phase 2 should cache and back off as if it were tight.

## Reaching it from Vercel

**Settled: yes.** This was the one question Phase 1 could not answer. The probe
had run from a GitHub Actions runner, which is a different network on different
IPs, and `agent.bitget.com` sits behind Cloudflare — the same combination that
cost this project Stooq, which answers a datacentre IP with a browser
verification page. The preview route built for the verdict never served, so the
question outlived the branch.

Production answered it on 2026-09-17, on the first Brief opened after the merge:

```
NVDA  218.98  +2.4% on the previous close
The US-listed share behind rNVDA.
Observed 40 minutes before it was read.
via Bitget, sourced from IEX
observed 20:04 UTC · read 20:44 UTC
```

A Vercel function reaches the endpoint, completes the handshake, executes
`equity_price_quote` and gets a real value back. Cloudflare does not refuse
Vercel's IPs the way it refused Stooq's caller.

Re-check it any time at `/api/market-context?holding=rNVDA`. `ok: true` with a
price is the whole answer; `ok: false` naming Bitget means the door has closed
since, and the block degrades to saying so with Yahoo's last close below it.

## What Phase 2 has to absorb

1. **Two round trips minimum, ~1.2s cold.** The per-call timeout has to cover a
   handshake and a query, and it still has to be short enough that a slow
   Bitget call cannot delay a Brief. The session cannot be pooled across
   invocations.
2. **The value is a delayed intraday price, not a close and not a live quote.**
   It needs its own label. The existing `Close` type in `lib/prices.ts` cannot
   carry it honestly — a 15-minute-old intraday print is neither of the two
   things the app currently knows how to say.
3. **Provenance is a chain, not a name.** `provider: "massive"`,
   `source: "iex"`, served by Bitget. The record should carry all three, and
   the block should print the origin rather than the reseller.

## Running it again

```sh
node scripts/probe-bitget-mcp.mjs                       # human-readable
node scripts/probe-bitget-mcp.mjs --json > probe.json   # Phase 2 fixture
node scripts/probe-bitget-mcp.mjs --ticker MSFT
```

Node 18+, no dependencies, no key. It never throws — a refusal is a result, and
the body of the refusal is printed.

## Temporary artefacts, removed

Phase 1 needed three things that had no business reaching `main`, and all three
are gone:

- `api/probe-bitget.ts` — the preview-only route
- `.github/workflows/bitget-probe.yml` — the branch-scoped probe workflow
- the throwaway Vercel projects `nightbrief-bitget-probe` and
  `nightbrief-probe-phase1`

What remains is `scripts/probe-bitget-mcp.mjs`, this file, and the recorded
payload at `tests/fixtures/bitget-equity-price-quote-AAPL.json`. The script has
no dependencies, is imported by nothing, and does not ship in the bundle; it is
kept because the next person to ask whether this endpoint still behaves the way
it did needs the probe rather than a description of one.
