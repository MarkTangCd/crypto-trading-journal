# Product

## Register

product

## Users

A solo crypto trader (the project owner). The journal is used in two distinct
contexts, and the UI must respect both:

- **At the desk, mid-decision** — a position is open or about to open. The
  trader needs the current account balance, recent consecutive losses, active
  trading system, win rate, and a fast path to record the new trade. Cognitive
  load is already high; the interface must subtract from it.
- **Off-market, in review** — the trader is reading their own past trades and
  writing reflections. The interface should slow the user down, make the
  numbers undeniable, and reward honest reflection over speed.

There is no second persona to design for. The interface can be opinionated to
the point of being illegible to anyone else; that is a feature.

## Product Purpose

A crypto trading journal that records each trade with the rule-set (trading
system + tagged elements) that produced it, then surfaces the resulting
statistics (win rate, streaks, balance curve, per-system performance) so the
trader can audit which rules actually work.

Success is not "more trades logged." Success is:

1. The trader trusts the numbers on the dashboard enough to act on them
   (close a losing system, double down on a winning one).
2. New-trade entry is fast enough that the journal does not lose to "I'll
   record it later" (which means it is never recorded).
3. Reviewing a past trade feels like reading a clear primary source, not
   archaeology through a generic table.

## Brand Personality

**Calm, disciplined, instrument-grade.** The voice of a Swiss measuring tool,
not a trading platform.

Three words: **deliberate, exact, quiet.**

The interface should make the trader feel like an analyst, not a player. No
hype, no "let's go," no gradient confetti on a winning trade. A win and a loss
are reported with the same typographic restraint; the numbers themselves carry
the weight.

Numerals are the brand. Oversize, precise, monospaced where it matters
(prices, sizes, ratios). The page is built around the number, not around the
chrome that frames the number.

## Anti-references

Hard nos. If any of these can be identified in a screenshot, the design has
failed.

- **Pastel-cool-gray SaaS dashboard.** The previous iteration of this same
  project. Light gray bg, pastel blue/pink accents, rounded cards with icon +
  heading + text, generic "Scandinavian minimal" framing. This is the visual
  default the refactor exists to escape.
- **Crypto-project gamification.** Purple/green hype gradients, "Ape in"-style
  CTAs, NFT-launch energy, animated chart wallpaper, anything that suggests
  the user should feel excited rather than measured.
- **Exchange / TradingView UI grammar.** Densely packed multi-panel layouts,
  collapsible side panels everywhere, sticky toolbars on every edge, the
  "professional trader = more panels" reflex. This product has the luxury of
  being one trader's journal, not a venue.
- **Apple HIG / Material safety.** Rounded-corner-everything, official design
  language hedging. The journal is allowed to have edges, both literally and
  in voice.

## Design Principles

1. **The number is the design.** The primary metric on any screen — balance,
   win rate, R/R, position size — is the largest element on that screen and
   is set in a typographic style the rest of the page does not borrow. If the
   number does not anchor the layout, the layout is wrong.
2. **Discipline over excitement.** Wins and losses are reported in the same
   register. Color separates them (a single signal hue each), nothing else
   does. No celebration, no shame. The journal is a witness, not a coach.
3. **Two modes, one tool.** "Recording" and "Reviewing" are the only two
   activities that matter; every page belongs to one of them, and the page
   makes that clear within the first second. No screen tries to be both.
4. **Earn every panel.** A panel exists only if it carries decision-relevant
   information _at this moment_. The exchange-UI instinct to surround the
   user with available data is rejected; the journal answers one question per
   screen.
5. **Motion is feedback, not atmosphere.** Animation marks a state change
   (saved, recalculated, navigated). It is never decorative, never
   scroll-triggered ambience, never the reason a section appears.

## Accessibility & Inclusion

- WCAG **AA** as baseline (body text ≥4.5:1, large text ≥3:1, including the
  oversized numerals which often regress here on tinted bg).
- Respect `prefers-reduced-motion`: every transition has an instant or
  crossfade alternative, and the giant-number entrance is suppressed.
- Win / loss / breakeven must remain distinguishable without color (label,
  position, or shape — color carries the _vibe_, not the _meaning_).
- Keyboard-complete: new-trade form, review form, and navigation must all be
  fully operable without a pointer. This trader will reach for the keyboard
  mid-position.
