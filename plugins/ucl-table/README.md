# UCL table / bracket plugin

Auto-switches between league-phase standings (36 teams in two columns) and the knockout bracket (R16 → QF → SF → Final) based on what football-data.org returns.

## Configuration in TRMNL admin

1. **Plugins → New private plugin → Polling strategy.**
2. **Polling URLs** (paste, line-separated):
   ```
   https://api.football-data.org/v4/competitions/CL/standings
   https://api.football-data.org/v4/competitions/CL/matches?stage=LAST_16,QUARTER_FINALS,SEMI_FINALS,FINAL
   ```
3. **Headers**:
   ```
   X-Auth-Token={{ football_data_api_key }}
   ```
4. **Form fields**: paste [`form-fields.yaml`](form-fields.yaml) into the plugin's Form Fields section. Defines:

   | keyname                 | type     | required | notes                                  |
   |-------------------------|----------|----------|----------------------------------------|
   | `football_data_api_key` | password | yes      | from football-data.org/client/register |
   | `highlight_team_id`     | number   | yes      | default `66` (Man Utd)                 |

5. **Refresh interval**: 60 minutes.

6. **Markup**: paste the contents of `markup.liquid`, **but first inline `_shared/styles.css`** (TRMNL's Liquid does not support the local `include_raw` tag). Open `plugins/_shared/styles.css`, copy its contents, then replace `{% include_raw "plugins/_shared/styles.css" %}` in `markup.liquid` with the raw CSS.

7. **Save**, click **Force Refresh**, verify the preview.

## Two view modes

- **League-phase table** — 36 teams in two columns (18+18). Top 8 marked with black accent bar (R16 qualification); 9–24 marked with grey (knockout playoffs). `highlight_team_id`'s row inverts (black background, white text). Dashed cuts after row 8 and row 24.
- **Knockout bracket** — Four columns: Round of 16, Quarter-Finals, Semi-Finals, Final. Each tie shows `TLA1 X – Y TLA2` (aggregate score across both legs) with a status marker (FT / L1 / LIVE / SCHED). Ties involving `highlight_team_id` are inverted.

Mode is auto-detected: if the knockout-matches URL returns at least one match, the bracket view shows; otherwise the league table shows.

## Field-shape notes (verified against live API)

- `standings[0].stage` is `"GROUP_STAGE"` for the new 36-team league phase (not `"LEAGUE_STAGE"`).
- Knockout stage strings observed: `LAST_16`, `QUARTER_FINALS`, `SEMI_FINALS`, `FINAL`. No `PLAY_OFFS` stage appears in the v4 API for the 24-team R32 playoff round.
- The FINAL is a single leg (status often `TIMED` until kickoff, then `IN_PLAY` / `FINISHED`).
- If `highlight_team_id` is set to a team not in this year's UCL (e.g., Man Utd didn't qualify in 2025-26), no row is highlighted in the table view and no tie is highlighted in the bracket. Graceful no-op.

## Local development

```bash
# League-phase preview
node tools/preview.mjs --template plugins/ucl-table/markup.liquid \
  --form-fields plugins/ucl-table/form-fields.json \
  --idx-0 plugins/ucl-table/samples/standings-league-phase.json \
  --idx-1 plugins/ucl-table/samples/knockout-matches-empty.json \
  --out plugins/ucl-table/preview.html

# Bracket preview
node tools/preview.mjs --template plugins/ucl-table/markup.liquid \
  --form-fields plugins/ucl-table/form-fields.json \
  --idx-0 plugins/ucl-table/samples/standings-league-phase.json \
  --idx-1 plugins/ucl-table/samples/knockout-matches.json \
  --out plugins/ucl-table/preview-bracket.html

# Tests
node --test plugins/ucl-table/test.mjs
```

## Sample fixtures

- `standings-league-phase.json` — live 36-team table from the 2025-26 UCL group stage
- `knockout-matches.json` — live 29 knockout matches (R16 + QF + SF + Final)
- `knockout-matches-empty.json` — empty `{"matches":[]}` for forcing league-phase mode in tests
- `standings-knockout.json` — snapshot of what the standings endpoint returns during knockout phase (for reference)
