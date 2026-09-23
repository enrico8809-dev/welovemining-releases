// Runs the app in development: Vite serving the page, Electron pointed at it,
// and the main process rebuilt first. One command rather than three terminals.
import { spawn } from "node:child_process";
import { once } from "node:events";

const URL = "http://localhost:5183";
const children = [];

function run(command, args, options = {}) {
  const child = spawn(command, args, { stdio: "inherit", shell: true, ...options });
  children.push(child);
  return child;
}

function stopAll() {
  for (const child of children) child.kill();
}

process.on("SIGINT", () => {
  stopAll();
  process.exit(0);
});

const build = run("npm", ["run", "build:main"]);
const [code] = await once(build, "exit");
if (code !== 0) process.exit(code);

run("npx", ["vite"]);
await waitFor(URL);
const electron = run("npx", ["electron", "."], {
  env: { ...process.env, VITE_DEV_SERVER_URL: URL },
});

await once(electron, "exit");
stopAll();

async function waitFor(url) {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Vite did not come up at ${url}`);
}
