import http from "node:http";
import { createApp } from "./app.js";
import { ConfigError, loadConfig } from "./config.js";
import { log } from "./log.js";
import { RunStore, SEED_RUNS } from "./runs.js";

let config;
try {
  config = loadConfig();
} catch (err) {
  const reason = err instanceof ConfigError ? err.message : String(err);
  log("error", "startup failed: invalid configuration", { reason });
  process.exit(1);
}

const store = new RunStore(SEED_RUNS);
const app = createApp({ config, store });

app.listen(config.port, () => {
  log("info", "listening", { port: config.port, region: config.region, metricsEnabled: config.metricsEnabled });
});

if (config.metricsEnabled && config.metricsPort) {
  const started = Date.now();
  http
    .createServer((_req, res) => {
      res.setHeader("content-type", "text/plain");
      res.end(`sandbox_runs_total ${store.list().length}\nsandbox_uptime_seconds ${Math.round((Date.now() - started) / 1000)}\n`);
    })
    .listen(config.metricsPort, () => log("info", "metrics listening", { port: config.metricsPort }));
}
