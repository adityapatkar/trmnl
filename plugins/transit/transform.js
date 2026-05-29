// TRMNL Sandbox Runtime transform for the transit plugin.
//
// Paste this into the plugin's "Markup Editor → Transform" tab in TRMNL admin.
// Runs in Node v22 inside an isolated-vm, 1-second timeout, no internet access.
//
// The Capital Bikeshare GBFS station_status feed is ~300 KB (all 838 stations
// in the system). TRMNL caps individual polling responses at 100 KB, so we filter
// down to just the stations configured in the `cabi_station_ids` form field
// before the payload reaches the markup.
//
// IDX_0..IDX_3 are passed through untouched. IDX_4 is rewritten to contain only
// the configured stations (or an empty array if no IDs are configured, which
// keeps the markup's "cabi_count > 0" guard happy and hides the bikeshare row).

function transform(input) {
  const settings = (input && input.trmnl && input.trmnl.plugin_settings) || {};
  const fields = settings.custom_fields_values || {};
  const idsCsv = (fields.cabi_station_ids || '').trim();
  const ids = idsCsv ? idsCsv.split(',').map(s => s.trim()).filter(Boolean) : [];

  const allStations =
    (input && input.IDX_4 && input.IDX_4.data && input.IDX_4.data.stations) || [];

  const filtered =
    ids.length > 0
      ? allStations.filter(s => ids.includes(s.station_id))
      : [];

  return {
    IDX_0: input.IDX_0,
    IDX_1: input.IDX_1,
    IDX_2: input.IDX_2,
    IDX_3: input.IDX_3,
    IDX_4: {
      last_updated: input.IDX_4 ? input.IDX_4.last_updated : null,
      ttl: input.IDX_4 ? input.IDX_4.ttl : null,
      data: { stations: filtered },
    },
  };
}
