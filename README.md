# Budget Tracker

A self-hosted household budget and transaction tracker. Log spending and income, set standard monthly budgets per category with optional per-month overrides, and see where the money goes through charts, a savings tracker, and category/subcategory reports. Several people can share one tracker, each with their own records, plus a combined "All" view. All data stays on your machine in a local [PocketBase](https://pocketbase.io) database.

## Features

- Transactions and income with inline add/edit (double-click a cell), search, and month filtering
- Recurring transactions — copy last month's recurring entries forward with one click
- Standard budgets per category plus monthly overrides, with spent/remaining progress bars
- Charts: budget vs. spent, spending breakdown, income vs. spending, 6-month trend
- Savings tracker (monthly net and cumulative savings)
- Category breakdown reports over 3/6/12 months, top subcategories
- Custom categories and subcategories
- Multiple users plus an "All" combined view
- JSON and CSV export, dark mode

## Tech stack

- **Frontend:** a single static page (`pb_public/index.html`) — vanilla HTML/CSS/JS, no build step
- **Charts:** [Chart.js](https://www.chartjs.org/) 4.5.1, loaded from the jsDelivr CDN
- **Backend / database:** [PocketBase](https://pocketbase.io) v0.39 (single binary, SQLite), which also serves the frontend

### Prerequisites

- The PocketBase binary for your OS — v0.39.x tested ([downloads](https://github.com/pocketbase/pocketbase/releases))
- A modern browser
- Internet access the first time the page loads (for the Chart.js CDN)

## Installation

1. Clone the repo:
   ```sh
   git clone <your-repo-url> budget_tracker
   cd budget_tracker
   ```
2. Run the setup script. It downloads PocketBase v0.39.4 for your OS and CPU, checks it against the official SHA-256 checksum, and creates `pb_public/config.js` from the example. It's safe to re-run, and it never overwrites an existing `config.js`.
   ```sh
   ./setup.sh                                           # Linux / macOS (needs curl or wget, and unzip)
   powershell -ExecutionPolicy Bypass -File setup.ps1   # Windows
   ```
   Pass `--force` (or `-Force` on Windows) to re-download PocketBase. To set things up by hand instead, download the binary from the [releases page](https://github.com/pocketbase/pocketbase/releases), put it in the project root, and copy `pb_public/config.example.js` to `pb_public/config.js`.
3. Edit `pb_public/config.js` to list the people using the tracker (see [Configuration](#configuration)).
4. Optionally, create a PocketBase admin (superuser) account. You only need it for the PocketBase dashboard; the app itself doesn't log in:
   ```sh
   ./pocketbase superuser upsert you@example.com your-strong-password
   ```

## Running

**Windows:** double-click `Launch Budget Tracker.bat`. It starts PocketBase (if it isn't already running) and opens the app in your browser.

**Linux / macOS:** run `./launch.sh`. It does the same thing as the `.bat` file and writes PocketBase output to `pocketbase.log`.

**Any OS:**
```sh
./pocketbase serve
```
Then open <http://127.0.0.1:8090>.

On startup PocketBase applies the migrations in `pb_migrations/`, which create the database collections. Nothing else needs to be set up.

- App: <http://127.0.0.1:8090>
- PocketBase dashboard: <http://127.0.0.1:8090/_/>

There's no separate dev or production mode: the page is static, so after editing `pb_public/index.html` you just refresh the browser.

> **Security note:** all collections have **public API rules** (no login), and anyone who can reach the PocketBase server can read, change, or delete every record. That's fine with the default `127.0.0.1` bind, which only accepts connections from this computer. **Don't** run `serve --http 0.0.0.0:8090` or put this on a network or the internet without first adding authentication and restricting the API rules in the dashboard.

## Running on Linux / RHEL

PocketBase ships self-contained Linux builds, so it runs on RHEL 8/9, Rocky, Alma, Fedora, Ubuntu, Debian, etc. with nothing else to install.

### Quick start

```sh
sudo dnf install -y git unzip          # RHEL/Fedora; on Debian/Ubuntu: sudo apt install git unzip
git clone <your-repo-url> budget_tracker && cd budget_tracker
./setup.sh                             # downloads + verifies PocketBase, creates config.js
nano pb_public/config.js               # set your users
./launch.sh
```

On a headless server there's no browser to open. Run `./pocketbase serve` and reach the app through an SSH tunnel from your own machine: `ssh -L 8090:127.0.0.1:8090 user@server`, then browse to <http://127.0.0.1:8090>.

### As a systemd service (starts on boot)

An example unit is in [`deploy/budget-tracker.service`](deploy/budget-tracker.service). It expects the project in `/opt/budget_tracker` and a dedicated `budget` user:

```sh
sudo useradd --system --home-dir /opt/budget_tracker --shell /sbin/nologin budget
sudo cp -r budget_tracker /opt/budget_tracker        # including the pocketbase binary and config.js
sudo mkdir -p /opt/budget_tracker/pb_data
sudo chown -R budget:budget /opt/budget_tracker
sudo cp /opt/budget_tracker/deploy/budget-tracker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now budget-tracker
systemctl status budget-tracker
```

**SELinux (RHEL / Fedora / Rocky / Alma):** systemd may refuse to run a binary that has a generic file label. Label it as an executable once:

```sh
sudo semanage fcontext -a -t bin_t '/opt/budget_tracker/pocketbase'
sudo restorecon -Rv /opt/budget_tracker
```

If the service still fails, check `sudo ausearch -m avc -ts recent` for denials. You don't need any firewalld changes, because the service only listens on `127.0.0.1`.

### Moving existing data from Windows

Stop PocketBase on both machines, copy the `pb_data/` folder and your `pb_public/config.js` across, then `chown -R budget:budget` them if you're using the service.

## Configuration

The project doesn't use environment variables. App settings live in `pb_public/config.js`, which is gitignored; copy it from `pb_public/config.example.js`.

| Setting | Description |
|---|---|
| `users` | Array of `{ id, label, color }`. `id` is stored on every record. **Don't change an id once you have data**, or that user's existing records will disappear from their view. `label` and `color` are display-only. If `config.js` is missing, two generic users (`user1`, `user2`) are used. |
| `pbUrl` | PocketBase base URL. Leave empty (`""`) to use the same server that serves the page, which is the normal case. |

PocketBase's own options (port, data directory, etc.) are command-line flags. Run `./pocketbase serve --help` to see them.

## Project structure

```
budget_tracker/
├── pb_public/
│   ├── index.html            # The whole app (UI + logic), served by PocketBase
│   ├── config.example.js     # Template for local config (committed)
│   └── config.js             # Your local config (gitignored)
├── pb_migrations/            # PocketBase schema migrations: creates the 5 collections
├── pb_data/                  # SQLite database and PocketBase runtime files (gitignored)
├── deploy/
│   └── budget-tracker.service # Example systemd unit for Linux servers
├── Launch Budget Tracker.bat # Windows one-click launcher
├── launch.sh                 # Linux/macOS launcher
├── setup.sh / setup.ps1      # One-time setup: fetch PocketBase, create config.js
├── LICENSE
└── README.md
```

### Data model (PocketBase collections)

| Collection | Fields |
|---|---|
| `transactions` | `user`, `date` (YYYY-MM-DD), `category`, `subcategory`, `description`, `amount`, `recurring` |
| `income` | `user`, `date`, `source`, `amount` |
| `standard_budgets` | `user`, `category`, `amount` |
| `monthly_budgets` | `user`, `month` (YYYY-MM), `category`, `amount` |
| `category_data` | `name`, `subcategories` (JSON array). Shared by all users |

## Backups

- In the app: **Data Backup → Export JSON / Export CSV**.
- Full backup: stop PocketBase and copy the `pb_data/` folder, or use **Settings → Backups** in the PocketBase dashboard.

## License

[MIT](LICENSE) © 2026 BLN

PocketBase is distributed separately under its own MIT license.
