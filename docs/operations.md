# Operations

## Backups

| Method | What you get | How |
|---|---|---|
| Export JSON / CSV | The selected user's records, readable | *Data Backup* section in the app |
| Copy `pb_data/` | Everything, restorable | Stop PocketBase, then copy the folder |
| PocketBase backups | Everything, as a zip | Dashboard → *Settings → Backups* (<http://127.0.0.1:8090/_/>) |

**Restore:** stop PocketBase, replace `pb_data/` with your copy, and start it again.

## Upgrading PocketBase

The setup scripts pin a tested version (`PB_VERSION` in `setup.sh`, `$PbVersion` in `setup.ps1`). To upgrade:

1. Read the [PocketBase changelog](https://github.com/pocketbase/pocketbase/blob/master/CHANGELOG.md) for breaking changes.
2. Back up `pb_data/`.
3. Bump the version in both setup scripts, then run `./setup.sh --force` (or `setup.ps1 -Force`). The scripts verify the new download against PocketBase's published checksums.
4. Start the app and check that your data loads.

## Changing users

Use *Manage Users* in the app: add a person in the top row, double-click a name to rename it, or click a color to change it. Renaming is always safe, because records store the person's `key`, which never changes.

**Removing** someone permanently deletes all of their transactions, income and budgets. The app lists what will be deleted and asks first. Export a backup beforehand if you might want it back. There must always be at least one user.

`config.js` only sets the people created on first run. Editing `users` there later has no effect.

## Running the tests

Requires Node.js 20 or newer. No `npm install` is needed, since there are no dependencies.

```sh
npm test
```

## Security

The API has no authentication: any program that can reach port 8090 can read and delete everything. The defaults keep it local:

- PocketBase binds to `127.0.0.1` unless you pass `--http`.
- The systemd unit binds to `127.0.0.1` too.
- To use it from another machine, use an SSH tunnel (`ssh -L 8090:127.0.0.1:8090 you@host`) rather than opening the port.

Before exposing it on a network, add PocketBase auth and restrict each collection's API rules in the dashboard.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Toast: "Could not connect to PocketBase" | PocketBase isn't running, or the page was opened as a file | Start it with the launcher or `./pocketbase serve`, and open <http://127.0.0.1:8090> rather than the HTML file |
| Charts are blank | No internet the first time the page loads (Chart.js comes from a CDN) | Connect once. After that the browser usually has it cached |
| `bind: address already in use` | Something else is using port 8090, often another PocketBase | Stop the other one, or use `./pocketbase serve --http=127.0.0.1:8091` |
| Names show as "User 1 / User 2" | Those are the placeholders | Rename them under *Manage Users* |
| "Could not connect to PocketBase" right after updating | PocketBase is still running the old version, so the `people` collection doesn't exist yet | Restart PocketBase so it applies the new migration |
| `setup.ps1` "cannot be loaded… running scripts is disabled" | Windows execution policy | Run `powershell -ExecutionPolicy Bypass -File setup.ps1` |
| systemd service won't start on RHEL | SELinux label on the binary | See [Linux server → SELinux](linux-server.md#selinux-rhel-family) |
