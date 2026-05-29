# Design decisions — executive summary

Full spec: [`superpowers/specs/2026-05-28-trmnl-plugins-design.md`](superpowers/specs/2026-05-28-trmnl-plugins-design.md).
Implementation plan: [`superpowers/plans/2026-05-28-trmnl-plugins-implementation.md`](superpowers/plans/2026-05-28-trmnl-plugins-implementation.md).

## TL;DR

- **4 plugins** — transit (WMATA + Fairfax + alerts), Man Utd next-fixture / live, UCL table / bracket, Premier League table.
- **Pure TRMNL private plugins** — no backend; each plugin polls APIs directly and shapes data in Liquid.
- **Shared visual language** — dark title bar, monospace numerics, grayscale-filtered SVG logos; defined in `plugins/_shared/styles.css` and inlined per plugin during upload.
- **Local Node.js test harness** — render templates against captured JSON fixtures using `liquidjs` + `node:test`. No frontend build step.
- **Refresh cadence** — transit and Man Utd at 5 min (predictions + live scores age fast); UCL + EPL at 60 min (standings change slowly).
- **API key handling** — TRMNL form fields (defined in each plugin's `form-fields.yaml`), not committed to repo. Local dev uses `.env.local` (gitignored).

## Rejected alternatives

- **Cloudflare Worker proxy** for all 4 plugins — would simplify templates slightly but adds infra. Not worth it for the data shaping we need.
- **Mashups** (multiple plugins on one screen) — each plugin is information-dense; full-screen each is more readable.
- **Dynamic "nearest station" at runtime** — would require a backend. Static lookup at setup is simpler and equally good for a stationary device.

## Spec/plan defects caught during implementation

Real APIs diverge from third-party documentation. Captured live data revealed:

| What docs said | What the live API actually returns | Where it bit us |
|----------------|------------------------------------|-----------------|
| WMATA trains have `DirectionNum` | Trains have `Group` (`"1"`/`"2"`) | Transit metro grouping |
| Fairfax base URL `realtime.fairfaxcounty.gov` | NXDOMAIN — actual host is `www.fairfaxcounty.gov` | Polling URL |
| BusTime bulletins use `service-bulletins`/`name`/`subject`/`brief`/`detail`/`priority`/`service_affected` | Live API uses abbreviated `sb`/`nm`/`sbj`/`brf`/`dtl`/`prty`/`srvc` | Alerts footer template |
| football-data.org UCL stage is `LEAGUE_STAGE` | Live API uses `GROUP_STAGE` for the new 36-team league phase | UCL mode detection |
| football-data.org `venue` field "sometimes present" | Free tier never returns `venue` | Man Utd fixture fallback path |

All five corrected via doc-fix commits as the divergences surfaced. The spec and plan now describe what the APIs actually do.

## Why TDD with a custom render harness

TRMNL's preview-in-admin loop is slow (paste, save, wait for poll, inspect). A local renderer:

- Captures live API responses as fixtures once
- Renders templates against fixtures in <100 ms
- Asserts on output via `node:test` (e.g., "row contains Man Utd's TLA", "alert footer shows ⚠")
- Lets the author iterate Liquid without poking TRMNL admin until it's nearly right

The tradeoff: liquidjs is the closest faithful Liquid implementation in JS, but it doesn't perfectly mirror Shopify-flavor Liquid or TRMNL's specific extensions. We caught a few syntax differences during implementation (`for x in "a,b" | split: ","` doesn't work in liquidjs's for-tag; pre-assign the split array). Each was a 1-line fix.

## Repo idiosyncrasies

- **`form-fields.json` vs. `form-fields.yaml`** — Different files, different purposes. The JSON is for the local test harness (passed as the form-fields context to `renderTemplate`). The YAML is what you paste into TRMNL admin's form builder.
- **`{% include_raw %}` is local-only** — A custom Liquid tag registered in `tools/render-lib.mjs`. TRMNL admin doesn't support it; the per-plugin README spells out the manual CSS-inlining step before pasting markup.
- **`.superpowers/brainstorm/`** — Browser-rendered mockups from the design phase; gitignored, locally persisted under the repo. Each plugin's design was validated visually against an 800×480 to-scale mockup before any code was written.
