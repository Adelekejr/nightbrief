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
| Model | pending ListModels verification |
| News sources | not wired |
| Price data | not wired |

Nothing currently rendered in the interface is market data, because no market
data is wired up yet.

## Model

Google Gemini, free tier (Flash only — Pro requires billing).

The model ID is not taken from memory. `/api/models` calls ListModels on
`generativelanguage.googleapis.com` and returns the Flash models the key can
actually reach.

- **Model ID:** _pending verification_
- **Verified on:** _pending_

## Data sources

_To be recorded here as each is wired up, stating plainly which are live and
which are sample._

## Security

`GEMINI_API_KEY` is a server-side environment variable, read only inside
serverless functions. It is never bundled into client code and is never
prefixed `VITE_` — anything so prefixed is shipped to the browser by Vite.
The key is sent to Google in a request header rather than a query string, so it
cannot be captured in a URL or access log.

## Stack

Vite · React · TypeScript · Tailwind · Vercel serverless functions.
