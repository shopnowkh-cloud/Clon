import { createFileRoute } from "@tanstack/react-router";
import { loadState } from "@/lib/telegram/storage";

export const Route = createFileRoute("/api/webapp/products")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const state = await loadState();
          const products = Object.entries(state.accounts.account_types)
            .filter(([, items]) => items.length > 0)
            .map(([type, items]) => ({
              type,
              count: items.length,
              price: state.accounts.prices[type] ?? 0,
            }))
            .filter((p) => p.price > 0);
          return Response.json({ products });
        } catch (e) {
          console.error("[webapp/products]", e);
          return Response.json({ products: [] });
        }
      },
    },
  },
});
