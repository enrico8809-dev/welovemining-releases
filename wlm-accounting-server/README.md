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

## Install

Needs **Node 20 or newer** on the PC.

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

### First run

The server starts with no accounts. Open the app, point it at the server, and
**claim** it — the first account created becomes the owner. Until someone
claims it, `/api/health` reports `claimed: false`.

Claiming is a one-time operation; a second attempt is refused.

## Cloudflare Tunnel

You already have the domain on Cloudflare, so this is the same pattern as the
CRM tunnel.

**1. Install cloudflared** on the PC — download from Cloudflare, or:

```bash
winget install --id Cloudflare.cloudflared
```

**2. Authenticate** (opens a browser; pick the welovemining.co.za zone):

```bash
cloudflared tunnel login
```

**3. Create the tunnel:**

```bash
cloudflared tunnel create wlm-accounting
```

Note the tunnel UUID it prints. The credentials file it writes is a **secret** —
anyone holding it can serve traffic on your hostname. Don't commit it.

**4. Point a hostname at it:**

```bash
cloudflared tunnel route dns wlm-accounting accounting.welovemining.co.za
```

**5. Write the config.** On Windows this goes in
`C:\Users\<you>\.cloudflared\config.yml`:

```yaml
tunnel: wlm-accounting
credentials-file: C:\Users\<you>\.cloudflared\<tunnel-uuid>.json

ingress:
  - hostname: accounting.welovemining.co.za
    service: http://127.0.0.1:4600
  - service: http_status:404
```

**6. Run it:**

```bash
cloudflared tunnel run wlm-accounting
```

Then in the app, set the server URL to `https://accounting.welovemining.co.za`.

## Keeping it running

Both the server and the tunnel need to survive a reboot, or the phone silently
stops syncing.

**The tunnel** installs itself as a service:

```bash
cloudflared service install
```

**The server** — simplest reliable option is [NSSM](https://nssm.cc):

```bash
nssm install WLMAccounting "C:\Program Files\nodejs\node.exe" "C:\path\to\wlm-accounting-server\dist\index.js"
nssm set WLMAccounting AppDirectory "C:\path\to\wlm-accounting-server"
nssm set WLMAccounting AppEnvironmentExtra PORT=4600
nssm start WLMAccounting
```

Check both are up after a reboot by loading
`https://accounting.welovemining.co.za/api/health`.

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

56 tests over the merge rules, clock-skew handling, tombstones, auth, roles,
token forgery, login throttling, and a restart with the data intact.
