import { createApp } from "./server";
import { Store, defaultDataPath } from "./store";
import { newSecret } from "./auth";

const PORT = Number(process.env.PORT ?? 4600);
// Bound to loopback on purpose: the only way in is the Cloudflare tunnel, which
// connects outbound from this machine. Nothing is ever exposed on the LAN or
// through a forwarded port.
const HOST = process.env.WLM_HOST ?? "127.0.0.1";

function main() {
  const dataPath = defaultDataPath();
  const store = new Store(dataPath, newSecret);
  const app = createApp(store);

  app.listen(PORT, HOST, () => {
    const db = store.read();
    console.log(`WLM Accounting server`);
    console.log(`  listening   http://${HOST}:${PORT}`);
    console.log(`  data        ${dataPath}`);
    console.log(
      db.users.length
        ? `  accounts    ${db.users.length}`
        : `  accounts    none yet — open the app and claim this server`
    );
  });
}

main();
