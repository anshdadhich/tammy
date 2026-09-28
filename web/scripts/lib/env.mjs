import { readFileSync } from "node:fs";

export function loadEnv(path) {
  const out = {};
  let text = "";
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return out;
  }
  for (const rawLine of text.split("\n")) {
    let line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("export ")) line = line.slice(7).trim();
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let val = line.slice(eq + 1).trim();
    const quote = val[0];
    if (quote === '"' || quote === "'") {
      const end = val.indexOf(quote, 1);
      val = end > 0 ? val.slice(1, end) : val.slice(1);
    } else {
      const hash = val.indexOf(" #");
      if (hash >= 0) val = val.slice(0, hash).trim();
      else if (val.startsWith("#")) val = "";
    }
    out[key] = val;
  }
  return out;
}
