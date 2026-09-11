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
4. **Form fields**: paste the contents of [`form-fields.yaml`](form-fields.yaml) into the plugin's Form Fields section in TRMNL admin. It defines one field:

   | keyname                 | type     | required | notes                                |
   |-------------------------|----------|----------|--------------------------------------|
   | `football_data_api_key` | password | yes      | from football-data.org/client/register |

   `form-fields.json` is a separate file with a placeholder value for the local test harness only — do not paste it into TRMNL admin.

5. **Refresh interval**: 5 minutes (so live scores stay current during matches).

6. **Markup**: paste the contents of `markup.liquid`, **but first inline `_shared/styles.css`** (TRMNL's Liquid does not support the local `include_raw` tag). Open `plugins/_shared/styles.css`, copy its contents, then replace `{% include_raw "plugins/_shared/styles.css" %}` in `markup.liquid` with the raw CSS.

7. **Transform** (Markup Editor → Transform tab): paste the contents of [`transform.js`](transform.js). This is **required**. TRMNL's Liquid has no `now` variable and its `date` filter can't shift time zones, so the transform computes the kick-off countdown and formats every clock time in US Eastern (EST/EDT resolved automatically through `Intl`). Without it the markup falls back to labelled UTC times and shows `—` for the countdown.

8. **Save**, click **Force Refresh**, verify the preview.

## Field-shape notes (verified against live API)

- Free-tier responses do NOT include `match.venue`. The template falls back to `"Old Trafford"` (home matches) or `homeTeam.shortName + " ground"` (away matches).
- `minute` and `injuryTime` are only set on `IN_PLAY` matches. Stoppage time renders as `45+2'` when `injuryTime > 0`.
- `status: "PAUSED"` indicates half-time — the live view shows `HT` instead of a minute.
- `score.halfTime.{home,away}` is set after HT; the foot-strip shows `2 – 0` (HT score) once available.
- `utcDate` is UTC, as the name says. Everything on screen is rendered in US Eastern by the transform — `Sat 15 Aug · 10:00 AM EDT` for a 14:00Z kick-off.

## Transform outputs

`transform.js` passes `IDX_0`/`IDX_1` through untouched and adds these top-level variables for the markup:

| variable                | example                     | notes                                            |
|-------------------------|-----------------------------|--------------------------------------------------|
| `next_kickoff_et`       | `Sat 15 Aug · 10:00 AM EDT` | next fixture, date + time                        |
| `next_kickoff_time_et`  | `10:00 AM EDT`              | next fixture, time only                          |
| `next_countdown`        | `3d 5h` / `6h 12m` / `48m`  | `Kicking off` once the start time has passed     |
| `live_kickoff_time_et`  | `10:00 AM EDT`              | live match kick-off time                         |
| `updated_at`            | `10:09 PM EDT`              | poll time                                        |

## Local development

```bash
# Preview next-fixture state.
# --transform runs transform.js exactly as TRMNL's sandbox does; --now freezes
# its clock so the countdown is reproducible (the sample fixture is 2026-08-15).
node tools/preview.mjs --template plugins/man-utd-fixture/markup.liquid \
  --form-fields plugins/man-utd-fixture/form-fields.json \
  --idx-0 plugins/man-utd-fixture/samples/next-fixture.json \
  --idx-1 plugins/man-utd-fixture/samples/live-empty.json \
  --transform plugins/man-utd-fixture/transform.js \
  --now 2026-08-12T09:00:00Z \
  --out plugins/man-utd-fixture/preview.html

# Preview live-score state
node tools/preview.mjs --template plugins/man-utd-fixture/markup.liquid \
  --form-fields plugins/man-utd-fixture/form-fields.json \
  --idx-0 plugins/man-utd-fixture/samples/next-fixture.json \
  --idx-1 plugins/man-utd-fixture/samples/live-match.json \
  --transform plugins/man-utd-fixture/transform.js \
  --now 2026-08-15T15:07:00Z \
  --out plugins/man-utd-fixture/preview-live.html

# Preview half-time state
node tools/preview.mjs --template plugins/man-utd-fixture/markup.liquid \
  --form-fields plugins/man-utd-fixture/form-fields.json \
  --idx-0 plugins/man-utd-fixture/samples/next-fixture.json \
  --idx-1 plugins/man-utd-fixture/samples/live-paused.json \
  --transform plugins/man-utd-fixture/transform.js \
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
