# Blackboard week plugin

One 800×480 screen: a rolling 7-day agenda of classes and deadlines on the left, the deadline queue on the right, and the single most imminent item in the header.

Built against a Blackboard Ultra account, Fall 2026, three courses. Everything institution- and semester-specific lives in one `SEMESTER` block at the top of [`serverless.js`](serverless.js).

## What is and isn't in this repo

This repo is public, so it carries **no real coursework or class schedule**:

| Committed | Local only (gitignored `local/`) |
|---|---|
| `samples/learn.ics` — synthetic titles | `local/learn.real.ics` — the real feed |
| `serverless.js` — example `SEMESTER` block | `local/semester.local.js` — the real schedule |

The synthetic fixture is generated from the real one with **only `SUMMARY` values replaced**: same 57 events, same UIDs, same dates, same `VTIMEZONE` and its 11 DST `RRULE`s, same line folding, same long titles that force truncation. So every test exercises the same code paths on the same dates as the live feed.

**To deploy:** paste `serverless.js` into TRMNL, then replace its `SEMESTER` block with the one from `local/semester.local.js`.

## What the Blackboard feed actually contains

This matters more than anything else in this README, because the feed is far thinner than its name suggests. Verified against the live feed (57 events, 17 KB):

- **Every event is a gradebook item.** All UIDs are `_blackboard.platform.gradebook2.GradableItem-*`. The feed is a list of due dates and nothing else.
- **There are no class meetings.** Nothing in the feed describes when or where a course meets. The class schedule in `SEMESTER.weeklyClasses` / `oneOffClasses` is hardcoded because there is no other source.
- **There is no course name, anywhere.** No `CATEGORIES`, no `LOCATION`, and `DESCRIPTION` is empty on all 57 events. Course attribution is inferred from the gradebook UID blocks in `SEMESTER.uidRanges`.
- **Nothing recurs.** Every `RRULE` in the file is a DST rule inside `VTIMEZONE`; zero VEVENTs repeat. The parser deliberately does no recurrence expansion.
- **All timestamps are `TZID=America/New_York`**, and the screen renders Eastern, so wall-clock components are used as-is.
- **Not everything graded is in it.** In the real Fall 2026 data a capstone paper worth **30 of 101 points** never appeared at all. Check each syllabus against the feed and put the gaps in `SEMESTER.extraDeadlines`.

## Why this plugin fetches its own data

**Do not configure a Polling URL.** TRMNL's polling layer is content-type driven, and `text/calendar` is not among the types it parses — despite "plaintext" being listed as supported. Verified against the live plugin: the server log shows `Processed polling URL` for the `.ics` link, and the sandbox then received a payload whose only top-level key was `trmnl`. The feed is fetched and the body is discarded.

So [`serverless.js`](serverless.js) calls `fetch()` itself. TRMNL Serverless (Node v20, 128 MB, 5 s) permits outbound HTTP, which removes the need for the proxy this would otherwise require — and keeps the share link, a bearer token, inside TRMNL rather than a third-party service.

## Configuration in TRMNL admin

1. **Plugins → New private plugin → Polling strategy.**
2. **Polling URL**: leave blank. If admin insists on a value, anything harmless will do — `run()` ignores it and fetches the feed itself.
3. **Headers**: none.
4. **Form fields**: paste [`form-fields.yaml`](form-fields.yaml) into the Form Fields section. One field:

   | keyname               | type     | required | notes                                       |
   |-----------------------|----------|----------|---------------------------------------------|
   | `blackboard_ics_url`  | password | yes      | Blackboard → Calendar → Share Calendar      |

   The share link is a **bearer token** — anyone holding it can read the calendar. It is a password field for that reason, and must never be committed. `form-fields.json` holds a dummy value for the local harness only; don't paste it into admin.

5. **Refresh interval**: 60 minutes. Deadlines don't move, and the countdown is deliberately expressed in days and hours so an hour-old render is never wrong.

6. **Serverless** (Markup Editor → **Serverless** tab, **Node** runtime): paste [`serverless.js`](serverless.js). **Required, and the heart of the plugin** — it fetches the feed, parses it, attributes each item to a course, formats Eastern times and does all date maths. TRMNL's Liquid has no `now` variable and its `date` filter cannot shift time zones, so none of this can live in the markup.

   The file exports `run(input)`, which TRMNL calls. It also exports `transform(input)`, used only by the local harness so the test suite never touches the network — both delegate to the same pure `buildScreen()`.

7. **Markup**: paste [`markup.liquid`](markup.liquid), **but first inline `_shared/styles.css`** — TRMNL's Liquid does not support the local `include_raw` tag. Replace `{% include_raw "plugins/_shared/styles.css" %}` with the file's contents.

8. **Save**, **Force Refresh**, compare against `preview.html`.

## Editing the semester

`SEMESTER` in [`serverless.js`](serverless.js) is the only block that should need touching between terms:

| Key | What it does |
|---|---|
| `start` / `end` | bounds for weekly classes (2026-08-24 → 2026-12-01) |
| `courses` | display names; `short` is what appears on chips and in the queue |
| `weeklyClasses` | the courses that meet on a fixed weekday, with time and room |
| `oneOffClasses` | live sessions for an asynchronous course that has no weekly meeting |
| `breaks` | suppresses weekly classes only; the Sun 11/29 live session deliberately survives Thanksgiving week |
| `extraDeadlines` | deadlines Blackboard never publishes, currently the Dec 13 capstone |
| `uidRanges` | gradebook UID block → course. **The thing most likely to need updating.** |
| `titleRules` | keyword fallback for UIDs outside every range |

### When course attribution breaks

New courses get new UID blocks, so `uidRanges` goes stale each semester. The function reports `unassigned_count`, and `test.mjs` asserts it is zero for every upcoming item — so a stale mapping fails the test suite rather than silently rendering an unlabelled assignment. To fix: find the new UIDs and add a range.

```bash
# Which UID blocks exist, and what's in them
grep -A4 'BEGIN:VEVENT' plugins/blackboard-week/samples/learn.ics \
  | grep -E 'UID|SUMMARY' | paste - - | sort
```

Verify a block before trusting it: take one item's title and find it in that course's syllabus. The real Fall 2026 mapping was confirmed that way — one UID's assignment appeared in a syllabus under a specific session — rather than inferred from the numbering alone.

## Layout notes

The panel is a fixed 800×480 with no scrollbar and no runtime text-fitting, so density is decided in `serverless.js` rather than discovered on the device. `AGENDA_BUDGET_PX` and the constants beside it estimate rendered height; anything that doesn't fit collapses into a `+N more` row instead of being clipped. The estimates are calibrated against the committed previews — if you change type sizes in `markup.liquid`, re-check them.

Other deliberate choices:

- **A rolling 7 days from today**, not a calendar week, so the screen is never mostly in the past.
- **Today always gets its own row**, even when clear, and never merges into a "MON 7 – TUE 8" run.
- **The queue runs past the 7-day edge**, so items just outside the window don't fall off a cliff.
- **Deadlines whose time has passed** stay on today's row struck through, but leave the queue.

## Local development

```bash
# Canonical preview: Mon 2026-09-07, a clear day
npm run preview -- \
  --template plugins/blackboard-week/markup.liquid \
  --form-fields plugins/blackboard-week/form-fields.json \
  --idx-0 plugins/blackboard-week/samples/learn.ics \
  --transform plugins/blackboard-week/serverless.js \
  --now 2026-09-07T12:14:00Z \
  --out plugins/blackboard-week/preview.html

# A class day, with a deadline already past
npm run preview -- \
  --template plugins/blackboard-week/markup.liquid \
  --form-fields plugins/blackboard-week/form-fields.json \
  --idx-0 plugins/blackboard-week/samples/learn.ics \
  --transform plugins/blackboard-week/serverless.js \
  --now 2026-09-09T18:00:00Z \
  --out plugins/blackboard-week/preview-classday.html

node --test plugins/blackboard-week/test.mjs
```

`--transform` runs `serverless.js`'s `transform()` entry point, exactly as the harness needs, and `--now` freezes its clock so previews are reproducible. `--idx-0` takes the `.ics` as raw text: the harness parses `.json` fixtures and passes anything else through as a string.

## Failure states

The screen never fails silently — when there's no calendar it says what happened:

| What you see | Cause |
|---|---|
| `no share link configured` | the `blackboard_ics_url` form field is empty |
| `Blackboard returned HTTP 401` / `403` | the share link was revoked or regenerated |
| `response was not a calendar — string(…) "<html>…"` | an SSO login page, i.e. a dead link |
| `fetch failed: …` | network or DNS trouble reaching Blackboard |

## Sample data

`samples/learn.ics` is synthetic — see **What is and isn't in this repo** above. It mirrors the real feed's structure exactly and contains no real coursework, no name, no email and no token.

To regenerate it after recapturing the real feed into `local/learn.real.ics`, rewrite each `SUMMARY` and leave every other line untouched. Keep the pinned titles on their existing dates, or the tests that assert on the hero, the queue order and truncation will need updating with them.
