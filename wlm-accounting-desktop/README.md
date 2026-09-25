# WLM Accounting for Windows

The same books as the phone app, laid out for a desk: a permanent sidebar, dense
tables you can read a hundred rows of at a time, statements you drag onto the
window, and reconciliation side by side instead of a tab at a time.

**Download:** [WLM-Accounting-Setup.exe](https://github.com/enrico8809-dev/welovemining-releases/releases/download/accounting-desktop-latest/WLM-Accounting-Setup.exe)

It installs for the current user, so no administrator password is needed. The
installer is not code-signed, so Windows shows "Windows protected your PC" the
first time — choose **More info**, then **Run anyway**.

## One engine, two apps

Everything that decides what a transaction *means* — the recipes, the double
entry, landed cost, weighted-average stock, the statement parsers, the matching,
the invoice postings — is imported from `../wlm-accounting/src/lib`. Not copied:
imported, through the `@engine` alias. The phone and Windows run the same code,
and its tests live with it in that package.

What this app supplies is the part that is genuinely different:

| | Phone | Windows |
|---|---|---|
| Where the books live | AsyncStorage | A JSON file in `%APPDATA%\WLM Accounting` |
| PDFs | expo-print | Electron's own renderer, from the same HTML |
| Files | The document picker | Drag and drop, or a file dialog |
| Layout | One thing at a time | Sidebar, wide tables, side-by-side |

If a rule about money ever needs changing, it changes once.

## Running it here

```
npm install
npm run dev        # Vite plus Electron, one command
npm run typecheck  # renderer and main process
npm test           # the ledger file's own tests
npm run package    # Windows installer, into release/
```

`npm run package` only produces a Windows installer on Windows. CI builds it on
`windows-latest` and publishes it to the `accounting-desktop-latest` release.

## How it is put together

- **`electron/main.ts`** owns the window and everything that touches the machine.
  The renderer can ask it to open a file, save a file, or render a PDF, but every
  path is one the user chose in a dialog. The books are the only exception, and
  their location is fixed here.
- **`electron/store.ts`** writes the books to a temporary file and renames it over
  the target. A rename within a directory is atomic, so a crash or a power cut
  leaves either the old file or the new one, never half of either. The previous
  version is kept as `ledger.bak.json`, and a file that fails to parse is left
  exactly where it is rather than being overwritten.
- **`electron/preload.ts`** is the only bridge. `contextIsolation` is on and
  `nodeIntegration` is off, so the page has no access to Node beyond the handful
  of named calls listed there.
- **`src/`** is the interface. It has no colours of its own — the palette is read
  from the engine's theme at boot and handed to CSS as custom properties, so the
  two apps cannot drift apart visually either.

## Syncing with the phone

Settings → Cloud sync, pointed at the same server as the phone: your own machine
behind a Cloudflare Tunnel (see `../wlm-accounting-server`). Nothing is sent
anywhere until you sign in. Until then the books are on this PC and nowhere
else.

Once signed in it looks after itself. The sidebar says where it has got to —
*Up to date*, *Saving to the server…*, or *Can't reach the server* — and the
button beside it is only for hurrying things along. It syncs:

- when the app opens
- a few seconds after anything changes, so a burst of capturing goes in one go
- once a minute, so the phone's work arrives without being asked for
- when you come back to the window after leaving it a while

A server that can't be reached is retried further and further apart rather than
hammered, and anything captured meanwhile is kept and sent when it comes back.

Each record carries the moment it changed and the newest version wins, so both
machines can be used at once without one overwriting the other's work wholesale.
Those stamps only ever go forwards, even if a device's clock is corrected
backwards — otherwise work written in the seconds after a correction would be
skipped by the very cursor meant to find it.
