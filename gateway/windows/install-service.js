// Installs the WLM gateway as a Windows service that starts on boot and
// restarts on failure. Run once (as Administrator):
//
//   cd gateway\windows
//   npm install
//   node install-service.js
//
// Manage afterwards via services.msc (service name: "WLM Gateway").

const path = require("path");
const { Service } = require("node-windows");

const svc = new Service({
  name: "WLM Gateway",
  description: "WeLoveMining ASIC Manager site gateway (LAN poller + tunnel API).",
  script: path.join(__dirname, "..", "server.js"),
  nodeOptions: [],
  wait: 2,
  grow: 0.5,
  maxRestarts: 10,
});

svc.on("install", () => {
  console.log("Installed. Starting service...");
  svc.start();
});
svc.on("alreadyinstalled", () => console.log("Service already installed."));
svc.on("start", () => console.log('"WLM Gateway" is running. Manage it in services.msc.'));
svc.on("error", (e) => console.error("Service error:", e));

svc.install();
