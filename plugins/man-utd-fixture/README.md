# Man Utd next fixture / live plugin

Single match focus — shows next scheduled fixture; auto-switches to a live score view when Man Utd are playing.

## Configuration in TRMNL admin

1. **Plugins → New private plugin → Polling strategy.**
2. **Polling URLs** (paste, line-separated):
   ```
   https://api.football-data.org/v4/teams/66/matches?status=SCHEDULED&limit=1
   https://api.football-data.org/v4/teams/66/matches?status=LIVE&limit=1
   ```
   `status=LIVE` is an alias for `IN_PLAY,PAUSED` — confirmed accepted by the v4 API.
3. **Headers**:
   ```
   X-Auth-Token={{ football_data_api_key }}
   ```
4. **Form fields**:

   | key                     | label                       | required |
   |-------------------------|-----------------------------|----------|
   | `football_data_api_key` | football-data.org API key   | yes      |

5. **Refresh interval**: 5 minutes (so live scores stay current during matches).

6. **Markup**: paste the contents of `markup.liquid`, **but first inline `_shared/styles.css`** (TRMNL's Liquid does not support the local `include_raw` tag). Open `plugins/_shared/styles.css`, copy its contents, then replace `{% include_raw "plugins/_shared/styles.css" %}` in `markup.liquid` with the raw CSS.

7. **Save**, click **Force Refresh**, verify the preview.

## Field-shape notes (verified against live API)

- Free-tier responses do NOT include `match.venue`. The template falls back to `"Old Trafford"` (home matches) or `homeTeam.shortName + " ground"` (away matches).
- `minute` and `injuryTime` are only set on `IN_PLAY` matches. Stoppage time renders as `45+2'` when `injuryTime > 0`.
- `status: "PAUSED"` indicates half-time — the live view shows `HT` instead of a minute.
- `score.halfTime.{home,away}` is set after HT; the foot-strip shows `2 – 0` (HT score) once available.

## Local development

```bash
# Preview next-fixture state
node tools/preview.mjs --template plugins/man-utd-fixture/markup.liquid \
  --form-fields plugins/man-utd-fixture/form-fields.json \
  --idx-0 plugins/man-utd-fixture/samples/next-fixture.json \
  --idx-1 plugins/man-utd-fixture/samples/live-empty.json \
  --out plugins/man-utd-fixture/preview.html

# Preview live-score state
node tools/preview.mjs --template plugins/man-utd-fixture/markup.liquid \
  --form-fields plugins/man-utd-fixture/form-fields.json \
  --idx-0 plugins/man-utd-fixture/samples/next-fixture.json \
  --idx-1 plugins/man-utd-fixture/samples/live-match.json \
  --out plugins/man-utd-fixture/preview-live.html

# Preview half-time state
node tools/preview.mjs --template plugins/man-utd-fixture/markup.liquid \
  --form-fields plugins/man-utd-fixture/form-fields.json \
  --idx-0 plugins/man-utd-fixture/samples/next-fixture.json \
  --idx-1 plugins/man-utd-fixture/samples/live-paused.json \
  --out plugins/man-utd-fixture/preview-paused.html

# Run tests
node --test plugins/man-utd-fixture/test.mjs
```

## Sample fixtures

- `next-fixture.json` — next scheduled match (Man Utd home vs Arsenal, GW1 2026-27)
- `live-match.json` — synthetic IN_PLAY state at 67' with score 2-1
- `live-paused.json` — synthetic PAUSED (half-time) state
- `live-stoppage.json` — synthetic stoppage-time (45+2') state
- `live-empty.json` — empty `{"matches":[]}` for the no-live-match case
- `off-season.json` — empty for the no-fixture case
