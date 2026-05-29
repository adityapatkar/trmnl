# Premier League table plugin

20-team Premier League standings, two columns (10+10), Man Utd row inverted.

## Configuration in TRMNL admin

1. **Plugins → New private plugin → Polling strategy.**
2. **Polling URL**:
   ```
   https://api.football-data.org/v4/competitions/PL/standings
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

## Layout

- Two columns side-by-side: positions 1–10 left, 11–20 right.
- Columns shown: `#`, `Club`, `W-D-L` (compact, e.g. `20-11-7`), `GD`, `Pts`.
- Top 4 rows get a black accent bar (UCL qualification) and a dashed cut line after row 4.
- Rows 18–20 get a grey accent bar (relegation zone) and a dashed cut line after row 17.
- `highlight_team_id`'s row inverts (black background, white text).

## Local development

```bash
node tools/preview.mjs --template plugins/epl-table/markup.liquid \
  --form-fields plugins/epl-table/form-fields.json \
  --idx-0 plugins/epl-table/samples/standings.json \
  --out plugins/epl-table/preview.html

node --test plugins/epl-table/test.mjs
```

## Sample fixtures

- `standings.json` — live captured 2025-26 final-table standings (Arsenal champion, Man Utd 3rd, Wolves bottom)
