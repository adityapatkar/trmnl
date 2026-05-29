# Setup guide

End-to-end installation for all four TRMNL plugins.

## 1. TRMNL account

Enable **Developer Perks** in your TRMNL account settings (one-time upgrade, free for personal device owners). Or use a BYOD license. Without Developer Perks, private plugins aren't available.

## 2. API keys (3 services)

| service | URL | tier | rate limit |
|---------|-----|------|------------|
| WMATA | https://developer.wmata.com — register → subscribe to **Default Tier** | free | 10 req/s, 50k req/day |
| Fairfax Connector BusTime | https://www.fairfaxcounty.gov/connector/bustracker/developers — register, accept developer license, wait for key | free | tens of thousands per day |
| football-data.org | https://www.football-data.org/client/register — confirm email, copy the `X-Auth-Token` | free | 10 req/min |

All three keys go into TRMNL form fields, never the repo.

## 3. Pick your transit location

Note the lat/long for the location the transit plugin centers on (home, office, wherever the device sits).

### Find the nearest WMATA station

Either:

- Open `https://www.wmata.com/rider-tools/system-map/` and read the station name; or
- Query the API:
  ```bash
  WMATA_KEY="<your-key>"
  curl -s -H "api_key: $WMATA_KEY" \
    "https://api.wmata.com/Rail.svc/json/jStations" | jq '.Stations[] | {Code, Name, Lat, Lon}'
  ```
  Compute distance to each station's `Lat`/`Lon`; pick the closest. Record the `Code` (e.g., `N02`) and `Name` (e.g., `Tysons`).

### Find 2–3 nearest Fairfax Connector stop IDs

Easiest: drop a pin near your location on https://www.fairfaxcounty.gov/bustime/home.jsp and click a stop to reveal its ID.

Or via API:
```bash
FFX_KEY="<your-key>"
# List all routes to find which serve your area
curl -s "https://www.fairfaxcounty.gov/bustime/api/v3/getroutes?key=$FFX_KEY&format=json"

# List stops on a route
curl -s "https://www.fairfaxcounty.gov/bustime/api/v3/getstops?key=$FFX_KEY&rt=<ROUTE_NUMBER>&dir=INBOUND&format=json"
# (or dir=OUTBOUND / LOOP — check getdirections first if needed)
```

Pick 2–3 stops near your location. Record their IDs (e.g., `6307,6360`).

## 4. Local dev environment

```bash
git clone https://github.com/adityapatkar/trmnl
cd trmnl
nvm install   # picks up .nvmrc
npm install
npm test
```

Optional for live fixture capture: create `.env.local` (already gitignored) with:

```bash
export WMATA_KEY="..."
export FFX_KEY="..."
export FD_TOKEN="..."
```

Then `source .env.local` before running any fixture-capture commands.

## 5. Install plugins in TRMNL admin

For each of the four plugins, follow the per-plugin README:

- [`plugins/transit/README.md`](../plugins/transit/README.md)
- [`plugins/man-utd-fixture/README.md`](../plugins/man-utd-fixture/README.md)
- [`plugins/ucl-table/README.md`](../plugins/ucl-table/README.md)
- [`plugins/epl-table/README.md`](../plugins/epl-table/README.md)

Each README has the exact polling URLs, headers, and the manual step of pasting the markup. Form-field definitions live in `form-fields.yaml` alongside the markup — paste that YAML into the plugin's Form Fields section in TRMNL admin.

### Important: inline the shared CSS before pasting markup

`markup.liquid` files use `{% include_raw "plugins/_shared/styles.css" %}` to pull in the shared design tokens during local rendering. TRMNL's Liquid engine does NOT support this tag. Before pasting markup into the admin UI:

1. Open `plugins/_shared/styles.css`, copy its contents (no `{` template markers — paste verbatim).
2. In your `markup.liquid` file, replace the `{% include_raw "plugins/_shared/styles.css" %}` line with the raw CSS contents.
3. Paste the resulting markup into the TRMNL admin "Markup" editor.

## 6. Playlist

After all four plugins exist:

1. TRMNL admin → Devices → your device → Playlist.
2. Add all four plugins.
3. Set rotation cadence to taste (e.g., one screen per 10 minutes — all four cycle through).

Each plugin refreshes on its own interval independent of the playlist:

- Transit: 5 minutes (ETA + alerts age fast)
- Man Utd: 5 minutes (live scores during matches)
- UCL: 60 minutes
- EPL: 60 minutes

## Troubleshooting

- **Plugin shows "Couldn't load … data"** → one or both polling URLs returned an auth error. Re-check the API key field(s) in TRMNL admin, then Force Refresh. The placeholder also surfaces the API's own error message (e.g., "Access denied due to invalid subscription key…") so you can match it back to the right key.
- **Transit shows inline "WMATA error" or "Fairfax error" in one column** → only that side's key is broken; the other side is working. Fix just the affected key in form fields.
- **Plugin shows partial data / no rows** → hit "Force Refresh" in the admin UI and watch the preview. The poll log and response payload appear in the developer panel.
- **Off-season / no fixture** → Man Utd plugin shows "Off-season — no fixture scheduled" when no SCHEDULED match exists.
- **UCL shows no highlighted row** → expected if Man Utd didn't qualify for the current UCL season.
- **Crests look pixelated on e-ink** → check that the `crest-img` CSS filter (`grayscale(100%) contrast(1.5) brightness(0.92)`) is in the inlined CSS. Without it, colorful crests dither poorly.
