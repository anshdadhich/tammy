import { redactPii } from "@/lib/redact";

type Ctx = Record<string, unknown>;

export function startWideEvent(route: string, method: string): {
  add: (fields: Ctx) => void;
  end: (outcome: { status: number; error?: string }) => void;
} {
  const t0 = Date.now();
  const event: Ctx = {
    ts: new Date().toISOString(),
    route,
    method,
    service: "web",
  };
  return {
    add(fields: Ctx) {
      Object.assign(event, fields);
    },
    end({ status, error }) {
      event.status = status;
      event.duration_ms = Date.now() - t0;
      if (error) event.error = error;
      const keep =
        status >= 500 || error || (event.duration_ms as number) > 2000 || Math.random() < 0.1;
      if (keep) {
        try {
          console.info(JSON.stringify({ wide_event: event }));
        } catch {}
      }
    },
  };
}

export function withWideEvent<T>(
  route: string,
  handler: (request: Request, wev: { add: (f: Ctx) => void }) => Promise<T>,
): (request: Request) => Promise<T | Response> {
  return async (request: Request) => {
    const wev = startWideEvent(route, request.method);
    try {
      const res = await handler(request, wev);
      const status = res instanceof Response ? res.status : 200;
      wev.end({ status });
      return res;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      wev.end({ status: 500, error: redactPii(msg.slice(0, 500)) });
      return Response.json({ error: "internal error" }, { status: 500 });
    }
  };
}
