# Budget Tracker

A self-hosted budget tracker for a household. Log spending and income, set monthly budgets per category, and see where the money goes. Everything runs on your own machine. There's no account, no cloud, and no build step: just one HTML page and [PocketBase](https://pocketbase.io).

- **Transactions & income:** add inline, double-click to edit, search, and mark entries recurring
- **Budgets:** a standard amount per category, with per-month overrides and progress bars
- **Charts & reports:** budget vs. spent, 6-month trends, a savings tracker, and category breakdowns
- **Multiple people:** each person has their own records, plus a combined "All" view
- **Export** to JSON or CSV, and dark mode

## Quick start

```sh
git clone https://github.com/bri0x/budget-tracker.git
cd budget-tracker
./setup.sh                                          # macOS / Linux
powershell -ExecutionPolicy Bypass -File setup.ps1  # Windows
```

Setup downloads PocketBase and checks its checksum, then creates `pb_public/config.js`. Put your household's names in that file, then start the app:

| | |
|---|---|
| **Windows** | double-click `Launch Budget Tracker.bat` |
| **macOS / Linux** | `./launch.sh` |

It opens at <http://127.0.0.1:8090>. The first time it runs, it creates an empty database with a starter set of categories (Housing, Bills, Food, and so on). Rename or remove them under *Manage Categories*.

Running it on a Linux server or as a service? See **[docs/linux-server.md](docs/linux-server.md)**.

## Configuration

`pb_public/config.js` (gitignored):

```js
window.BUDGET_CONFIG = {
  users: [
    { id: "alex", label: "Alex", color: "#36a2eb" },
    { id: "sam",  label: "Sam",  color: "#e44d7b" }
  ],
  pbUrl: ""   // leave empty unless the page is hosted somewhere other than PocketBase
};
```

`id` is saved on every record, so **don't rename it once you have data**. `label` and `color` are safe to change at any time.

## Good to know

- **Keep it local.** The API has no login, so anyone who can reach the server can read or delete your data. That's fine on the default `127.0.0.1`; don't expose it to a network without adding auth first.
- **Back up** with *Export JSON* in the app, or by copying `pb_data/` while PocketBase is stopped.
- **Admin dashboard** (optional) is at <http://127.0.0.1:8090/_/>. Create a login with `./pocketbase superuser upsert you@example.com <password>`.
- **Editing the app:** it's all in `pb_public/index.html`. Save the file and refresh the browser.

## License

[MIT](LICENSE). PocketBase is distributed separately under its own MIT license.
