// Removes the "WLM Gateway" Windows service. Run as Administrator:
//   node uninstall-service.js

const path = require("path");
const { Service } = require("node-windows");

const svc = new Service({
  name: "WLM Gateway",
  script: path.join(__dirname, "..", "server.js"),
});

svc.on("uninstall", () => console.log('"WLM Gateway" service removed.'));
svc.on("error", (e) => console.error("Service error:", e));

svc.uninstall();
