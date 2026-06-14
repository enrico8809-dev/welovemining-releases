# WLM Hub

The central relay for **WLM ASIC Manager**, modelled on Braiins Manager: each
site's agent dials **out** to the Hub and pushes its fleet; the **web dashboard**
and the **Android app** read everything from the Hub. No per‑site tunnels, no
port‑forwarding at the sites.

```
Site Agent ── POST /api/agent/report ──▶  WLM Hub  ◀── GET /api/v1/fleet ── Web + App
   (outbound only)                          (one public address)
```

You run **one** Hub (here: on a PC at your office). Because everything dials
*into* the Hub, that one box needs a single public address — a one‑time
Cloudflare tunnel or port‑forward (set `tunnelToken` in `config.json`, or leave
blank for a free instant address shown in the logs / `/api/v1/tunnel`).

## Run

```bash
cp config.example.json config.json     # set a long operatorToken
node server.js                          # http://localhost:8900
```

- **operatorToken** — your master token; the web dashboard and your app use it
  to see all sites. Keep it secret.
- **siteKeys** — optional allowlist `{ "<key>": "Client name" }`. If you list any
  keys, only those agents are accepted; if empty, any agent key is accepted
  (and named by the agent). One key per client site.
- **tunnelToken** — connection code for the Hub's own public address (one tunnel
  for the whole system, not per site).

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/agent/report` | site key (body) | Agent pushes fleet; reply carries queued commands |
| GET | `/api/v1/fleet` | operator token | All miners across all sites |
| GET | `/api/v1/sites` | operator token | Site list + online/last‑seen |
| POST | `/api/v1/miners/<siteKey::minerId>/reboot` | operator token | Queue a reboot |
| GET | `/` | — | Web dashboard (enter token in the page) |

## Connect the app

In the app → **Settings → My Sites → Add site**: name it "All sites", address =
your Hub URL, token = the **operatorToken**. You'll see every client site
grouped by name. (A client can be given a scoped login later.)
