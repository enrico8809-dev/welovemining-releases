# WLM Accounting — sync server

Runs on the same Windows PC as the WeLoveMining CRM and is reached from the
phone through a Cloudflare Tunnel on your own domain. Your books never touch
anyone else's infrastructure.

```
Phone  ──https──►  Cloudflare  ──tunnel──►  this server (127.0.0.1:4610)
                                             └── ledger.json
```

The server **only listens on loopback**. Nothing is exposed on your LAN and no
router port is forwarded. `cloudflared` makes an outbound connection to
Cloudflare, and traffic comes back down that same connection — so the machine
is never directly reachable from the internet.

It shares the PC and the tunnel with what is already there rather than competing
with it. One tunnel serves any number of hostnames, each on its own port:

```
crm.welovemining.co.za         ──►  127.0.0.1:4600   the CRM
dss.welovemining.co.za         ──►  127.0.0.1:8080
accounting.welovemining.co.za  ──►  127.0.0.1:4610   the books
```

**4610, not 4600.** The CRM already holds 4600 on that machine. Two programs
cannot listen on one port: the second simply fails to start, and the only sign
is a service that won't run.

## What it does

- Stores the ledger so every device sees the same books
- Email/password accounts with three roles
- Offline-first sync: the phone keeps working with no signal and catches up later

| Role | Can do |
|---|---|
| `owner` | Everything, including adding and removing users |
| `bookkeeper` | Read and write the books |
| `viewer` | Read only — sync accepts nothing they push |

## Install it on Windows

Download **[WLM-Accounting-Server-Setup.exe](https://github.com/enrico8809-dev/welovemining-releases/releases/download/accounting-server-latest/WLM-Accounting-Server-Setup.exe)**
and run it as administrator — registering a Windows service needs that once. It
bundles everything: Node, the server, the service wrapper and Cloudflare's
tunnel client. The PC needs nothing installed beforehand.

It isn't code-signed, so Windows shows "Windows protected your PC" the first
time: **More info** → **Run anyway**.

### Adding the hostname to the tunnel already on that PC

The CRM reaches the outside through a Cloudflare tunnel (`welovemining-crm`) on
this same machine, and that tunnel is **locally managed** — its routes live in a
configuration file on the PC, not in the dashboard. The dashboard says so at the
top of the tunnel's Routes tab, and the Add route button there won't help.

**The installer offers to do all of this.** When it finds a tunnel service
already running and you have given it a hostname, it asks whether to add the
route — and if you say yes, it finds the file the service is actually running
with, copies it aside, inserts the rule above the catch-all with the file's own
indentation, has `cloudflared` validate the result, puts the copy back if that
fails, restarts the tunnel, and creates the DNS record. Your existing routes are
not touched.

Say no, or do it on a machine without the installer, and it goes like this.

**1. Find the config file.** In an administrator command prompt:

```
sc qc cloudflared
```

The `BINARY_PATH_NAME` it prints contains `--config <path>`. That is the file.
It is usually one of:

```
C:\Windows\System32\config\systemprofile\.cloudflared\config.yml
C:\Users\<you>\.cloudflared\config.yml
```

**2. Add the ingress rule.** Open it in Notepad as administrator. It will look
roughly like this; add the middle entry:

```yaml
ingress:
  - hostname: crm.welovemining.co.za
    service: http://localhost:4600
  - hostname: dss.welovemining.co.za
    service: http://127.0.0.1:8080
  - hostname: accounting.welovemining.co.za      # add
    service: http://127.0.0.1:4610               # add
  - service: http_status:404
```

Rules are matched top to bottom and `http_status:404` catches everything, so the
new entry must go **above** it. Keep the indentation exactly as the existing
entries have it — YAML counts spaces, and tabs break it.

**3. Restart the tunnel** so it reads the file:

```
sc stop cloudflared
sc start cloudflared
```

**4. Point DNS at the tunnel.** In the Cloudflare dashboard, `welovemining.co.za`
→ **DNS** → **Add record**:

| | |
|---|---|
| Type | `CNAME` |
| Name | `accounting` |
| Target | `<tunnel-id>.cfargotunnel.com` |
| Proxy status | **Proxied** (orange cloud) — required |

The tunnel id is on the tunnel's Overview page. Copying how `crm` is already set
up is the safest check that this is right.

Then run the installer with the hostname filled in and the **token box empty** —
a token would try to install a second tunnel service, and the installer refuses
when it finds the one already running.

### What it sets up

- **WLM Accounting Server** — a Windows service, started automatically at boot
- **cloudflared** — the tunnel, also a service, if you gave it a token
- **Server status** on the desktop — says whether each half is up, and shows the
  address to paste into both apps
- The books at `C:\ProgramData\WLM Accounting\ledger.json`, which is left
  alone if you ever uninstall

### Then, in the apps

Both the phone and the Windows app: **Settings → Cloud sync → Connect to your
server**, with the address the status window shows
(`https://accounting.welovemining.co.za`).

The **first account created becomes the owner** — do that once, on whichever
app is nearest. Then on the second device, sign in with the same email and
password. Everything after that is automatic: both sync on open, a few seconds
after any change, and once a minute.

For anyone else who needs access, invite them from Settings → Cloud sync rather
than sharing the owner login. They get a code, choose their own password, and
can be made `bookkeeper` (read and write) or `viewer` (read only).

### When something isn't syncing

Open **Server status**. It separates the two halves, because they fail
differently:

| What it says | What it means |
|---|---|
| Service NOT RUNNING | The server itself is down — the log it points at says why |
| On this PC: running, no account yet | Working; nobody has claimed it. Connect from an app |
| From outside: NOT answering | The server is fine; it's the tunnel or DNS |
| From outside: answering | Both halves are up — the address shown is the one to use |

## Install from source

Any OS, or if you'd rather not use the installer. Needs **Node 20 or newer**.

```bash
cd wlm-accounting-server
npm install
npm run build
npm start
```

It prints where it's listening and where the data file lives. By default:

```
%APPDATA%\wlm-accounting\ledger.json      (Windows)
~/wlm-accounting/ledger.json              (macOS/Linux)
```

Override with `WLM_DATA_DIR`. Change the port with `PORT` (default `4610` — the
CRM already uses 4600 on the machine this runs on).

The server starts with no accounts: whoever claims it first becomes the owner,
and `/api/health` reports `claimed: false` until then. Claiming is one-time; a
second attempt is refused.

To keep it running without the installer, the service wrapper and its
configuration are in `installer/` — substitute `{{PORT}}` and `{{DATADIR}}` in
`wlm-accounting-service.xml`, put it beside a WinSW executable renamed to
`wlm-accounting-service.exe`, and run `wlm-accounting-service.exe install`.
On macOS or Linux, a `systemd` unit or a `launchd` plist running
`node dist/index.js` does the same job.

### The tunnel by hand

The installer uses a connector token, which needs no local configuration at all.
The older CLI route still works if you prefer it:

```bash
cloudflared tunnel login
cloudflared tunnel create wlm-accounting
cloudflared tunnel route dns wlm-accounting accounting.welovemining.co.za
```

Then `%USERPROFILE%\.cloudflared\config.yml`:

```yaml
tunnel: wlm-accounting
credentials-file: C:\Users\<you>\.cloudflared\<tunnel-uuid>.json

ingress:
  - hostname: accounting.welovemining.co.za
    service: http://127.0.0.1:4610
  - service: http_status:404
```

`cloudflared service install` then keeps it running across reboots. The
credentials file it writes is a **secret** — anyone holding it can serve traffic
on your hostname.

## Worth locking down further

The tunnel means the endpoint is public, protected by passwords and rate
limiting. For a stronger boundary, put **Cloudflare Access** in front of the
hostname (Zero Trust → Access → Applications) and require a one-time PIN to
your email addresses. Free for small teams, and it stops unauthenticated
traffic before it ever reaches the PC.

## Backups

`ledger.json` is the whole thing. Copy it somewhere off the machine on a
schedule. The app's own JSON export is an independent second copy — worth
keeping both, since they fail in different ways.

Writes are atomic (temp file, then rename), so a crash or power cut mid-write
leaves the previous good file rather than a truncated one. A file that fails to
parse is never overwritten: the server preserves it as `ledger.json.corrupt-<ts>`
and refuses to start, so a bad read can't silently become an empty book.

## Sync, briefly

`POST /api/sync` with a bearer token, `since` (your last cursor) and any
records you've changed. You get back the server's clock as your next cursor
plus everything you haven't seen.

Every record carries `updatedAt` (client clock) and optionally `deletedAt`.
Conflicts resolve last-write-wins per record; deletions travel as tombstones so
a device that was offline learns about them instead of resurrecting the record
on its next push.

Two clocks are deliberately kept apart:

- **`updatedAt`** — the client's clock, used *only* to decide which version wins
- **`_srv`** — the server's clock, used *only* as the pull cursor and for
  tombstone retention

Mixing them is the classic failure here: a device whose clock runs slow writes
records "in the past" and every other device skips straight over them forever.
There are tests pinning both halves of that.

## Tests

```bash
npm test
```

78 tests over the merge rules, clock-skew handling, tombstones, auth, roles,
token forgery, login throttling, and a restart with the data intact — including
16 that start this server for real and sync two devices against it over HTTP,
which is where "whatever I do on one shows up on the other" is actually
established.

The installer build runs one more check before packaging: it starts the server
from the staged payload, with the bundled Node and production dependencies only,
and waits for `/api/health`. A missing runtime dependency would otherwise turn
up as a service that won't start on the owner's PC.
