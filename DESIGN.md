---
name: Crypto Trading Journal
description: A watchmaker's notebook for one trader. Mono-forward, paper-pale, oversized numerals as the design.
---

# Design System: Crypto Trading Journal

## 1. Overview

**Creative North Star: "The Bench Notebook"**

A Lange & Söhne dial laid flat as a page. The journal opens with the calm of
a German watchmaker's workbench: paper-pale field, one ink for everything
that matters, and a single signal hue reserved for the moment a trade
resolves. Numerals carry the layout; copy is what fits around them. Nothing
on the page asks the trader to feel excited about a number; the number is
allowed to be the entire feeling.

The system explicitly rejects the visual grammar of the previous iteration
(pastel cool-gray SaaS dashboards), of crypto product marketing (gradients,
"ape in" energy, gamification), of the venue trader's instinct to surround
the user with panels (TradingView / exchange UI), and of the default-safe
"official design language" hedge (Apple HIG, Material). This product can be
opinionated to the point of being illegible to anyone else — that is a
feature of being a journal for one person.

The trader is in one of two modes when the journal is open: **recording** a
trade with high cognitive load, or **reviewing** past trades with cold
distance. Each page commits to one of those modes and makes it clear within
the first second.

**Key Characteristics:**

- Paper-pale background, near-black ink, **one** signal hue per state.
- Mono everywhere by default. Display, body, labels, numerals: one family.
- Oversized numerals as the anchoring visual element on every screen.
- Generous, asymmetric whitespace — never uniform card grids.
- Motion is feedback, never atmosphere.

## 2. Colors

**The One-Signal Rule.** A trade has exactly two states that matter (win and
loss); the palette has exactly two signal hues, used **only** for that
meaning. Charts, badges, copy emphasis, and decorative tinting may not
borrow either signal hue. If a UI element is colored, it is communicating
"win" or "loss"; otherwise it is ink or paper.

**The Paper-and-Ink Rule.** Body surfaces are paper (a true off-white at
chroma 0 or trending toward warm-ink at chroma ≤0.005). Text and rules are
ink (a near-black, never pure `#000`). There is no third neutral. Hierarchy
is built from weight and scale, not from a five-step gray ramp.

### Primary

- **Ink** `oklch(0.18 0 0)` (`--ink`): every meaningful character on the page — numerals, labels, dividers. Body text. The trading system name. The page title. Contrast against paper > 15:1.

### Signal (used only for trade-outcome semantics)

- **Win** `oklch(0.5 0.13 150)` (`--win`): a closed winning trade, a positive PnL number, a balance-curve segment trending up. Darkened from the seed target to clear AA against paper at body scale (~5.5:1).
- **Loss** `oklch(0.48 0.18 25)` (`--loss`): a closed losing trade, a negative PnL number, a streak counter once it reaches the alarm threshold. AA against paper at body scale (~6:1).

### Neutral

- **Paper** `oklch(0.985 0 0)` (`--paper`): page background, default surface. There are no card backgrounds tinted differently from the page; surfaces are the page.
- **Mist** `oklch(0.92 0 0)` (`--mist`): hairline rules, input bottom-borders, the only "border" the system carries. Used sparingly. Not for text.

### Dark mode

Dark mode is a minimal ink-on-paper inversion placeholder in `client/src/index.css`; it has not been designed yet and is not part of this committed system. A separate pass will commit dark-mode values when the journal needs them.

No accent color. No tertiary. No pastel anything. No `--color-pastel-blue`,
`--color-pastel-pink`, or any descendant of the previous palette.

### Named Rules

**The No-Card Rule.** No bordered card containers. Surfaces are the paper.
Visual grouping uses position, scale, and a single 1px mist rule, never a
filled rectangle.

**The Breakeven Is Ink Rule.** Breakeven trades carry **no** signal color.
They are reported in ink, like everything else. Color is reserved for actual
outcomes; "neither" is a non-event and should look like one.

## 3. Typography

**Display Font:** IBM Plex Mono, loaded from Google Fonts at weights 400 / 500 / 600.
**Body Font:** IBM Plex Mono. One typeface.
**Label / Mono Font:** IBM Plex Mono. The journal commits to one face across every role.

Berkeley Mono and JetBrains Mono were the alternative candidates; IBM Plex Mono won on grotesque-mono character + free Google-hosted licensing + complete weight range without bundling a paid file.

**Character:** A single grotesque monospace family carries the entire system.
Hierarchy is built from weight contrast (a thin-to-bold ramp ≥1.25 per step)
and scale. The mono is what makes a Lange dial out of a UI: numerals get
fixed-width discipline, prices line up vertically without `tabular-nums`
hacks, and the journal looks like it was typeset on a workbench rather than
a design tool.

Inter is removed from the body font stack.

### Hierarchy

- **Display** (mono, weight 500, `clamp(3rem, 8vw, 5.5rem)`, line-height 1): The hero numeral on a dashboard or detail page — current balance, win rate, R/R, position size. One per screen.
- **Headline** (mono, weight 500, ~2rem, line-height 1.1): Page title or system name.
- **Title** (mono, weight 500, ~1.25rem, line-height 1.2): Section anchors above a sequence of numerals.
- **Body** (mono, weight 400, 0.875–1rem, line-height 1.5): Reflection copy, descriptions, system notes. Cap line length at 65–75ch.
- **Label** (mono, weight 400, 0.75rem, letter-spacing 0.04em, set in lowercase or small-caps **only**): Field labels, axis ticks, table headers.

### Named Rules

**The One-Face Rule.** One typeface, every role. No serif display, no second
sans for body, no third icon font. If a page seems to need a second
typeface, the page needs less typography, not more.

**The Lowercase Label Rule.** Labels are lowercase, not ALL CAPS. Caps are
the SaaS dashboard tell; lowercase labels read as instrument calibration
marks.

**The Tabular Numerals Rule.** Every numeral that participates in a column
(transaction table, statistics grid, balance history) is set with
`font-variant-numeric: tabular-nums`. Numbers align vertically without
fiddling; misalignment in this system is a bug.

## 4. Elevation

Flat. There are no shadows in the journal.

Depth comes from **position**, **scale**, and the 1px **mist** rule (see
Colors). A heading is "above" a number because it is smaller and earlier in
the reading order, not because a card lifts off the page. The dashboard's
oversized PnL number is dominant because it is 5rem on a page of 0.875rem
labels, not because it has a glow.

The only "elevation" event in the entire system is the popover / dialog
layer: a thin 1px mist border and a flat surface, identical to the page
behind it, slid in or faded in. No backdrop blur, no scrim gradient, no
drop-shadow.

### Named Rules

**The No-Shadow Rule.** `box-shadow` is forbidden in component CSS. The only
acceptable use is a focus ring (`outline` or `box-shadow` as the focus
treatment), and only on interactive elements.

**The Square-Corner Rule.** `--radius: 0`. The journal is set in instrument
edges, not Apple HIG / Material rounded-corner safety. Buttons, inputs,
dialogs, badges, cards (the few that remain): all render as rectangles.
Avoid bringing back `rounded-*` Tailwind classes ad hoc; if a corner needs
to soften, the token changes, not the component.

## 5. Components

[Components are omitted in this seed. They will be populated on the next
`/impeccable document` run, after the refactor lands real button / input /
nav / chart primitives in `client/src/components/`. The current shadcn-based
components inherit the old palette and need to be re-tokenized before any
of them deserve a description here.]

## 6. Do's and Don'ts

### Do:

- **Do** make the primary numeral the largest element on every screen — balance, win rate, R/R, position size. If the number doesn't anchor the layout, the layout is wrong.
- **Do** report wins and losses in the same typographic register. Color separates them; nothing else does.
- **Do** use lowercase labels with `letter-spacing: 0.04em`. The instrument-marker look comes from this single rule.
- **Do** use `font-variant-numeric: tabular-nums` on every numeral in a column. Alignment is non-negotiable.
- **Do** suppress the oversized-numeral entrance under `prefers-reduced-motion: reduce`. Crossfade or instant.
- **Do** keep win / loss / breakeven distinguishable without color (label, position, or shape).

### Don't:

- **Don't** restore the pastel cool-gray SaaS dashboard look the previous iteration carried. No `--color-pastel-blue`, no `--color-pastel-pink`, no `oklch(0.94 0.01 250)` decorative surfaces. Both old custom tokens `--color-pastel-blue` and `--color-pastel-pink` should be deleted, not migrated.
- **Don't** import crypto-project gamification: purple/green hype gradients, "Ape in" CTAs, NFT-launch energy, animated chart wallpaper, anything that suggests the trader should feel excited rather than measured.
- **Don't** reach for exchange / TradingView UI grammar: multi-panel layouts, collapsible side panels everywhere, sticky toolbars on every edge, the "more panels = more professional" reflex.
- **Don't** fall back on Apple HIG / Material safety: rounded-corner-everything, the official-design-language hedge. The journal is allowed to have edges.
- **Don't** use card-shaped containers (`bg-card` over a rectangular `border` + `border-radius`). Group by position and a 1px mist rule, not a filled box.
- **Don't** use `box-shadow` for decoration. Focus rings only.
- **Don't** ALL-CAPS body copy, button labels, or section eyebrows. Labels are lowercase.
- **Don't** use a tiny tracked uppercase eyebrow above sections (the "ABOUT / PROCESS / PRICING" 2023 SaaS tell). Sections anchor on their numerals, not on kicker text.
- **Don't** use gradients on text (`background-clip: text`). Solid ink only.
- **Don't** use `border-left` greater than 1px as a colored stripe to mark status. State is communicated by the numeral and its signal color, not by a side-stripe.
- **Don't** add a second typeface "for variety." One face, every role.
