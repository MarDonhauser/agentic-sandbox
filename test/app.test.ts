import { describe, expect, it, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { loadConfig, ConfigError } from "../src/config.js";
import { RunStore, SEED_RUNS } from "../src/runs.js";

function buildApp() {
  const config = loadConfig({ PORT: "0" });
  const store = new RunStore(SEED_RUNS);
  return { app: createApp({ config, store }), store };
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
  let app: ReturnType<typeof buildApp>["app"];
  let store: ReturnType<typeof buildApp>["store"];
  beforeEach(() => {
    const ctx = buildApp();
    app = ctx.app;
    store = ctx.store;
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

  it("deletes an existing run", async () => {
    const created = await request(app)
      .post("/api/runs")
      .send({ vehicleId: "WVW-7777", cycle: "WLTC", co2GramsPerKm: 88.1 });
    const res = await request(app).delete(`/api/runs/${created.body.id}`);
    expect(res.status).toBe(204);
    const list = await request(app).get("/api/runs");
    expect(list.body.some((run: { id: string }) => run.id === created.body.id)).toBe(false);
  });

  it("returns 404 deleting an unknown run", async () => {
    const res = await request(app).delete("/api/runs/run-9999");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "run not found", id: "run-9999" });
  });

  it("rejects deleting a running run", async () => {
    const run = store.create({ vehicleId: "WVW-7777", cycle: "WLTC", co2GramsPerKm: 88.1 });
    const current = store.get(run.id);
    if (!current) throw new Error("expected run to exist");
    current.status = "running";

    const res = await request(app).delete(`/api/runs/${run.id}`);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "run is in progress" });
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

  it("rejects out-of-range co2 values", async () => {
    for (const co2 of [-5, 9999]) {
      const res = await request(app).post("/api/runs").send({ vehicleId: "WVW-7777", cycle: "WLTC", co2GramsPerKm: co2 });
      expect(res.status).toBe(400);
      expect(res.body.details).toContain("co2GramsPerKm must be between 0 and 500");
    }
  });

  it("accepts co2 boundary values", async () => {
    for (const co2 of [0, 500]) {
      const res = await request(app).post("/api/runs").send({ vehicleId: "WVW-7777", cycle: "WLTC", co2GramsPerKm: co2 });
      expect(res.status).toBe(201);
      expect(res.body.co2GramsPerKm).toBe(co2);
    }
  });
});
