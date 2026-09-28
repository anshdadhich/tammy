const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}|${id}`, "utf8").toString("base64url");
}

export function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    if (typeof cursor !== "string" || !cursor || cursor.length > 512) return null;
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const i = raw.lastIndexOf("|");
    if (i <= 0) return null;
    const createdAt = raw.slice(0, i);
    const id = raw.slice(i + 1);
    if (!createdAt || !id) return null;
    if (Number.isNaN(Date.parse(createdAt))) return null;
    if (!UUID_RE.test(id)) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}
