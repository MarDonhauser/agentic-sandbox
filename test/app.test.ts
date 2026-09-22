import { describe, expect, it, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { loadConfig, ConfigError } from "../src/config.js";
import { RunStore, SEED_RUNS } from "../src/runs.js";

function buildApp() {
  const config = loadConfig({ PORT: "0" });
  const store = new RunStore(SEED_RUNS);
  return createApp({ config, store });
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

describe("runs summary", () => {
  let app: ReturnType<typeof buildApp>;
  beforeEach(() => {
    app = buildApp();
  });

  it("aggregates the seeded runs per vehicle, sorted by vehicleId", async () => {
    const res = await request(app).get("/api/runs/summary");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { vehicleId: "WVW-1001", runs: 2, avgCo2GramsPerKm: 125.2 },
      { vehicleId: "WVW-2042", runs: 1, avgCo2GramsPerKm: 97.2 },
      { vehicleId: "WVW-3310", runs: 1, avgCo2GramsPerKm: 104 },
    ]);
  });

  it("does not read summary as a run id", async () => {
    const res = await request(app).get("/api/runs/summary");
    expect(res.status).toBe(200);
    expect(res.body).not.toMatchObject({ error: "run not found", id: "summary" });
  });

  it("counts a newly created run", async () => {
    await request(app)
      .post("/api/runs")
      .send({ vehicleId: "WVW-2042", cycle: "RDE", co2GramsPerKm: 101.8 });
    const res = await request(app).get("/api/runs/summary");
    expect(res.body).toContainEqual({ vehicleId: "WVW-2042", runs: 2, avgCo2GramsPerKm: 99.5 });
  });
});
