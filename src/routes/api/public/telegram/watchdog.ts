import { createFileRoute } from "@tanstack/react-router";
import { runWatchdog } from "@/lib/telegram/handler";

/**
 * Payment watchdog endpoint. Called every minute to check pending payments.
 * Authenticates via WATCHDOG_SECRET header.
 */
export const Route = createFileRoute("/api/public/telegram/watchdog")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.WATCHDOG_SECRET;
        const got = request.headers.get("x-watchdog-secret") ?? "";
        if (!expected || got !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          const result = await runWatchdog();
          return Response.json({ ok: true, ...result });
        } catch (e) {
          console.error("[watchdog] error:", e);
          return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
