# Baseline Measurements (before redesign)

Captured: 2026-10-05

## Build Sizes (before)

```
npm run build output:

dist/index.html                   0.65 kB | gzip:   0.41 kB
dist/assets/index.css            25.02 kB | gzip:   5.42 kB
dist/assets/index.js            383.78 kB | gzip: 111.42 kB
```

Single monolithic JS chunk — no code splitting. JS gzip: 111 KB (budget: under 200 KB).

## Horizontal Scroll Issues (before)

| Viewport  | Page         | Cause                                                            |
|-----------|--------------|------------------------------------------------------------------|
| 320-375px | All          | nav `overflow-x-auto` — nav items cause horizontal scroll        |
| 320-375px | Schemas      | 9-column data table — no responsive stacking                     |
| 320-375px | Proposal     | 5-column field-mappings table                                    |
| 320-375px | Dry Run      | 5-column quarantine table                                        |
| 320-375px | Audit        | `<pre>` JSON payloads — no overflow-wrap                         |
| 320-375px | Plan Editor  | Inline transformation rule rows overflow                         |

## Design Notes (before)

- Theme: Dark glassmorphism (#0b0f19 background, slate-100 text)
- Colors: Hardcoded in JSX — indigo-600, sky-400, emerald-400, rose-400 etc.
- Fonts: Google Fonts Inter + JetBrains Mono via @import (render-blocking)
- Effects: backdrop-filter blur(12px), gradient text, gradient borders, animated spin
- Nav: Icons-only on mobile (text hidden md:inline), overflows with overflow-x-auto
- Corners: rounded-xl, rounded-2xl throughout
- Shadows: Coloured glow shadows (shadow-indigo-600/30 etc.)
- Dark mode forced: color-scheme: dark in :root
- No per-route titles or meta descriptions

## Lighthouse Baseline (estimated)

Browser agent unavailable for automated Lighthouse during baseline.
Estimated from code inspection:
- Performance: ~60-70 (monolithic JS, web font import, no code splitting)
- Accessibility: ~75-85 (missing aria labels, contrast issues in dark theme)
- Best Practices: ~80-90
- SEO: ~70 (one static meta description for all routes)

## Route Titles (before)

All routes share the static title from index.html:
"Agentic Data Migration Planner & Reconciliation Workbench"

## After Targets

- JS gzip: under 200 KB (code split per route)
- No horizontal scroll at 320px and up
- Unique titles + meta descriptions per route
- Lighthouse 90+ on all categories
