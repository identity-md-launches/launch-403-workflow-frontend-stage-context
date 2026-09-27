# Band design system

## Overview

Band is a single-page Sepolia pool interface for people checking an hourly price band and swapping ETH/BAND. Its light, quiet palette uses warm green neutrals, dark evergreen text and a lime primary action. Large numeric rates lead; a tick-position diagram explains the band without inventing a price history. The swap panel follows the pool data in DOM order. All choices are implementation decisions, not a separate user-approved brand specification.

Source of truth: `web/src/styles.css`, followed by component patterns in `web/src/App.tsx`. The root-level document requested in the generic criteria cannot be created under the overriding path budget; this document is the scoped equivalent.

## Colors

CSS uses sRGB hex primitives and semantic role aliases in `:root`. Apply role tokens to components instead of importing primitives directly.

| Semantic token | Value | Role |
| --- | --- | --- |
| `--color-page` | `#f4f5ee` | Page background |
| `--color-surface` | `#fafbf7` | Cards and controls |
| `--color-inset` | `#ebeee4` | Secondary panels, disabled buttons and segment track |
| `--color-text` | `#26352c` | Main text, active segment outline, current-price marker |
| `--color-muted` | `#576452` | Captions, helper text and secondary labels |
| `--color-border` | `#d2d8ca` | Structural card borders |
| `--color-input-border` | `#727c6c` | Input and band boundaries |
| `--color-accent` / `--color-accent-hover` | `#d8ef65` / `#cce252` | Primary swap/connect action |
| `--color-band` | `#f0f6d8` | Band plot fill |
| `--color-focus` | `#1c2922` | Three-pixel keyboard outline |
| `--color-success` / `--color-success-bg` | `#345e3a` / `#e7efe2` | Active band status |
| `--color-warning` / `--color-warning-bg` | `#80551c` / `#fbefd9` | Wrong chain, unavailable limit, stale-data guidance |
| `--color-error` / `--color-error-bg` | `#a23727` / `#fae9e5` | Recoverable errors |

There is one light theme. Status text accompanies colors. Measured rendered pairs: muted/page **5.71:1**, muted/surface **6.03:1**, primary text/lime **10.11:1**, active badge **6.35:1**, error notice **5.74:1**, input border/page **3.98:1**, focus/surface **14.54:1**. See the JSON measurement evidence under `docs/frontend/`; these do not establish every possible state or full accessibility compliance.

## Typography

The sole web font is **DM Sans Variable**, normal style, weight axis 100–1000. The interface uses 400, 500, 550, 600 and 650. Its Latin WOFF2 is bundled locally through `@fontsource-variable/dm-sans`; font display is `swap`, fallback `sans-serif`. The actual loaded font was checked in Chromium. No external font service is used. Technical addresses use `ui-monospace, SFMono-Regular, Consolas, monospace`.

`--text-body` is 1rem, `--text-small` .875rem, `--text-caption` .8125rem and `--text-title` 1.375rem. Dense metadata uses .75rem. The page heading is `clamp(2.45rem, 4.9vw, 4rem)`, weight 500, line-height 1.1, tracking -.055em; at 480px and below it becomes 2.55rem. Section headings use 1.25 line-height. Body text uses 1.5; explanatory content uses 1.7. Rates use `clamp(1.75rem, 2.65vw, 2.4rem)`, line-height 1.3 and tabular numbers. Rates become 2.25rem at 800px, then 1.8rem at 480px. The amount input is 2rem; the price select is 1rem on mobile.

Headings balance wrapping; prose uses `text-wrap: pretty`. Rates, balances and receipts use tabular numbers. Long addresses wrap without truncation in deployment details. The header shows a short address with the full address in its accessible name and title. Display rates use up to six significant digits; tiny rates use scientific notation with four fractional digits; transaction encoding uses integers, not display strings.

## Layout

`.wrap` has a 1280px maximum width, auto inline margins, and 40px inline padding. Main spacing steps are 8, 12, 16, 20, 24, 28, 32, 40 and 48px. Card content aligns to shared leading edges. Cards sit in `.dashboard`, a `1.55fr / minmax(340px,1fr)` grid with a 24px gap; content determines height.

- At **1050px**, page padding becomes 28px, card padding 22px, the grid becomes `1.25fr / minmax(320px,1fr)` with an 18px gap, and explanation columns become two.
- At **800px**, the dashboard becomes one column, the hero's testnet note moves below its copy, navigation links disappear, and deployment details become one column. Cards use 26px padding. All primary controls remain in document flow.
- At **480px**, page padding becomes 16px, card padding 20px, card radius 18px, price metrics become one column and explanation steps stack. The 320px live prices remain on one line.

The plot has a fixed 124px graphic height, a centered 78%-width band and equal outer segments. Text lives outside the graphic or in a small labeled empty state. Its horizontal axis is tick space, not elapsed time. Current tick is clamped visually to the plot bounds when outside, with an explicit outside-band status and exact tick in the accessible description.

Observed widths: 1440, 800, 390 and 320 CSS pixels. Tests also exercise 200% text enlargement and RTL reflow as stress cases. This does not claim browser-native zoom, translated copy, or physical-device testing.

## Elevation & Depth

The interface is flat: no shadows, blur, gradients, overlays or modal layers. One-pixel borders structure surfaces; filled inset panels group secondary content. The only elevated element is the keyboard skip link when focused. The band diagram uses a restrained repeating vertical grid, plus distinct current and average markers.

## Shapes

`--radius-card` is 24px and `--radius-control` is 12px. Mobile cards use 18px. Amount and receive panels use 14px; notices use 8px; small badges use 6px. Buttons have at least 44px height, except 40px direction controls inside the padded segment group. The primary button is at least 52px high. The SVG brand mark and ETH/BAND pair markers are local assets; decorative SVG paths use `currentColor` and 1.7px strokes.

## Components

Patterns live in `web/src/App.tsx`; these are page components, not a published component library.

| Pattern | API / class | Behavior |
| --- | --- | --- |
| Status | `Badge({children, tone})` | Text plus a dot; neutral, success or warning |
| Rate | `Rate({value, inverse})` | Numeric price with unit; em dash when unknown |
| Band diagram | `BandPlot({market, config})` | Current, average and edges; explicit inactive/loading state; accessible text equivalent |
| Icons | `Icon({name})` | Arrow, refresh, external link and check; decorative |
| Primary action | `.primary` | One lime action; connect, switch, approve, preview or confirm according to prerequisites |
| Direction | `.direction` | Two native buttons with `aria-pressed`; selected outline; keyboard activation |
| Amount | `.amount-box` | Visible label, decimal keyboard, token unit, balance and linked validation text |
| Review | `.review` | Signed-call simulation amounts, partial-fill status, expiry and execution limits; expandable quote details |
| Notices | `.notice.error`, `.notice.warning` | Local recovery guidance; errors use `role=alert`; persistent action status uses `role=status` |
| Deployment | `.deployment-details` | Native details/summary; full addresses, observations and explorer links |

Every keyboard focus uses a 3px dark outline with a 4px offset. Form controls have actual labels. Disabling transaction controls when prerequisites fail is intentional. The UI has no focus-trapping overlay. Hover changes background; pressed buttons scale to .96 only under `prefers-reduced-motion: no-preference`, with 120ms transitions and `cubic-bezier(.2,0,0,1)` for scale. There are no automatic entrance animations. Forced-colors styles use system focus and border colors; actual OS high-contrast behavior was not tested.

## Do's and Don'ts

- Start another section inside `.wrap`; use the existing text and spacing roles. Reuse `Badge`, `Rate`, and button classes where their behavior fits.
- Keep a single lime transaction action. Preserve visible chain, unit, testnet and stale-state labels.
- Pair any plot with exact textual values. Do not draw a historical line from the single current observation or treat unavailable data as zero.
- Load deployment data and ABIs through the manifest loader. Do not hard-code alternative addresses in a new component.
- Keep long addresses available, dynamic values tabular, and all controls in mobile reading order.
- Recheck both live-size numbers and mocked transaction states after a layout change. A successful build alone does not establish rendered quality.

Design guidance attribution and license references are in `docs/frontend/ATTRIBUTION.md`; the six-domain review and limitations are in `docs/frontend/VALIDATION.md`.
