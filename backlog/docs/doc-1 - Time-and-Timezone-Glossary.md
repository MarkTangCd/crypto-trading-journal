---
id: doc-1
title: Time and Timezone Glossary
type: specification
created_date: "2026-07-22 23:40"
---

Companion glossary to decision-1 (all times fixed to UTC+8). Defines the
terms used when discussing time in this codebase so that "time" is never
ambiguous in tasks, reviews, or prompts.

## Terms

**Epoch milliseconds (epoch ms)** — The storage representation. A
timezone-agnostic integer count of milliseconds since 1970-01-01T00:00:00Z.
All persisted business times (`transactions.startTime`, `endTime`,
`preTrades.anchorMs`) and all inter-layer transport use epoch ms. Never
store or transport wall-clock strings.

**Candle seconds** — The CoinAnk klines API and lightweight-charts use
epoch _seconds_, not milliseconds. Multiply by 1000 at the boundary.
Skill schemas (`getKlines`, `analyzeMarketStructure`) take `anchorMs` in
milliseconds explicitly.

**Display timezone** — Fixed UTC+8, hardcoded project-wide. Not
browser-local, not server-local, not configurable. The only timezone in
which humans and the LLM ever see a formatted time.

**Wall-clock string** — A human-readable time such as `2026-07-23 14:30`.
In this project every wall-clock string is UTC+8 by definition: UI text,
chart axis labels, `datetime-local` form values, and LLM prompt/reply
content.

**`datetime-local` value** — The string a `<input type="datetime-local">`
holds (`YYYY-MM-DDTHH:mm`). Interpreted as UTC+8 wall-clock when parsed to
epoch ms, and generated from epoch ms via UTC+8 (round-trip stable).

**Record-keeping fields** — `createdAt`/`updatedAt`/`lastSignedIn` columns
using drizzle `mode: "timestamp_ms"`; they surface as JS `Date` objects on
read (unlike business time fields, which are raw numbers). Formatting
helpers must accept both.

**Anchor time (锚点时间)** — The reference "now" of a pre-trade session
(`preTrades.anchorMs`, backend fills `Date.now()` when null). Serialized
into the pre-trade prompt as a UTC+8 wall-clock string.

**LLM time contract** — The rule pair from decision-1: (a) every time
serialized into a prompt or tool result is pre-converted to UTC+8 and
labeled `UTC+8`; (b) the system prompt instructs the model to state all
times in UTC+8 and never convert timezones itself. Tool results that a
model may chain into `anchorMs` parameters carry raw epoch ms alongside
the UTC+8 text field.

**`shared/time.ts`** — The single choke point for all conversions between
epoch ms and UTC+8 wall-clock strings (planned by decision-1). Frontend
display, form parsing/seeding, chart label formatting, and prompt builders
all import from here. A bare `new Date(str)` parse or a raw date-fns
`format(ts, ...)` on a timestamp outside this module is a defect.
