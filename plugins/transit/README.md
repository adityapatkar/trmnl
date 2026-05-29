# Transit plugin

WMATA next-trains + Fairfax Connector next-buses + service alerts, on a single 800×480 screen.

## Configuration in TRMNL admin

1. **Plugins → New private plugin → Polling strategy.**
2. **Polling URLs** (paste, line-separated):
   ```
https://api.wmata.com/StationPrediction.svc/json/GetPrediction/{{ wmata_station_code }}
{{ fairfax_base_url }}/getpredictions?key={{ fairfax_api_key }}&stpid={{ fairfax_stop_ids }}&format=json
https://api.wmata.com/Incidents.svc/json/Incidents
{{ fairfax_base_url }}/getservicebulletins?key={{ fairfax_api_key }}&stpid={{ fairfax_stop_ids }}&format=json
   ```
3. **Headers**:
   ```
   api_key={{ wmata_api_key }}
   ```
4. **Form fields**: paste the contents of [`form-fields.yaml`](form-fields.yaml) into the plugin's Form Fields section in TRMNL admin (or import it via the [visual form builder](https://usetrmnl.github.io/trmnl-form-builder/)). It defines six fields:

   | keyname              | type     | required | notes                                              |
   |----------------------|----------|----------|----------------------------------------------------|
   | `wmata_api_key`      | password | yes      | from developer.wmata.com                           |
   | `wmata_station_code` | string   | yes      | default `N02` (Tysons)                             |
   | `wmata_station_name` | string   | yes      | default `Tysons`                                   |
   | `fairfax_api_key`    | password | yes      | from fairfaxcounty.gov                             |
   | `fairfax_stop_ids`   | string   | yes      | comma-separated IDs, e.g. `6307,6360`              |
   | `fairfax_base_url`   | url      | yes      | default `https://www.fairfaxcounty.gov/bustime/api/v3` |

   See [`form-fields.yaml`](form-fields.yaml) for the descriptions/help text that surface in the TRMNL admin UI.

   `form-fields.json` is a separate file with placeholder values used by the local test harness only — do not paste it into TRMNL admin.

5. **Refresh interval**: 5 minutes.

6. **Markup**: paste the contents of `markup.liquid`, **but first inline `_shared/styles.css`** because TRMNL's Liquid does not support the local `include_raw` tag we use for local rendering. To inline: open `plugins/_shared/styles.css`, copy its contents, then in `markup.liquid` replace `{% include_raw "plugins/_shared/styles.css" %}` with the raw CSS.

7. **Save**, click **Force Refresh**, verify the preview matches `preview.html` we generated locally.

## API field-name notes (from live verification)

These differ from public BusTime docs — confirmed against the actual live response:

- **WMATA trains** use the `Group` field (`"1"` / `"2"`) for direction, NOT `DirectionNum`. `DestinationCode` can be `null`.
- **WMATA incidents** `LinesAffected` is a semicolon-separated string with a trailing `;` (e.g., `"SV;OR;"`).
- **Fairfax service bulletins** use abbreviated field names: array is `sb` (not `service-bulletins`); each bulletin has `nm`, `sbj`, `brf`, `dtl`, `prty`, `srvc[]`.

## Local development

```bash
# Render and open preview
npm run preview -- \
  --template plugins/transit/markup.liquid \
  --form-fields plugins/transit/form-fields.json \
  --idx-0 plugins/transit/samples/wmata-predictions.json \
  --idx-1 plugins/transit/samples/fairfax-predictions.json \
  --idx-2 plugins/transit/samples/wmata-incidents.json \
  --idx-3 plugins/transit/samples/fairfax-bulletins.json \
  --out plugins/transit/preview.html
open plugins/transit/preview.html

# Run tests
node --test plugins/transit/test.mjs
```
