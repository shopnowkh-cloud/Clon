import { createFileRoute } from "@tanstack/react-router";
import { loadState, saveWebappOrder } from "@/lib/telegram/storage";
import { verifyTelegramInitData } from "@/lib/telegram/verify-webapp";

const KHPAY_BASE = "https://khpay.site/api/v1";
const DEFAULT_KHPAY_TOKEN = "ak_5de3149200e549b740b513233fa2a90930f8d2efadabcd92";

async function createKhpayOrder(token: string, amount: number) {
  const res = await fetch(`${KHPAY_BASE}/bakong/generate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ amount, currency: "USD", note: "Mini App", type: "individual" }),
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { success: false, error: text };
  }
}

export const Route = createFileRoute("/api/webapp/order")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const { initData, type, quantity } = body as {
            initData?: string;
            type?: string;
            quantity?: number;
          };

          if (!type || !quantity || quantity < 1) {
            return Response.json({ ok: false, error: "invalid parameters" }, { status: 400 });
          }

          let userId = 0;
          if (initData) {
            const v = await verifyTelegramInitData(initData);
            if (v.valid && v.user) userId = v.user.id;
          }

          const state = await loadState();
          const pool = state.accounts.account_types[type] ?? [];
          if (pool.length < quantity) {
            return Response.json(
              { ok: false, error: `អស់ស្តុក! មានត្រឹម ${pool.length}` },
              { status: 400 },
            );
          }

          const price = state.accounts.prices[type] ?? 0;
          if (price <= 0) {
            return Response.json({ ok: false, error: "ប្រភេទនេះមិនអាចទិញបាន" }, { status: 400 });
          }
          const totalPrice = Math.round(price * quantity * 100) / 100;

          const khpayToken = (() => {
            const stored = state.settings.CAMBO_API_TOKEN || "";
            return stored.startsWith("ak_")
              ? stored
              : process.env.KHPAY_API_TOKEN || DEFAULT_KHPAY_TOKEN;
          })();

          const khRes = await createKhpayOrder(khpayToken, totalPrice);
          if (!khRes?.success || !khRes?.data) {
            return Response.json(
              { ok: false, error: khRes?.error || khRes?.message || "KhPay API error" },
              { status: 500 },
            );
          }

          const d = khRes.data;
          const transaction_id: string = d.transaction_id || "";
          const md5: string | null = d.md5 || null;
          const qr_string: string = d.qr || d.qr_string || "";
          const download_qr: string | null = d.download_qr || null;

          if (!transaction_id || (!qr_string && !download_qr)) {
            return Response.json({ ok: false, error: "No QR data from KhPay" }, { status: 500 });
          }

          const qr_url =
            download_qr ||
            `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&ecc=M&data=${encodeURIComponent(qr_string)}`;

          const expires_at = Date.now() + 60_000;

          await saveWebappOrder(transaction_id, {
            userId,
            type,
            quantity,
            total_price: totalPrice,
            transaction_id,
            md5,
            khpayToken,
            created_at: Date.now(),
            delivered: false,
          });

          return Response.json({
            ok: true,
            transaction_id,
            qr_url,
            total_price: totalPrice,
            expires_at,
          });
        } catch (e) {
          console.error("[webapp/order]", e);
          return Response.json({ ok: false, error: "server error" }, { status: 500 });
        }
      },
    },
  },
});
