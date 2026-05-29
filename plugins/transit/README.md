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
https://gbfs.capitalbikeshare.com/gbfs/en/station_status.json
   ```
3. **Headers**:
   ```
   api_key={{ wmata_api_key }}
   ```
4. **Form fields**: paste the contents of [`form-fields.yaml`](form-fields.yaml) into the plugin's Form Fields section in TRMNL admin (or import it via the [visual form builder](https://usetrmnl.github.io/trmnl-form-builder/)). It defines:

   | keyname               | type     | required | notes                                                  |
   |-----------------------|----------|----------|--------------------------------------------------------|
   | `wmata_api_key`       | password | yes      | from developer.wmata.com                               |
   | `wmata_station_code`  | string   | yes      | default `N02` (Tysons)                                 |
   | `wmata_station_name`  | string   | yes      | default `Tysons`                                       |
   | `fairfax_api_key`     | password | yes      | from fairfaxcounty.gov                                 |
   | `fairfax_stop_ids`    | string   | yes      | comma-separated IDs, e.g. `6307,6360`                  |
   | `fairfax_base_url`    | url      | yes      | default `https://www.fairfaxcounty.gov/bustime/api/v3` |
   | `cabi_station_ids`    | string   | no       | comma-separated Capital Bikeshare station UUIDs (blank → hide bikeshare row) |
   | `cabi_station_names`  | string   | no       | parallel list of display names                         |

   See [`form-fields.yaml`](form-fields.yaml) for the descriptions/help text that surface in the TRMNL admin UI.

   `form-fields.json` is a separate file with placeholder values used by the local test harness only — do not paste it into TRMNL admin.

5. **Refresh interval**: 5 minutes.

6. **Markup**: paste the contents of `markup.liquid`, **but first inline `_shared/styles.css`** because TRMNL's Liquid does not support the local `include_raw` tag we use for local rendering. To inline: open `plugins/_shared/styles.css`, copy its contents, then in `markup.liquid` replace `{% include_raw "plugins/_shared/styles.css" %}` with the raw CSS.

7. **Transform** (Markup Editor → Transform tab): paste the contents of [`transform.js`](transform.js). This is **required** if you configure the Capital Bikeshare URL — the raw GBFS feed is ~300 KB (all 838 stations) and TRMNL caps polling responses at 100 KB. The transform runs in Node v22 in TRMNL's sandbox and filters the GBFS response down to just the stations listed in `cabi_station_ids`. If you don't configure CaBi (leave both `cabi_*` fields blank AND omit the GBFS polling URL), the transform is unnecessary.

8. **Save**, click **Force Refresh**, verify the preview matches `preview.html` we generated locally.

## API field-name notes (from live verification)

These differ from public BusTime docs — confirmed against the actual live response:

- **WMATA trains** use the `Group` field (`"1"` / `"2"`) for direction, NOT `DirectionNum`. `DestinationCode` can be `null`.
- **WMATA incidents** `LinesAffected` is a semicolon-separated string with a trailing `;` (e.g., `"SV;OR;"`).
- **Fairfax service bulletins** use abbreviated field names: array is `sb` (not `service-bulletins`); each bulletin has `nm`, `sbj`, `brf`, `dtl`, `prty`, `srvc[]`.
- **Capital Bikeshare** uses standard [GBFS](https://gbfs.org). `station_status.json` has `num_bikes_available` (total, INCLUDING e-bikes), `num_ebikes_available`, `num_docks_available`. Plugin computes normal-bike count = total − ebikes.

## Finding Capital Bikeshare station IDs

```bash
# All stations in the system (with names, lat/lng):
curl -s "https://gbfs.capitalbikeshare.com/gbfs/en/station_information.json" | jq '.data.stations[] | {id: .station_id, name, lat, lon}'

# Filter to a lat/lng box near you, e.g. Tysons:
curl -s "https://gbfs.capitalbikeshare.com/gbfs/en/station_information.json" \
  | jq '.data.stations[] | select(.lat > 38.91 and .lat < 38.94 and .lon > -77.24 and .lon < -77.20) | {id: .station_id, name}'
```

Pick 1–3 stations, paste their IDs into `cabi_station_ids` and their names into `cabi_station_names` (same order).

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
  --idx-4 plugins/transit/samples/cabi-status.json \
  --out plugins/transit/preview.html
open plugins/transit/preview.html

# Run tests
node --test plugins/transit/test.mjs
```
