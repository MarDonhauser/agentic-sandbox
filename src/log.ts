export function log(level: string, msg: string, extra: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, msg, ts: new Date().toISOString(), ...extra }));
}
