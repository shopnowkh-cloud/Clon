import { createFileRoute } from "@tanstack/react-router";
import {
  loadState,
  saveState,
  loadWebappOrder,
  markWebappOrderDelivered,
  type AccountItem,
} from "@/lib/telegram/storage";
import { sendMessage } from "@/lib/telegram/tg";

const KHPAY_BASE = "https://khpay.site/api/v1";
const ADMIN_ID = Number(process.env.ADMIN_ID || "5002402843");
const KH_TZ = "Asia/Phnom_Penh";
const nowKH = () =>
  new Date().toLocaleString("sv-SE", { timeZone: KH_TZ }).replace("T", " ") + " +07";

async function checkKhpay(token: string, transaction_id: string, md5: string | null) {
  const body: Record<string, string> = { transaction_id };
  if (md5) body.md5 = md5;
  const res = await fetch(`${KHPAY_BASE}/bakong/check`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { success: false, error: text };
  }
}

function formatAccount(acc: AccountItem): string {
  if (typeof acc === "string") return acc;
  const a = acc as any;
  if (a.email && a.password) return `${a.email} | ${a.password}`;
  if (a.email) return a.email;
  if (a.phone) return `${a.phone} | ${a.password || ""}`;
  if (a.code) return a.code;
  return JSON.stringify(acc);
}

const esc = (s: unknown) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const Route = createFileRoute("/api/webapp/check")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { transaction_id } = (await request.json()) as {
            initData?: string;
            transaction_id?: string;
          };

          if (!transaction_id) {
            return Response.json(
              { paid: false, error: "missing transaction_id" },
              { status: 400 },
            );
          }

          const order = await loadWebappOrder(transaction_id);
          if (!order) {
            return Response.json({ paid: false, error: "order not found" }, { status: 404 });
          }
          if (order.delivered) {
            return Response.json(
              { paid: false, error: "already delivered" },
              { status: 400 },
            );
          }

          const khRes = await checkKhpay(order.khpayToken, transaction_id, order.md5);
          const d = khRes?.data ?? khRes;
          const status = String(d?.status ?? "").toLowerCase();
          const isPaid =
            khRes?.success !== false &&
            (status === "paid" || status === "success" || status === "completed");

          if (!isPaid) {
            return Response.json({ paid: false, status: status || "pending" });
          }

          const state = await loadState();
          const pool = state.accounts.account_types[order.type] ?? [];
          if (pool.length < order.quantity) {
            return Response.json({
              paid: false,
              error: `អស់ស្តុក! មានត្រឹម ${pool.length} ប៉ុណ្ណោះ`,
            });
          }

          const delivered = pool.slice(0, order.quantity);
          state.accounts.account_types[order.type] = pool.slice(order.quantity);
          state.purchases.push({
            user_id: order.userId,
            account_type: order.type,
            quantity: order.quantity,
            total_price: order.total_price,
            accounts: delivered,
            purchased_at: new Date().toISOString(),
          });

          await saveState(state);
          await markWebappOrderDelivered(transaction_id);

          const coupons = delivered.map(formatAccount);

          if (order.userId) {
            const userMsg =
              `🎉 <b>ការទិញបានបញ្ជាក់! (Mini App)</b>\n\n` +
              `📦 ${esc(order.type)} × ${order.quantity}\n` +
              `💵 $${order.total_price.toFixed(2)}\n\n` +
              `🎟 <b>គូប៉ុងរបស់អ្នក:</b>\n` +
              coupons.map((c) => `<code>${esc(c)}</code>`).join("\n") +
              `\n\n<i>សូមអរគុណ! 🙏</i>`;
            sendMessage(order.userId, userMsg).catch(() => {});

            const adminMsg =
              `🛒 <b>Mini App Sale</b>\n` +
              `━━━━━━━━━━━━━━━━━\n` +
              `👤 UserID: <code>${order.userId}</code>\n` +
              `📦 ${esc(order.type)} × ${order.quantity}\n` +
              `💵 $${order.total_price.toFixed(2)}\n` +
              `⏰ ${nowKH()}`;
            sendMessage(ADMIN_ID, adminMsg).catch(() => {});

            const channelId = state.settings.TELEGRAM_CHANNEL_ID;
            if (channelId && String(channelId) !== String(ADMIN_ID)) {
              sendMessage(channelId, adminMsg).catch(() => {});
            }
          }

          return Response.json({ paid: true, coupons });
        } catch (e) {
          console.error("[webapp/check]", e);
          return Response.json({ paid: false, error: "server error" });
        }
      },
    },
  },
});
