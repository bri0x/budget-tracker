# Changelog

Notable changes to this project. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.1.0] - 2026-10-24

### Added
- **Manage Users**: add, rename, recolor and remove people in the app instead of editing `config.js`. Removing someone shows exactly what will be deleted (their transactions, income and budgets) first. Works in demo mode too.
- People are stored in a new `people` collection. On first load it's filled from `config.js` (plus anyone who already owns records), so existing data keeps its owner. After that, `config.js` users are ignored. Restart PocketBase after updating so it creates the collection.

### Fixed
- The category and subcategory boxes in the "add transaction" row started out blank.

## [1.0.0] - 2026-10-24

First public release.

### Added
- Transactions and income with inline add/edit, search, month filter, and recurring entries ("Apply Recurring").
- Standard budgets per category with per-month overrides, and spent/remaining progress bars.
- Charts: budget vs. spent, spending breakdown, income vs. spending, 6-month trend, cumulative savings.
- Category breakdown reports (3/6/12 months) and the top subcategories for the month.
- Multiple users plus a combined "All" view, configured in `pb_public/config.js`.
- **Demo mode**: open the app with `?demo` to explore a made-up household kept in memory.
- Starter categories on fresh installs. Existing databases are left untouched.
- `setup.sh` / `setup.ps1`: download PocketBase v0.39.4, verify its SHA-256 checksum, and create `config.js`.
- Launchers for Windows and Linux/macOS, plus an example hardened systemd unit.
- Test suite (`npm test`): month math in 7 time zones, budgets, savings, recurring, CSV export, category removal, and demo data.
- JSON and CSV export, and dark mode.

### Fixed
- Month calculations used UTC instead of local time. That opened the wrong month on the evening of a month's last day, started the savings tracker a month early, and shifted trend charts east of UTC.
- Removing a category only deleted the current user's transactions, but removed the category for everyone, which left other users' transactions orphaned. It now shows exactly what will be deleted for every user, including budgets, before deleting it.
- Subcategory names in the "Top 5" table could inject HTML.

[Unreleased]: https://github.com/bri0x/budget-tracker/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/bri0x/budget-tracker/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/bri0x/budget-tracker/releases/tag/v1.0.0
