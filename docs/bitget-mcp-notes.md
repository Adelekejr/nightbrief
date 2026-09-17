# Bitget agent MCP — Phase 1 findings

**Status: viable. Phase 2 may proceed, with three constraints that change its
design.** Probed 2026-09-17 against `https://agent.bitget.com/mcp`.

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
| Confirmed from a Vercel function | **not yet** — deployed, unread |

## The timestamp question

**Yes. Two of them, and they agree.**

```
"last_timestamp": "2026-09-17T19:11:25.619389Z"     ISO-8601, UTC, microseconds
"time": 1789672285619                                same instant, epoch ms
```

Verified: `1789672285619` → `2026-09-17T19:11:25.619Z`, matching `last_timestamp`
to under a second. So the Phase 3 block **may state an observed time as well as
a retrieval time**, and the two are independently checkable against each other.

**But the quote is fifteen minutes old, and that is the finding that matters.**

| Run | Observed (`last_timestamp`) | Read at | Age |
| --- | --- | --- | --- |
| 1 | 19:11:25Z | 19:26:28Z | **15.0 min** |
| 2 | 19:13:15Z | 19:28:14Z | **15.0 min** |

Exactly fifteen minutes, twice, during US market hours — and the response names
its own upstream: `extra_params.source: "iex"`. This is a standard IEX delayed
feed. It is not a live quote, and the word "live" must not appear near it. It is
also not "last close": it is an intraday price from a quarter of an hour ago,
which is a third thing the interface does not currently have a label for.

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

## What is NOT established

**That a Vercel function can reach it.** The probe ran from a GitHub Actions
runner, because the machine doing this work is behind an outbound allowlist that
refuses both `bitget.com` and `*.vercel.app`. A runner is a different network on
different IPs, and `agent.bitget.com` is behind Cloudflare — this repository
already lost Stooq to a datacentre-IP refusal, so the substitution is not safe
to wave through.

A preview-only route exists for that verdict and is deployed. Opening it is the
remaining Phase 1 step:

    https://nightbrief-probe-phase1-adelekejrhammed-5250.vercel.app/api/probe

It answers with the same JSON shape as the script. `reachable: true` plus a
non-null `sample` closes the question.

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

## Temporary artefacts to remove before merge

Three things on this branch exist for Phase 1 only and must not reach `main`:

- `api/probe-bitget.ts` — the preview route (404s on production, but delete it
  rather than rely on the gate)
- `.github/workflows/bitget-probe.yml` — the branch-scoped probe workflow
- the two throwaway Vercel projects, `nightbrief-bitget-probe` and
  `nightbrief-probe-phase1`

`scripts/probe-bitget-mcp.mjs` and this file are the ones worth keeping.
