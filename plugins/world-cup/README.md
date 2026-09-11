# 2026 FIFA World Cup plugin

Auto-switches between **group stage** (12 group tables, 48 teams in a 4×3 grid) and **knockout bracket** (R16 → QF → SF → 3rd Place → Final) based on what football-data.org returns.

## Configuration in TRMNL admin

1. **Plugins → New private plugin → Polling strategy.**
2. **Polling URLs** (paste, line-separated):
   ```
   https://api.football-data.org/v4/competitions/WC/standings
   https://api.football-data.org/v4/competitions/WC/matches?stage=LAST_16,QUARTER_FINALS,SEMI_FINALS,THIRD_PLACE,FINAL
   ```
   Note: the API returns `LAST_16` even though the 2026 format has 32 teams entering the knockouts (top-2-per-group + best-8 third-place finishers). If the API later starts exposing a `ROUND_OF_32` stage, add it to the comma-separated list.

3. **Headers**:
   ```
   X-Auth-Token={{ football_data_api_key }}
   ```

4. **Form fields**: paste [`form-fields.yaml`](form-fields.yaml) into the plugin's Form Fields section. Defines:

   | keyname                 | type     | required | notes                                                   |
   |-------------------------|----------|----------|---------------------------------------------------------|
   | `football_data_api_key` | password | yes      | same token as the EPL / UCL plugins                     |
   | `highlight_team_id`     | number   | yes      | default `771` (USA). Common: 770 ENG, 762 ARG, 764 BRA  |

5. **Refresh interval**: 60 minutes during the group stage, 15–30 minutes on match days if you want live score updates within the rate limit.

6. **Markup**: paste the contents of `markup.liquid`, **but first inline `_shared/styles.css`** (TRMNL's Liquid doesn't support the local `include_raw` tag). Replace `{% include_raw "plugins/_shared/styles.css" %}` with the raw CSS contents.

7. **Save**, click **Force Refresh**, verify the preview.

## Two view modes

- **Group stage** — 12 group cards in a 4×3 grid. Each card has the group letter and 4 team rows (`#`, `TLA`, `GD`, `Pts`). Top 2 of each group get a ▸ qualification marker. `highlight_team_id`'s row inverts (black background, white text).
- **Knockout** — Five stage columns left-to-right: Round of 16, Quarter-Finals, Semi-Finals, 3rd Place, Final. Each tie shows `TLA1 X–Y TLA2` with a status marker (`FT`, `LIVE`, the match date for scheduled ties). Ties involving the highlight team are inverted.

Mode is auto-detected: if the knockout-matches URL returns at least one match, the bracket shows; otherwise the group grid shows.

## Field-shape notes (verified against live API on 2026-05-29)

- `standings[]` returns 12 entries, one per group. Each has `group: "Group A"`, `table: [...]` with 4 teams.
- Each team row has `team.id`, `team.tla` (3-letter code), `team.name`, `team.shortName`, plus standard stats (`position`, `playedGames`, `won`, `draw`, `lost`, `goalsFor`, `goalsAgainst`, `goalDifference`, `points`).
- Knockout matches use stage strings: `LAST_16`, `QUARTER_FINALS`, `SEMI_FINALS`, `THIRD_PLACE`, `FINAL`. (No `ROUND_OF_32` exposed despite the 48-team format.)
- Team TLAs may be `null` during the group stage for the not-yet-drawn knockout ties. The markup falls back to `"TBD"`.

## Local development

```bash
# Group-stage preview
node tools/preview.mjs --template plugins/world-cup/markup.liquid \
  --form-fields plugins/world-cup/form-fields.json \
  --idx-0 plugins/world-cup/samples/standings-groups.json \
  --idx-1 plugins/world-cup/samples/knockout-matches-empty.json \
  --out plugins/world-cup/preview.html

# Knockout-bracket preview
node tools/preview.mjs --template plugins/world-cup/markup.liquid \
  --form-fields plugins/world-cup/form-fields.json \
  --idx-0 plugins/world-cup/samples/standings-groups.json \
  --idx-1 plugins/world-cup/samples/knockout-matches.json \
  --out plugins/world-cup/preview-bracket.html

# Tests
node --test plugins/world-cup/test.mjs
```

## Sample fixtures

- `standings-groups.json` — live 12-group / 48-team standings from football-data.org
- `knockout-matches.json` — live knockout matches (R16 + QF + SF + 3rd + Final placeholders)
- `knockout-matches-empty.json` — empty `{"matches":[]}` for forcing group-stage mode in tests
- `bad-token.json` — synthesized auth-error response for the setup-placeholder test
