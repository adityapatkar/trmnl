# TRMNL Plugins

Six private plugins for a TRMNL e-ink display (800×480), driving:

| plugin | what it shows | refresh |
|--------|----------------|---------|
| [`plugins/transit`](plugins/transit/) | next trains (WMATA) + next buses (Fairfax Connector) + service alerts + Capital Bikeshare | 5 min |
| [`plugins/man-utd-fixture`](plugins/man-utd-fixture/) | Man Utd next fixture; auto-switches to a live score view during matches | 5 min |
| [`plugins/ucl-table`](plugins/ucl-table/) | UCL league-phase table → knockout bracket | 60 min |
| [`plugins/epl-table`](plugins/epl-table/) | Premier League table | 60 min |
| [`plugins/world-cup`](plugins/world-cup/) | 2026 FIFA World Cup — 12 group tables → knockout bracket | 60 min |
| [`plugins/blackboard-week`](plugins/blackboard-week/) | Blackboard: rolling 7-day agenda of classes and assignment deadlines | 60 min |

Pure private plugins — no backend, no proxy. Each gets its data straight from the source and shapes it for the screen. Most use TRMNL's Polling strategy and do their work in Liquid; two shape their payload in a sandboxed JS function first, and `blackboard-week` runs entirely in one because TRMNL's polling layer discards a `text/calendar` body.

A local Node.js test harness renders templates against captured fixtures so you can iterate without paste-and-refresh cycles in the TRMNL admin. It runs the sandbox functions the same way TRMNL does, and can freeze their clock so previews with countdowns are reproducible.

## Quickstart

```bash
git clone https://github.com/adityapatkar/trmnl
cd trmnl
nvm install   # picks up .nvmrc (Node 22+)
npm install
npm test      # runs all plugin test.mjs files
```

Then follow [`docs/setup.md`](docs/setup.md) to:

1. Enable TRMNL Developer Perks on your account.
2. Get three free API keys (WMATA, Fairfax Connector BusTime, football-data.org).
3. Look up your nearest WMATA station + 2-3 nearest Fairfax Connector stop IDs.
4. Install each plugin in TRMNL admin (form fields via YAML import, markup via copy-paste with the shared CSS inlined).
5. Assign all four to a device playlist.

## Repo layout

```
trmnl/
├── README.md
├── docs/
│   ├── setup.md                  # end-to-end install guide
│   ├── design-decisions.md       # exec summary
│   └── superpowers/              # full spec + implementation plan
│       ├── specs/
│       └── plans/
├── tools/
│   ├── render-lib.mjs            # liquidjs wrapper
│   ├── render.mjs                # CLI: stdout-render a template against fixtures
│   ├── preview.mjs               # CLI: write a browser-openable 800×480 preview
│   └── *.test.mjs                # tool tests
├── plugins/
│   ├── _shared/styles.css        # design tokens shared by all plugins
│   ├── transit/
│   │   ├── README.md             # plugin-specific config
│   │   ├── markup.liquid         # template (uses {% include_raw %} for shared CSS)
│   │   ├── form-fields.yaml      # TRMNL admin form-builder definition
│   │   ├── form-fields.json      # placeholders for the local test harness
│   │   ├── transform.js          # optional: reshapes the payload before Liquid
│   │   ├── test.mjs              # node:test cases
│   │   └── samples/              # captured/synthesized fixtures
│   ├── man-utd-fixture/  (same shape)
│   ├── ucl-table/        (same shape)
│   ├── epl-table/        (same shape)
│   ├── world-cup/        (same shape)
│   └── blackboard-week/  (same shape, but serverless.js in place of transform.js,
│                         plus a gitignored local/ holding the real feed + schedule)
└── .gitignore                    # excludes node_modules, .env.*, .superpowers, plugins/*/local
```

## Local development workflow

For any plugin, iterate locally:

```bash
# 1. Edit plugins/<name>/markup.liquid
# 2. Re-render the preview
node tools/preview.mjs --template plugins/<name>/markup.liquid \
  --form-fields plugins/<name>/form-fields.json \
  --idx-0 plugins/<name>/samples/<fixture>.json \
  --out plugins/<name>/preview.html
open plugins/<name>/preview.html
# 3. Run the tests
node --test plugins/<name>/test.mjs
# 4. Once happy, copy markup into TRMNL admin (inlining shared CSS first — see plugin README)

# If the plugin has a transform.js / serverless.js, run it too — otherwise the
# preview renders against a payload the device never sees. --now freezes its
# clock, so countdowns don't drift between runs:
node tools/preview.mjs --template plugins/<name>/markup.liquid \
  --form-fields plugins/<name>/form-fields.json \
  --idx-0 plugins/<name>/samples/<fixture>.json \
  --transform plugins/<name>/transform.js \
  --now 2026-09-07T12:14:00Z \
  --out plugins/<name>/preview.html

# A fixture that isn't .json is passed to the template as raw text, which is how
# blackboard-week previews an .ics feed.
```

## Docs

- [`docs/setup.md`](docs/setup.md) — account, API keys, station/stop lookup, install order
- [`docs/design-decisions.md`](docs/design-decisions.md) — executive summary
- [`docs/superpowers/specs/2026-05-28-trmnl-plugins-design.md`](docs/superpowers/specs/2026-05-28-trmnl-plugins-design.md) — full design spec
- [`docs/superpowers/plans/2026-05-28-trmnl-plugins-implementation.md`](docs/superpowers/plans/2026-05-28-trmnl-plugins-implementation.md) — implementation plan

Per-plugin docs are in each `plugins/<name>/README.md`.
