// TRMNL Sandbox Runtime transform for the man-utd-fixture plugin.
//
// Paste this into the plugin's "Markup Editor → Transform" tab in TRMNL admin.
// Runs in Node v22 inside an isolated-vm, 1-second timeout, no internet access.
//
// Why this exists: the markup can't do either of the two time jobs on its own.
//
//  1. Time zone. football-data.org returns `utcDate` in UTC. TRMNL's Liquid
//     `date` filter has no time-zone argument, so the markup would print UTC and
//     mislabel it. Intl.DateTimeFormat with timeZone America/New_York gives us
//     US Eastern with EST/EDT picked automatically across DST transitions.
//
//  2. Countdown. TRMNL's Liquid does not define a `now` variable — `{{ now |
//     date: "%s" }}` renders an empty string, which `minus` coerces to 0, so the
//     old markup computed (kickoff epoch − 0) and rendered ~20,600 days. The
//     transform runs at poll time (every 5 min), so computing the countdown here
//     against Date.now() is both correct and fresh enough.

var ET = 'America/New_York';

function etParts(date) {
  var fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: ET,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  });
  var out = {};
  fmt.formatToParts(date).forEach(function (p) { out[p.type] = p.value; });
  return out;
}

// "Sat 15 Aug · 10:00 AM EDT"
function etDateTime(date) {
  var p = etParts(date);
  return p.weekday + ' ' + p.day + ' ' + p.month + ' · ' + p.hour + ':' + p.minute + ' ' + p.dayPeriod + ' ' + p.timeZoneName;
}

// "10:00 AM EDT"
function etTime(date) {
  var p = etParts(date);
  return p.hour + ':' + p.minute + ' ' + p.dayPeriod + ' ' + p.timeZoneName;
}

// "3d 4h" / "6h 12m" / "48m" / "Kicking off"
function countdown(fromMs, toMs) {
  var mins = Math.floor((toMs - fromMs) / 60000);
  if (mins <= 0) return 'Kicking off';
  if (mins < 60) return mins + 'm';
  var hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ' + (mins % 60) + 'm';
  return Math.floor(hrs / 24) + 'd ' + (hrs % 24) + 'h';
}

function firstMatch(idx) {
  return idx && Array.isArray(idx.matches) && idx.matches.length > 0 ? idx.matches[0] : null;
}

function transform(input) {
  var now = new Date();
  var out = {
    IDX_0: input ? input.IDX_0 : null,
    IDX_1: input ? input.IDX_1 : null,
    updated_at: etTime(now),
    next_kickoff_et: null,
    next_kickoff_time_et: null,
    next_countdown: null,
    live_kickoff_time_et: null,
  };

  var next = firstMatch(out.IDX_0);
  if (next && next.utcDate) {
    var k = new Date(next.utcDate);
    if (!isNaN(k.getTime())) {
      out.next_kickoff_et = etDateTime(k);
      out.next_kickoff_time_et = etTime(k);
      out.next_countdown = countdown(now.getTime(), k.getTime());
    }
  }

  var live = firstMatch(out.IDX_1);
  if (live && live.utcDate) {
    var lk = new Date(live.utcDate);
    if (!isNaN(lk.getTime())) out.live_kickoff_time_et = etTime(lk);
  }

  return out;
}
