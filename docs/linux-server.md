# Running on a Linux server (RHEL, Rocky, Alma, Fedora, Ubuntu, Debian)

PocketBase's Linux builds are self-contained, so the only things you need to install are `git` and `unzip`.

## Quick start

```sh
sudo dnf install -y git unzip        # Debian/Ubuntu: sudo apt install git unzip
git clone https://github.com/bri0x/budget-tracker.git && cd budget-tracker
./setup.sh
nano pb_public/config.js
./pocketbase serve
```

There's no browser on a headless server. Open an SSH tunnel from your own machine and browse to <http://127.0.0.1:8090>:

```sh
ssh -L 8090:127.0.0.1:8090 you@server
```

## Run it as a service

[`deploy/budget-tracker.service`](../deploy/budget-tracker.service) is a hardened systemd unit. It runs as a dedicated `budget` user from `/opt/budget_tracker` and only listens on localhost.

```sh
sudo useradd --system --home-dir /opt/budget_tracker --shell /sbin/nologin budget
sudo cp -r budget-tracker /opt/budget_tracker
sudo mkdir -p /opt/budget_tracker/pb_data
sudo chown -R budget:budget /opt/budget_tracker
sudo cp /opt/budget_tracker/deploy/budget-tracker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now budget-tracker
```

Check on it with `systemctl status budget-tracker` or `journalctl -u budget-tracker -f`.

### SELinux (RHEL family)

systemd may refuse to run a binary with a generic file label. Label it once:

```sh
sudo semanage fcontext -a -t bin_t '/opt/budget_tracker/pocketbase'
sudo restorecon -Rv /opt/budget_tracker
```

Still failing? Run `sudo ausearch -m avc -ts recent` to see what was denied. You don't need firewalld changes, because the service only listens on `127.0.0.1`.

## Moving your data from another machine

Stop PocketBase on both machines. Copy `pb_data/` and `pb_public/config.js` across, then run `sudo chown -R budget:budget /opt/budget_tracker` if you're using the service.
