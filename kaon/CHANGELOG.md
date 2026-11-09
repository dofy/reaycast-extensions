# Changelog

## [Fix refresh gaps] - {PR_MERGE_DATE}

- Changing Breakdown Range now refetches the breakdown immediately instead of
  waiting out the minimum fetch interval. The budget counter stays throttled,
  because it does not depend on the range.
- Refresh now reports "已是最新" when the minimum fetch interval swallowed the
  pass, so it no longer looks like nothing happened.
- The token expiry reminder row opens Automation Tokens, matching the link its
  accessory advertises.
- A request that hits Request Timeout is reported as a timeout instead of as an
  unreachable network.

## [Initial Version] - 2026-11-09

- Added Kaon Balance: today's spend in the menu bar, with budget, rate limits
  and the usage breakdown in the dropdown.
- Added Kaon Usage: budget, rate limits and the breakdown by model, key,
  provider and day as a searchable list.
- Added the automation token expiry warning and the stop-signal handling that
  keeps a suspended token from being retried.
