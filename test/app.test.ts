import { describe, expect, it, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { loadConfig, ConfigError } from "../src/config.js";
import { RunStore, SEED_RUNS } from "../src/runs.js";

function buildAppWithStore() {
  const config = loadConfig({ PORT: "0" });
  const store = new RunStore(SEED_RUNS);
  return { app: createApp({ config, store }), store };
}

function buildApp() {
  return buildAppWithStore().app;
}

describe("config", () => {
  it("uses defaults", () => {
    const cfg = loadConfig({});
    expect(cfg).toMatchObject({ port: 3000, region: "eu", logLevel: "info", metricsEnabled: false });
  });

  it("requires METRICS_PORT when metrics are enabled", () => {
    expect(() => loadConfig({ METRICS_ENABLED: "true" })).toThrow(ConfigError);
    expect(loadConfig({ METRICS_ENABLED: "true", METRICS_PORT: "9100" }).metricsPort).toBe(9100);
  });

  it("rejects unknown log levels", () => {
    expect(() => loadConfig({ LOG_LEVEL: "loud" })).toThrow(/LOG_LEVEL/);
  });
});

describe("runs api", () => {
  let app: ReturnType<typeof buildApp>;
  beforeEach(() => {
    app = buildApp();
  });

  it("reports health", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok", region: "eu" });
  });

  it("lists seeded runs and filters by vehicle", async () => {
    const all = await request(app).get("/api/runs");
    expect(all.body).toHaveLength(SEED_RUNS.length);
    const one = await request(app).get("/api/runs?vehicleId=WVW-1001");
    expect(one.body).toHaveLength(2);
  });

  it("returns 404 for unknown run", async () => {
    const res = await request(app).get("/api/runs/run-9999");
    expect(res.status).toBe(404);
  });

  it("creates a run", async () => {
    const res = await request(app)
      .post("/api/runs")
      .send({ vehicleId: "WVW-7777", cycle: "WLTC", co2GramsPerKm: 88.1 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ vehicleId: "WVW-7777", status: "planned" });
    expect(res.body.id).toMatch(/^run-\d{4}$/);
  });

  it("rejects invalid input with details", async () => {
    const res = await request(app).post("/api/runs").send({ vehicleId: "", cycle: "FOO", co2GramsPerKm: "x" });
    expect(res.status).toBe(400);
    expect(res.body.details).toHaveLength(3);
  });
});

describe("delete run", () => {
  it("deletes a run and drops it from the list", async () => {
    const app = buildApp();
    const res = await request(app).delete("/api/runs/run-0001");
    expect(res.status).toBe(204);
    expect(res.body).toEqual({});

    const list = await request(app).get("/api/runs");
    expect(list.body).toHaveLength(SEED_RUNS.length - 1);
    expect(list.body.map((r: { id: string }) => r.id)).not.toContain("run-0001");
    expect((await request(app).get("/api/runs/run-0001")).status).toBe(404);
  });

  it("returns 404 for an unknown run", async () => {
    const res = await request(buildApp()).delete("/api/runs/run-9999");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "run not found", id: "run-9999" });
  });

  it("refuses to delete a run that is in progress", async () => {
    const { app, store } = buildAppWithStore();
    // No route sets the status yet, so the store is the only way to reach "running".
    const run = store.list()[0];
    run.status = "running";

    const res = await request(app).delete(`/api/runs/${run.id}`);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: "run is in progress" });

    const list = await request(app).get("/api/runs");
    expect(list.body).toHaveLength(SEED_RUNS.length);
  });
});
