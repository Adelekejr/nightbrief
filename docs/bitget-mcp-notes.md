# Bitget agent MCP — Phase 1 probe

**Status: blocked, not answered. Phase 2 must not begin on this.**

Probed 2026-09-17 against `https://agent.bitget.com/mcp`, HTTP transport,
documented as keyless.

## The short version

The probe could not leave the machine it ran on. The environment this work was
done in enforces an outbound allowlist, and the entire `bitget.com` domain is
outside it — as is `nightbrief.vercel.app`. Every attempt was refused at the
egress proxy's `CONNECT`, before a single byte reached Bitget.

**Nothing here is evidence about Bitget.** Not that it works, not that it
doesn't. The question Phase 1 asks is still open, and the run that answers it
has to happen somewhere with open egress.

## What was actually established

| Claim | Status |
| --- | --- |
| `agent.bitget.com` is a real, resolving host | **yes** — `104.18.8.145`, `104.18.9.145`, CNAME `agent.bitget.com.cdn.cloudflare.net` |
| It sits behind Cloudflare | **yes** — from that CNAME |
| A server-side client can complete the MCP handshake against it | **unknown** |
| It needs no account or API key | **unverified** — documented, not observed |
| Tool names, input schemas, response shapes | **unknown** — none were discovered |
| Rate limits, latency, session behaviour | **unknown** |
| A Vercel function can call it | **unknown** |

The tool names, the AAPL response shape and the rate limits that Phase 1 asks
for are absent from this document because they were never observed. Writing
down the documented names instead would have produced a file that reads like a
finding and is a guess, which is the failure mode Phase 1 exists to avoid.

## Evidence

The egress proxy's own record, six denials across four hosts:

```
connect_rejected  gateway answered 403 to CONNECT   agent.bitget.com:443
connect_rejected  gateway answered 403 to CONNECT   api.bitget.com:443
connect_rejected  gateway answered 403 to CONNECT   www.bitget.com:443
connect_rejected  gateway answered 403 to CONNECT   nightbrief.vercel.app:443
```

`github.com` completes a tunnel from the same machine in the same minute, so
this is a per-host policy and not a broken network. `nightbrief.vercel.app`
appearing on that list is the giveaway: the app's own production URL is refused
too, and nobody thinks the deployed app is down.

## The probe itself works

`scripts/probe-bitget-mcp.mjs` was run against a local stub speaking the same
transport, to separate "the probe is wrong" from "the endpoint refused us".
Against the stub it completed the full sequence:

```
ok   initialize                 200  68ms     (SSE response, session id issued)
ok   notifications/initialized  202  4ms
ok   tools/list                 200  2ms      3 tools discovered
ok   tools/call                 200  2ms      get_stock_quote AAPL
FAIL tools/list                 200  2ms      session required   <- cold-call branch
```

That exercises every path the real run needs: the SSE form of a Streamable HTTP
reply, `mcp-session-id` capture and echo, discovery, argument inference from a
tool's own `inputSchema`, and the deliberate final call without a session id
that tells us whether one-shot use is viable from a serverless function.

The stub also offered a `place_spot_order` tool. The probe's ranking scored it
below zero and never called it — the read-only constraint is enforced in the
probe, not just promised.

## Why even an unblocked run from a laptop would not settle it

This repository has already been taught this lesson once. From the README:

> Stooq was tried first and refused: it answers a datacentre IP with a
> JavaScript browser-verification page.

`agent.bitget.com` is behind Cloudflare, and Vercel functions run on datacentre
IPs. A successful handshake from a residential connection would be encouraging
and would still not answer the Phase 1 question, which is specifically whether a
**Vercel serverless function** can reach it. A run from a laptop is worth
having — it discovers the tool names and response shapes cheaply — but the
verdict has to come from a deployed function.

So the run is two runs:

1. **Local** — discover tool names, schemas, one real AAPL response, latency.
   Capture with `--json`; that file becomes the Phase 2 fixture.
2. **Deployed** — the same probe from a Vercel preview, proving the datacentre
   path. Only this one is the go/no-go.

## How to run it

```sh
node scripts/probe-bitget-mcp.mjs                  # human-readable
node scripts/probe-bitget-mcp.mjs --json > probe.json   # Phase 2 fixture
node scripts/probe-bitget-mcp.mjs --ticker MSFT
```

Node 18+, no dependencies, no key. It never throws: a refusal is a result, and
the body of the refusal is printed, because a WAF or an interstitial explains
itself in that body.

## What the run must come back with, before Phase 2 starts

- The handshake completed, and whether the reply was JSON or SSE.
- Whether an `mcp-session-id` was issued, and whether a call without one is
  refused. If every invocation must re-handshake, each Brief pays two round
  trips instead of one, and the Phase 2 timeout budget has to absorb that.
- The real tool names, verbatim, with input schemas.
- One complete AAPL response, verbatim.
- **Whether the payload carries its own timestamp.** This is the one that
  decides how the Phase 3 block can be worded. No timestamp in the payload
  means the block can only state a retrieval time, never an observed time, and
  the word "live" cannot appear anywhere near it.
- Latency, and any `ratelimit` or `retry-after` header.

## If it turns out to be unreachable from Vercel

Say so and stop; that is a completed Phase 1, not a failed one. The fallbacks,
in the order they preserve the brief's constraints:

1. **Bitget's public REST market endpoints** instead of the agent MCP surface —
   same provider, same read-only intent, an ordinary HTTPS call a serverless
   function makes without a session. This changes the wire format inside
   `lib/providers/bitget-mcp.ts` and nothing above it.
2. **Drop the provider and keep the block.** The "Market context" block of
   Phase 3 is worth building over Yahoo alone, with Yahoo named in it. The
   provenance plumbing is the valuable part, and it is provider-agnostic.
3. **Neither.** A US-listed underlying quote is already in the app, correctly
   labelled. If Bitget adds nothing an rToken holder can act on, the honest
   outcome is not to add a second source of the same number.

Option 1 is the one to try first. Option 3 stays on the table.
