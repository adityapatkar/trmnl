# TRMNL Plugins — Design Spec

Date: 2026-05-28
Author: aditya.patkar@pwin.ai
Status: Awaiting approval (v2 — adds live scores, service alerts, knockout bracket)

## Overview

Build four private plugins for a TRMNL e-ink display (800×480, 2-bit grayscale):

1. **Transit** — next-train predictions at the WMATA station nearest the user's chosen lat/long (both directions) and next-bus predictions at the 2–3 nearest Fairfax Connector stops. The station/stop IDs are configured as TRMNL form fields, so the plugin is location-agnostic — the user supplies coordinates once, the nearest IDs are looked up at setup time, and those IDs become the form-field values.
2. **Man Utd next fixture / live** — when no match is in progress, shows the next single upcoming match across all competitions (crests, kickoff time, countdown, venue). When a match is in progress, automatically switches to a live score view (score, minute, half-time indicator, same crests/venue/competition).
3. **UEFA Champions League** — during league phase, shows the full 36-team league table in two columns (Man Utd row highlighted). Once the league phase ends and the knockout rounds begin, automatically switches to a knockout-bracket view (Playoff → R16 → QF → SF → Final) showing matchups, aggregate scores, and status.
4. **Premier League table** — full 20-team table in two columns, Man Utd row highlighted.

All four are independent TRMNL "private plugins" using the Polling strategy. No backend. Each occupies the full screen; the device rotates between them on a playlist.

## Scope

### In scope

- Four private plugins, importable as TRMNL JSON exports.
- HTML/Liquid markup templates per plugin, source-controlled.
- Configuration documented per plugin (polling URL, headers, form fields, refresh interval).
- Visual language shared across plugins (dark title bar, monospace numerics, real club/agency logos via grayscale-filtered SVGs).
- Edge-case handling in templates (missing API key, empty response, API errors).
- Setup guide for TRMNL account + three API keys (WMATA, Fairfax Connector BusTime, football-data.org).

### Out of scope (deferred)

- Multi-station / multi-stop dynamic "nearest" lookup at runtime. Locations are configured statically via form fields.
- TRMNL mashups (combining plugins on one screen). Plugins are each full-screen.
- Service alerts for WMATA lines or Fairfax routes *other than* the ones the user's chosen station/stops are on. (We filter alerts down to relevant lines/routes only — see Plugin 1.)
- Goal scorers / yellow & red cards / xG in the live Man Utd view (just score + minute + half indicator).
- Post-match summary view. After a match ends (status `FINISHED`), the Man Utd plugin reverts to the next-fixture view, which will show whatever match is now next.
- UCL Conference League equivalent / Europa League / other competitions. Just PL and UCL.
- Plugin-merge or webhook strategies. Polling only.
- Push notifications, sound, or any non-display output.

## Architecture

**Approach A — Pure private plugins, no backend.** Each plugin polls its API(s) directly via TRMNL's polling URLs. All data shaping happens inside Liquid templates. Decision rationale:

- TRMNL's polling URL strategy supports JSON, RSS, XML, plaintext, and CSV responses. All three target APIs return JSON.
- Liquid's `sort`, `where`, `slice`, math, and date filters cover everything we need: sorting predictions by minutes-to-arrival, taking the next N matches, highlighting one row. Grouping (e.g., bus predictions by stop) is done via `where` + iteration rather than relying on a `group_by` filter — Shopify-flavor Liquid doesn't include one and we can't assume TRMNL provides it.
- API keys live in TRMNL form fields, interpolated into URLs and headers. They never enter the repo.
- No hosting, no secrets management, no extra moving parts.

Rejected alternatives:

- **B (Cloudflare Worker for all 4)**: would clean up templates slightly but adds infra. Free tier easily covers it, but the maintenance surface (deploy pipeline, secrets, monitoring) outweighs the template-readability gain.
- **C (Worker only for Man Utd)**: not needed because football-data.org's `?status=SCHEDULED&limit=1` query already returns the next single match directly.

### Plugin lifecycle

1. Account: enable TRMNL Developer Perks (or BYOD license) — required for private plugins.
2. API keys: obtain WMATA developer key, Fairfax Connector BusTime key, and football-data.org key.
3. For each plugin, in TRMNL admin:
   - Create new private plugin.
   - Set strategy = Polling.
   - Add polling URL(s) and headers (with form-field interpolation).
   - Add form fields (with default values).
   - Paste markup from `plugins/<name>/markup.liquid`.
   - Save and preview.
4. Once verified: export plugin JSON from TRMNL admin and commit to `plugins/<name>/plugin-export.json` for backup/portability.
5. Assign plugin to device playlist; device cycles through the four plugins.

## Repo structure

```
trmnl/
├── README.md                          # quickstart: how to install each plugin
├── docs/
│   ├── setup.md                       # TRMNL account, three API keys, walkthrough
│   ├── design-decisions.md            # this file's executive summary + rationale
│   └── superpowers/specs/             # design + implementation plan (this doc lives here)
└── plugins/
    ├── transit/
    │   ├── README.md                  # plugin-specific config
    │   ├── markup.liquid              # full-view template
    │   ├── sample-response-wmata.json # captured for offline iteration
    │   ├── sample-response-fairfax.json
    │   └── plugin-export.json         # produced after first save in TRMNL admin
    ├── man-utd-fixture/
    │   ├── README.md
    │   ├── markup.liquid
    │   ├── sample-response.json
    │   └── plugin-export.json
    ├── ucl-table/
    │   └── (same shape)
    └── epl-table/
        └── (same shape)
```

## Common concerns

### Form fields & secrets

API keys are TRMNL form fields, not repo content. Each plugin defines the keys it needs as form fields with blank defaults; the user fills them in TRMNL admin. The markup and polling URL reference them via `{{ key_name }}` interpolation.

### Headers configuration

TRMNL accepts headers in `key=value&key=value` format with Liquid interpolation. Special characters URL-encoded. WMATA uses an `api_key` header; football-data.org uses `X-Auth-Token`; Fairfax BusTime uses a `key=` query string parameter (not a header), so the key appears in the polling URL directly.

### Refresh cadence

- **Transit: 5 minutes.** Covers train/bus ETAs (which age fast) and service alerts (which we want to surface quickly).
- **Man Utd: 5 minutes.** Needed because we now also render live scores when a match is in progress. Outside of match days the same 5-min cadence is wasteful but harmless — TRMNL only re-renders when the data changes, and football-data.org's free-tier 10-req/min budget easily absorbs it (max ~0.5 req/min average across all four plugins; see math below).
- **UCL table / bracket: 60 minutes.** Standings change at most daily; bracket changes at most every few days during knockouts.
- **EPL table: 60 minutes.** Same reasoning.

**Rate-limit math (football-data.org, 10 req/min free):**

- Man Utd: 5 min × 2 URLs = 24 reqs/hour → 0.40/min average
- UCL: 60 min × 2 URLs = 2 reqs/hour → 0.03/min average
- EPL: 60 min × 1 URL = 1 req/hour → 0.02/min average
- **Total: ~0.45 req/min average** — comfortably under the 10/min ceiling, with room for burst tolerance.

WMATA and Fairfax have their own quotas. WMATA's free Default Tier is 10 req/sec and 50k req/day. Fairfax BusTime (Clever Devices) typically allows tens of thousands of requests per day. Both transit polls run 2 URLs every 5 min = ~576 req/day per provider, far under either ceiling.

### Visual language (all four plugins)

Shared design tokens, so the device feels like one product:

- **Title bar**: white background, 2–3px bottom border, real logo on the left (SVG, grayscale-filtered for e-ink), bold ALL-CAPS title with subtitle, monospace meta block on the right (last-updated + refresh interval).
- **Body type**: Inter (or system sans-serif) for prose; JetBrains Mono / SF Mono for any tabular numerics.
- **Color**: black on white only. Tonal hierarchy via weight (400–900) and spacing, not grays beyond `#555` for secondary text.
- **Data emphasis**: dark header strip (`#111` background, white text) for table headers and PIDS-style train rows. Pill-style ALL-CAPS labels for line codes ("SV") and route numbers ("423").
- **Highlighting**: inverted row (black background, white bold text) for Man Utd in tables.
- **Logo handling**: external image URLs from each API's response or from Wikipedia commons (for league/agency marks). Always wrapped with CSS `filter: grayscale(100%) contrast(1.4–1.6) brightness(0.85–0.95)` so colored crests reduce to clean 2-bit-friendly shapes.

### Edge cases (handled in templates)

Every plugin handles, at minimum:

- **API key missing**: render a short "Add your API key in plugin settings" message in place of data.
- **Empty data response**: render a placeholder ("No predictions" / "Off-season — no fixture scheduled" / "Standings unavailable").
- **API error body** (e.g., Fairfax BusTime's `error` array, football-data.org's `message` on quota): render the first error message in place of data.

### Liquid patterns used

- `{% assign x = IDX_0.field | where: "key", "value" | sort: "minutes" %}` — filter and sort arrays.
- `{{ utc_date | date: "%a %d %b · %H:%M" }}` — format ISO timestamps using the device's timezone (TRMNL applies the timezone automatically).
- `{% if x == blank %}` — empty-state branching.
- `{% for row in table limit: 18 %}` — slicing.
- `{% if team.id == highlight_team_id %}class="mu"{% endif %}` — conditional class for the highlight row.

## Plugin 1 — Transit

### Polling URLs (line-separated)

```
https://api.wmata.com/StationPrediction.svc/json/GetPrediction/{{ wmata_station_code }}
{{ fairfax_base_url }}/getpredictions?key={{ fairfax_api_key }}&stpid={{ fairfax_stop_ids }}&format=json
https://api.wmata.com/Incidents.svc/json/Incidents
{{ fairfax_base_url }}/getservicebulletins?key={{ fairfax_api_key }}&stpid={{ fairfax_stop_ids }}&format=json
```

URLs 1–2 are predictions (next trains, next buses). URLs 3–4 are active service alerts (WMATA rail incidents, Fairfax service bulletins). All four fetch in the same poll cycle.

### Headers

```
api_key={{ wmata_api_key }}
```

(The `api_key` header is consumed by both WMATA endpoints. Fairfax ignores headers it doesn't recognize.)

### Form fields

| key                  | label                          | default                                            |
|----------------------|--------------------------------|----------------------------------------------------|
| `wmata_api_key`      | WMATA API key                  | *(blank — required)*                               |
| `wmata_station_code` | WMATA station code             | *(blank — set during setup from lat/long lookup)*  |
| `wmata_station_name` | WMATA station display name     | *(blank — matches the chosen station)*             |
| `fairfax_api_key`    | Fairfax BusTime API key        | *(blank — required)*                               |
| `fairfax_stop_ids`   | Comma-separated stop IDs       | *(blank — set during setup, 2–3 nearest stops)*    |
| `fairfax_base_url`   | BusTime API base URL           | `http://realtime.fairfaxcounty.gov/bustime/api/v3` |

The transit plugin's two metro-direction labels (e.g., "Toward Largo" and "Toward Ashburn") are not hard-coded; they're derived from the `Group` field (WMATA's "1"/"2" track identifier) and the most common `DestinationName` per group in the response, so the plugin labels itself correctly regardless of which station the user picks.

### Data shape

- `IDX_0.Trains[]` — `Line` (line code: `"SV"`, `"OR"`, `"BL"`, `"RD"`, `"GR"`, `"YL"`), `Destination`, `DestinationCode` (may be `null`), `DestinationName`, `LocationCode`, `LocationName`, `Min` (number, `"ARR"`, `"BRD"`, or `"---"`), `Group` (`"1"` or `"2"` — the WMATA-internal direction code; group 1 = one platform/track, group 2 = the other), `Car` (`"6"` or `"8"`).
- `IDX_1["bustime-response"].prd[]` — `rt` (route), `rtdir` (direction), `des` (headsign), `stpnm` (stop name), `stpid`, `prdctdn` (countdown: `"DUE"` or minutes), `prdtm` (timestamp), `dyn` (delay flag).
- `IDX_1["bustime-response"].error[]` — error objects when something fails.
- `IDX_2.Incidents[]` — WMATA rail incidents: `IncidentID`, `Description`, `DateUpdated` (ISO), `IncidentType` (e.g., `"Alert"`, `"Delay"`), `LinesAffected` (string of semicolon-separated line codes — e.g., `"SV;OR;"`).
- `IDX_3["bustime-response"]["service-bulletins"][]` — Fairfax service bulletins for the configured stops: `name`, `subject`, `brief` (short text), `detail` (long text), `priority` (`"Low"`/`"Medium"`/`"High"`), `service_affected[]` (objects scoping to specific routes/stops/direction).
- `IDX_3["bustime-response"].error[]` — same error shape as predictions.

### Shaping logic

- **Trains**: parse `Min` ("ARR"/"BRD" → 0). Sort ascending. Group by `Group` (WMATA's "1"/"2" track code). For the direction label, take the most common `DestinationName` within each group. Take first 4 per group.
- **Buses**: parse `prdctdn` ("DUE" → 0). Sort ascending. Group by `stpid` (or `stpnm`). Take first 3–4 per stop.
- **Rail alerts (filter to our lines)**: derive the set of line codes serving the configured station from the first `Trains` entry's `Line` field (every train at a single station shares that station's line(s)). Then keep only incidents whose `LinesAffected` contains any of those codes. Sort by `DateUpdated` descending. Truncate `Description` to ~120 chars for display.
- **Bus alerts (filter to our stops)**: the `getservicebulletins?stpid=...` query already scopes server-side to bulletins for the configured stops. Sort by `priority` (High > Medium > Low) then by issuance time. Take the top 1–2 active bulletins. Use `brief` (or `subject` as fallback) for display.
- **Combined alert row count**: cap total alerts shown (rail + bus) at 2–3 lines to preserve room for predictions.

### Layout (full view)

ASCII shown with placeholder data (Tysons / Silver Line) — actual labels come from the form fields and the live API responses. Replace mentally with whatever station the user configures.

```
┌────────────────────────────────────────────────────────────────────────┐
│ Ⓜ{{ STATION_NAME }} · METRO & BUS               14:32 · refreshes 5m  │
│ {{ Line }} · Fairfax Connector                            ⚠ 1 alert    │
├──────────────────────────────────────────┬─────────────────────────────┤
│ ┌─LN──CAR──DEST────────────────MIN──┐    │  [FFX] Connector — stops    │
│ ▸ Largo Town Center (east)          │    │  ▸ Tysons Blvd & Greensboro │
│   SV   8   New Carrollton       ARR │    │    [423] Reston Town Ctr DUE│
│   SV   8   Largo Town Ctr        6  │    │    [462] Pentagon          7│
│   SV   8   New Carrollton       14  │    │    [574] West Falls Ch.   14│
│   SV   8   New Carrollton       21  │    │    [423] Reston Town Ctr  22│
│ ▸ Ashburn (west)                    │    │  ▸ Tysons Corner Center     │
│   SV   8   Ashburn               4  │    │    [463] Herndon-Monroe    3│
│   SV   8   Ashburn              12  │    │    [924] Reston N&P       11│
│   SV   8   Wiehle-Reston        19  │    │    [553] West Ox Rd       18│
├──────────────────────────────────────────┴─────────────────────────────┤
│ ⚠ SILVER · Single-tracking between McLean & Wiehle-Reston, expect       │
│   10-min delays in both directions (updated 14:18)                     │
└────────────────────────────────────────────────────────────────────────┘
```

Alerts live in a footer strip across the bottom edge of the screen. When there are no active alerts, the footer collapses (predictions get the freed vertical space). When 2+ alerts are active, the second line shows the next-most-recent in smaller type; anything beyond 2 is summarized as "+N more alerts".

A `⚠` indicator in the title bar gives an at-a-glance count even when the alert text isn't immediately readable from across the room.

Visual reference: `.superpowers/brainstorm/.../content/transit-layout-v2.html` (predictions only; alerts footer to be mocked in v3).

### Edge cases (transit-specific)

- WMATA `Trains` empty (late hours) → "No predictions" placeholder under each direction.
- WMATA `Incidents` array empty (typical case) → alert footer collapsed; title-bar `⚠` indicator hidden.
- Fairfax `bustime-response.error` populated → render `error[0].msg` in place of bus predictions.
- Fairfax `service-bulletins` empty or `error` populated for the bulletins call → silently omit the bus alerts portion; rail alerts still render if present.
- `Min: "---"` renders as `"—"`.
- WMATA `Incidents` returns an alert affecting only lines *not* serving the configured station (e.g., Red Line alert while we're showing Silver) → filtered out, footer collapsed accordingly.

## Plugin 2 — Man Utd next fixture / live

Two-mode plugin: renders next fixture by default; switches to a live score view automatically when Man Utd are playing.

### Polling URLs (line-separated)

```
https://api.football-data.org/v4/teams/66/matches?status=SCHEDULED&limit=1
https://api.football-data.org/v4/teams/66/matches?status=LIVE&limit=1
```

(Team ID `66` = Manchester United, hardcoded.)

The `status=LIVE` filter is football-data.org's alias for "currently in progress" (covers `IN_PLAY` and `PAUSED`/half-time). Implementation should verify the exact filter syntax accepted by v4 — if `LIVE` is not accepted, fall back to two separate URLs for `IN_PLAY` and `PAUSED` (3 URLs total, still safely under the rate limit).

### Headers

```
X-Auth-Token={{ football_data_api_key }}
```

### Form fields

| key                      | label                       | default     |
|--------------------------|-----------------------------|-------------|
| `football_data_api_key`  | football-data.org API key   | *(blank — required)* |

### Data shape

- `IDX_0.matches[0]` → next scheduled match. Fields: `utcDate`, `status` (`"SCHEDULED"`), `competition.{name,code,emblem}`, `homeTeam.{id,name,shortName,tla,crest}`, `awayTeam.{...}`, `matchday`, `stage`, `group` (optional), `venue` (sometimes).
- `IDX_1.matches[0]` → live match (often absent: `IDX_1.matches` empty). When present, adds: `status` (`"IN_PLAY"` or `"PAUSED"`), `minute` (number of minutes elapsed in the current half — may be `null` at HT), `injuryTime`, `score.fullTime.{home,away}` (running score; `home`/`away` integers), `score.halfTime.{home,away}` (set after HT).

### Mode detection

```liquid
{% if IDX_1.matches and IDX_1.matches.size > 0 %}
  {% assign live = IDX_1.matches[0] %}
  <!-- render live view -->
{% elsif IDX_0.matches and IDX_0.matches.size > 0 %}
  {% assign next = IDX_0.matches[0] %}
  <!-- render next-fixture view -->
{% else %}
  <!-- render empty state (off-season) -->
{% endif %}
```

### Shaping logic — next fixture view

- `home_or_away = homeTeam.id == 66 ? "HOME" : "AWAY"`.
- Venue: `match.venue` if present, else `homeTeam.shortName + " ground"` (or `"Old Trafford"` if home).
- Countdown: parse `utcDate` minus current time → `"X days, Y hours"` (cap at 6h granularity to avoid stale "in 32 minutes"; below 6h, show `"Today, 17:30"` / `"Tomorrow, 17:30"`).

### Shaping logic — live view

- Score display: `{{ live.score.fullTime.home }} – {{ live.score.fullTime.away }}` in large central type, with the home team's crest on the left and away team's crest on the right.
- Minute display:
  - `status == "IN_PLAY"` and `minute <= 45` → `{{ live.minute }}'` (e.g., `38'`).
  - `status == "IN_PLAY"` and `minute > 45` → `{{ live.minute }}'` (continues counting into second half; football-data.org reports `minute` continuously).
  - `status == "PAUSED"` → `HT` (half-time).
  - `injuryTime > 0` and in injury time → `{{ minute }}+{{ injuryTime }}'` (e.g., `45+2'`).
- Half-time indicator (when paused): "HT" badge replaces the live minute, half-time score sub-line shown below.

### Layout — next fixture view (default)

```
┌────────────────────────────────────────────────────────────────────────┐
│ PREMIER LEAGUE · MATCHDAY 28                            HOME FIXTURE   │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│                                       VS                               │
│       [MU CREST]                Sat 30 May · 17:30           [ARS]     │
│                                                                        │
│       MAN UNITED                                            ARSENAL    │
│            MUN                                                ARS      │
│                                                                        │
├────────────────────────────────────────────────────────────────────────┤
│   KICKS OFF IN          │      LOCAL TIME      │      VENUE             │
│   1 day, 2 hr           │      12:30 EDT       │      Old Trafford      │
└────────────────────────────────────────────────────────────────────────┘
```

Visual reference: `.superpowers/brainstorm/.../content/manutd-layout-v2.html`.

### Layout — live score view

Same overall structure as the next-fixture view; central VS-stack is replaced with the live score and minute.

```
┌────────────────────────────────────────────────────────────────────────┐
│ PREMIER LEAGUE · MATCHDAY 28                                ● LIVE     │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│                          ┌─────────────────┐                           │
│       [MU CREST]         │     2  –  1     │           [ARS]           │
│                          │                 │                           │
│                          │  67'   IN PLAY  │                           │
│       MAN UNITED         └─────────────────┘            ARSENAL        │
│            MUN                                            ARS          │
│                                                                        │
├────────────────────────────────────────────────────────────────────────┤
│   HALF-TIME             │      VENUE           │      KICKED OFF        │
│   2 – 0                 │      Old Trafford    │      17:30 (1h 7m ago) │
└────────────────────────────────────────────────────────────────────────┘
```

Key changes vs. next-fixture view:
- "● LIVE" status replaces the right-side "HOME/AWAY" label in the title bar. (At half-time, this becomes "● HT".)
- Score (`2 – 1`) replaces "VS"; minute (`67'`) replaces the date subtitle. Bordered box around the score adds emphasis.
- Bottom strip changes content: half-time score (when applicable) / venue / how long ago kickoff was.
- When `status == "PAUSED"` (half-time), the score area shows "HT" in place of the minute, and the half-time score becomes the live score until the second half resumes.

### Edge cases (Man-Utd-specific)

- Both `IDX_0` and `IDX_1` empty (off-season) → "Off-season — no fixture scheduled." centered, no crests.
- Match within next 24 hours → countdown switches to `"Today, 17:30"` / `"Tomorrow, 17:30"` for warmer phrasing.
- Crest URL fails to load (broken image) → fall back to the team's TLA in a bordered box.
- Live match but `minute` is `null` (sometimes happens right at HT transition) → show last-known minute or `"--'"` rather than blank.
- Stoppage time (injury time) → render as `"45+2'"` / `"90+4'"` rather than overflowing past 45 / 90.

## Plugin 3 — UEFA Champions League (table / bracket)

Two-mode plugin: league-phase table during the autumn league rounds; knockout bracket from the round-of-32 playoff onward through the final.

### Polling URLs (line-separated)

```
https://api.football-data.org/v4/competitions/CL/standings
https://api.football-data.org/v4/competitions/CL/matches?stage=PLAY_OFFS,LAST_16,QUARTER_FINALS,SEMI_FINALS,FINAL
```

URL 1 returns standings (table during league phase; bracket-shaped data afterward). URL 2 returns knockout-round matches (empty during league phase).

Implementation note: stage strings (`PLAY_OFFS`, `LAST_16`, etc.) need verification against football-data.org's v4 enumeration. The new 24-team knockout playoff in UEFA's 2024-25 reformat may be exposed as `PLAY_OFFS` or `KNOCKOUT_PLAYOFFS`. Confirm at first poll and adjust the URL.

### Headers

```
X-Auth-Token={{ football_data_api_key }}
```

### Form fields

| key                      | label                       | default     |
|--------------------------|-----------------------------|-------------|
| `football_data_api_key`  | football-data.org API key   | *(blank — required)* |
| `highlight_team_id`      | Team ID to highlight        | `66`        |

### Data shape

- `IDX_0.standings[0].stage` — `"LEAGUE_STAGE"` during league phase; later changes (e.g., `"ROUND_OF_16"`, `"FINAL"`) to reflect the current knockout stage.
- `IDX_0.standings[0].table[]` — rows during league phase: `position`, `team` (`id`, `shortName`, `tla`, `crest`), `playedGames`, `won`, `draw`, `lost`, `goalsFor`, `goalsAgainst`, `goalDifference`, `points`, `form`.
- `IDX_1.matches[]` — knockout matches when applicable: `id`, `stage` (`"PLAY_OFFS"`, `"LAST_16"`, …), `status` (`"SCHEDULED"`, `"IN_PLAY"`, `"FINISHED"`, etc.), `utcDate`, `homeTeam.{tla,crest}`, `awayTeam.{tla,crest}`, `score.fullTime.{home,away}`, plus `aggregateScore` or similar across legs (the v4 API exposes ties as separate match objects per leg — we sum/match them in Liquid).

### Mode detection

```liquid
{% if IDX_1.matches and IDX_1.matches.size > 0 %}
  <!-- knockout bracket view -->
{% else %}
  <!-- league-phase table view -->
{% endif %}
```

### Shaping logic — league-phase table view

- Slice rows 1–18 → left column. Rows 19–36 → right column.
- Display columns: `#`, `Club` (shortName), `GD`, `Pts`. Skip W/D/L to fit at readable font.
- Highlight: if `team.id == highlight_team_id` → row gets `mu` class (inverted).
- Top 8: black accent bar (auto-qualify R16).
- 9–24: grey accent bar (knockout playoffs).
- Dashed cut line after row 8 and after row 24.

### Shaping logic — knockout bracket view

- Group matches by `stage`. Within each stage, pair the two legs of each tie by participating teams (each pair of teams plays a home-and-away tie except the Final, which is single-leg).
- For each tie, compute aggregate score: sum of `score.fullTime` across legs. If only one leg has been played, show that score with "L1" / "L2" annotation.
- Render four stage columns in left-to-right reading order: **Playoff → R16 → QF → SF → Final** (5 columns total — playoffs only present until R16 begins, then it collapses).
- Each tie rendered as a compact card: `TLA1 X – Y TLA2` (or `TLA1 vs TLA2` if not yet played), plus a small status marker (`SCHED`, `L1`, `LIVE`, `FT`).
- Ties involving the highlight team get the inverted treatment.
- "Winner advances" arrows / lines are omitted in v1 to keep rendering simple; reading order makes the progression obvious.

### Layout — league-phase table view

```
┌────────────────────────────────────────────────────────────────────────┐
│ [UCL LOGO] UEFA CHAMPIONS LEAGUE                  14:32 · refreshes 60m│
│            2025–26 · League Phase · MD 6                               │
├────────────────────────────────┬───────────────────────────────────────┤
│ # Club              GD  Pts    │ # Club              GD  Pts           │
├────────────────────────────────┼───────────────────────────────────────┤
│ █1 Liverpool       +15  16     │  19 PSG             −1   7            │
│ █2 Barcelona       +12  14     │  20 Benfica         −2   7            │
│ █3 Arsenal          +9  13     │  21 Celtic          −2   7            │
│ ...                            │ ...                                   │
│ █8 Bayern München   +5  10     │ ░24 Club Brugge     −4   6            │
│ ─── R16 cutoff ───              │ ─── playoff cutoff ───                │
│ ░9 Borussia Dort.   +4  10     │  25 Stuttgart       −4   5            │
│ ...                            │ ...                                   │
│ █17 Manchester Utd  ±0   8     │  36 Slovan Bratisl. −15  0            │
│ ░18 PSV Eindhoven  −1   7      │                                       │
├────────────────────────────────┴───────────────────────────────────────┤
│ █ Round of 16 (1–8)   ─── R16 cutoff   ░ Knockout playoffs (9–24)      │
└────────────────────────────────────────────────────────────────────────┘
```

(`█` = black accent bar; `░` = grey accent bar; row 17 inverted = Man Utd.)

Visual reference: `.superpowers/brainstorm/.../content/ucl-layout-final.html`.

### Layout — knockout bracket view

Four stage columns left-to-right, ties stacked vertically in each. Each tie is a small two-line card showing TLAs and aggregate score (or `vs` for unplayed). Status marker top-right (SCHED / L1 / LIVE / FT).

```
┌────────────────────────────────────────────────────────────────────────┐
│ [UCL LOGO] UEFA CHAMPIONS LEAGUE                  14:32 · refreshes 60m│
│            2025–26 · Knockout · Round of 16                            │
├────────────────────────────────────────────────────────────────────────┤
│ ROUND OF 16        │ QUARTER-FINALS  │ SEMI-FINALS   │ FINAL           │
├────────────────────┼─────────────────┼───────────────┼─────────────────┤
│ LIV  3 – 1  PSG FT │ LIV  vs  MUN    │     ?         │       ?         │
│ BAR  2 – 4  MUN FT │ ATM  vs  ARS    │               │                 │
│ ARS  1 – 0  ATM FT │ INT  vs  BAY    │     ?         │                 │
│ LEV  0 – 0  INT L1 │ BVB  vs  RMA    │               │                 │
│ BAY  2 – 1  CEL FT │                 │               │                 │
│ RMA  4 – 2  BVB FT │                 │               │                 │
│ JUV  1 – 3  ATA FT │                 │               │                 │
│ SPO  0 – 0  BRE L1 │                 │               │                 │
├────────────────────────────────────────────────────────────────────────┤
│ Showing aggregate scores across both legs. L1 = first leg played only. │
└────────────────────────────────────────────────────────────────────────┘
```

Ties involving Man Utd (or whichever ID is in `highlight_team_id`) get an inverted card.

### Edge cases (UCL-specific)

- League phase data not yet populated (pre-season / draw not complete) → "League phase begins <date>" placeholder.
- `standings[0].table` shorter than 36 (early in the competition or API hiccup) → render whatever rows exist; no synthetic padding.
- Knockout matches partial (some stages not yet drawn) → render available stages only; later stages show "?" placeholders.
- During the transition between league phase and knockouts (a one-time window each January), both URLs may briefly return data — preferring the bracket view (URL 2) wins via the mode-detection check.

## Plugin 4 — Premier League table

### Polling URL

```
https://api.football-data.org/v4/competitions/PL/standings
```

### Headers, form fields

Identical to UCL plugin (`football_data_api_key`, `highlight_team_id` = 66).

### Data shape

Same as UCL. `standings[0].stage` is always `"REGULAR_SEASON"` for PL; no stage-switching logic.

### Shaping logic

- Slice rows 1–10 → left column. Rows 11–20 → right column.
- Display columns: `#`, `Club`, `W-D-L` (compact like `"20-5-3"`), `GD`, `Pts`.
- Highlight: same `highlight_team_id` mechanism.
- Top 4: black accent bar (UCL qualification).
- 18–20: grey accent bar (relegation zone).
- Dashed cut line after row 4 (left col) and after row 17 (right col).

### Layout

```
┌────────────────────────────────────────────────────────────────────────┐
│ [PL LOGO] PREMIER LEAGUE                          14:32 · refreshes 60m│
│           2025–26 · Matchday 28                                        │
├────────────────────────────────┬───────────────────────────────────────┤
│ # Club          W-D-L  GD Pts  │ # Club          W-D-L  GD Pts         │
├────────────────────────────────┼───────────────────────────────────────┤
│ █1 Liverpool   20-5-3 +40 65   │  11 West Ham    9-9-10  −3  36        │
│ █2 Arsenal     18-6-4 +31 60   │  12 Fulham      9-8-11  −4  35        │
│ █3 Man City    17-6-5 +28 57   │  13 Bournemouth 9-6-13  −7  33        │
│ █4 Chelsea     15-8-5 +18 53   │  14 Crystal Pal. 8-8-12 −8  32        │
│ ─── UCL cutoff ───              │  15 Wolves      7-9-12 −12  30        │
│  5 Newcastle   14-7-7 +14 49   │  16 Everton     7-8-13 −12  29        │
│  6 Aston Villa 13-7-8  +8 46   │  17 Forest      6-9-13 −12  27        │
│ █7 Man United  12-8-8  +7  44   │ ─── relegation cutoff ───            │
│  8 Tottenham   12-5-11 +5  41   │ ░18 Leicester   5-8-15 −22  23        │
│  9 Brighton    10-10-8 +2  40   │ ░19 Ipswich     4-7-17 −30  19        │
│ 10 Brentford   10-7-11 −2  37   │ ░20 Southampton 3-5-20 −40  14        │
├────────────────────────────────┴───────────────────────────────────────┤
│ █ UCL qualification (1–4)   ─── European cutoff   ░ Relegation (18–20) │
└────────────────────────────────────────────────────────────────────────┘
```

Visual reference: `.superpowers/brainstorm/.../content/epl-layout-v2.html`.

## Setup checklist (for `docs/setup.md`)

1. **TRMNL account**: enable Developer Perks in account settings (or use BYOD license).
2. **API keys**:
   - WMATA: register at `developer.wmata.com`, subscribe to the Default Tier (free), copy the key.
   - Fairfax Connector BusTime: register at `fairfaxcounty.gov/connector/bustracker/developers`, agree to the developer license, await key issuance.
   - football-data.org: register at `football-data.org`, copy the X-Auth-Token from the dashboard.
3. **Provide your lat/long** (the location the transit plugin centers on — e.g., home, office). Use it to look up:
   - The nearest WMATA station code (use `https://api.wmata.com/Rail.svc/json/jStations` with your API key, then pick the closest by lat/long math, or use the WMATA station map at `wmata.com/rider-tools/`).
   - 2–3 nearest Fairfax Connector stop IDs (use `https://realtime.fairfaxcounty.gov/bustime/api/v3/getstops?key=<KEY>&rt=<route>&dir=<direction>&format=json`, iterating per nearby route, or use the BusTracker web UI to spot stops on a map).
4. Fill those values into the transit plugin's form fields (`wmata_station_code`, `wmata_station_name`, `fairfax_stop_ids`).
5. **Create the four plugins in TRMNL admin** in order: transit, man-utd-fixture, ucl-table, epl-table. For each:
   - Strategy = Polling.
   - Paste polling URL(s) and headers from this spec.
   - Add form fields with the defaults shown above.
   - Paste markup from `plugins/<name>/markup.liquid`.
   - Set refresh interval (5 min for transit, 60 min for the three sports plugins).
   - Save, click "Force Refresh", confirm the preview renders.
6. **Assign to playlist**: device → playlist → add all four plugins. Set the rotation cadence to your taste.
7. **Export each plugin** as JSON from TRMNL admin and commit to `plugins/<name>/plugin-export.json` for backup.

## Open questions / assumptions

- **Assumption**: user has a TRMNL device + Developer Perks. If not: setup doc adds a step.
- **Assumption**: Wikipedia commons URLs for PL / UCL / WMATA "M" logos are stable. Fallback: bundle local SVG copies in the plugin folders.
- **Open**: user will provide actual lat/long during setup; the design intentionally doesn't bake any specific location into the plugin code. The Tysons references in earlier mockups were placeholder mock data only.
- **Open**: Fairfax BusTime base URL — `realtime.fairfaxcounty.gov` is the documented host but BusTime endpoints sometimes redirect to https. Confirm and pin in setup.
- **Verify (implementation)**: football-data.org v4 status filter syntax. Spec assumes `status=LIVE` aliases `IN_PLAY,PAUSED`. If not, fall back to two URLs.
- **Verify (implementation)**: UCL stage enumeration strings (`LEAGUE_STAGE`, `PLAY_OFFS`, `LAST_16`, `QUARTER_FINALS`, `SEMI_FINALS`, `FINAL`). UEFA's 2024-25 reformat introduced a 24-team knockout playoff round; football-data.org's label for it needs confirmation.
- **Verify (implementation)**: WMATA `Incidents.svc` `LinesAffected` format is the documented semicolon-trailing string (e.g., `"SV;OR;"`) — string-contains check is the assumed filter mechanism.
- **Verify (implementation)**: Fairfax `getservicebulletins` response shape — the spec assumes `bustime-response.service-bulletins[]` with `name/subject/brief/detail/priority/service_affected` fields per the Clever Devices BusTime v3 docs. If actual response uses a different key (e.g., `sb` instead of `service-bulletins`), templates need a tweak.

## Reference: brainstorm mockups

Local-only, in `.superpowers/brainstorm/` (which should be added to `.gitignore`). These are HTML files renderable in a browser — to-scale (800×480) previews validated during the design session:

- `.superpowers/brainstorm/88294-1780016026/content/transit-layout-v2.html` — WMATA PIDS-style transit
- `.superpowers/brainstorm/88294-1780016026/content/manutd-layout-v2.html` — fixture card
- `.superpowers/brainstorm/88294-1780016026/content/ucl-layout-final.html` — UCL 2-column
- `.superpowers/brainstorm/88294-1780016026/content/epl-layout-v2.html` — EPL 2-column

## Next step

Implementation plan to be written via `superpowers:writing-plans`.
