# WLM Accounting — sync server

Runs on the same Windows PC as the WeLoveMining CRM and is reached from the
phone through a Cloudflare Tunnel on your own domain. Your books never touch
anyone else's infrastructure.

```
Phone  ──https──►  Cloudflare  ──tunnel──►  this server (127.0.0.1:4600)
                                             └── ledger.json
```

The server **only listens on loopback**. Nothing is exposed on your LAN and no
router port is forwarded. `cloudflared` makes an outbound connection to
Cloudflare, and traffic comes back down that same connection — so the machine
is never directly reachable from the internet.

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

### Get the tunnel details first

The installer asks for two things that only exist in your Cloudflare account.
Have them ready and the whole setup is one pass:

1. Cloudflare dashboard → **Zero Trust** → **Networks** → **Tunnels** → **Create a tunnel**
2. Choose **Cloudflared**, name it `wlm-accounting`
3. On the next screen, **copy the connector token** — the long string in the
   install command it shows you. That is what the installer wants; ignore the
   rest of the command, the installer runs it for you.
4. Add a **public hostname**: e.g. `accounting` on `welovemining.co.za`, with
   service **HTTP** → `127.0.0.1:4600`

The port has to match on both sides, so leave it at 4600 unless something else
on that PC already uses it.

Both boxes in the installer can be left empty if you'd rather do the tunnel
later — the server still installs and runs, and re-running the installer is how
you add the tunnel afterwards.

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

Override with `WLM_DATA_DIR`. Change the port with `PORT` (default `4600`, so it
won't collide with the CRM on 4500).

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
    service: http://127.0.0.1:4600
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
