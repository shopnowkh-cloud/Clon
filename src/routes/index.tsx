import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

// ---------- Telegram WebApp types ----------
interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}
interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { user?: TelegramUser };
  ready(): void;
  expand(): void;
  close(): void;
  colorScheme: "light" | "dark";
  themeParams: {
    bg_color?: string;
    text_color?: string;
    hint_color?: string;
    button_color?: string;
    button_text_color?: string;
    secondary_bg_color?: string;
    link_color?: string;
  };
  BackButton: {
    isVisible: boolean;
    show(): void;
    hide(): void;
    onClick(cb: () => void): void;
    offClick(cb: () => void): void;
  };
  HapticFeedback?: {
    impactOccurred(style: "light" | "medium" | "heavy"): void;
    notificationOccurred(type: "error" | "success" | "warning"): void;
  };
}
declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

const twa = (): TelegramWebApp | undefined =>
  typeof window !== "undefined" ? window?.Telegram?.WebApp : undefined;
const haptic = (type: "light" | "medium" | "heavy") =>
  twa()?.HapticFeedback?.impactOccurred(type);
const hapticResult = (type: "error" | "success" | "warning") =>
  twa()?.HapticFeedback?.notificationOccurred(type);

// ---------- Types ----------
interface Product {
  type: string;
  count: number;
  price: number;
}
interface OrderResp {
  ok: boolean;
  transaction_id: string;
  qr_url: string;
  total_price: number;
  expires_at: number;
  error?: string;
}
type Screen = "loading" | "products" | "detail" | "payment" | "success" | "error";

// ---------- Route ----------
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "គូប៉ុង Shop" },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" },
      { name: "theme-color", content: "#2563eb" },
    ],
    scripts: [{ src: "https://telegram.org/js/telegram-web-app.js" }],
  }),
  component: MiniApp,
});

// ---------- Mini App ----------
function MiniApp() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [qty, setQty] = useState(1);
  const [order, setOrder] = useState<OrderResp | null>(null);
  const [coupons, setCoupons] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [copied, setCopied] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const initData = twa()?.initData ?? "";
  const user = twa()?.initDataUnsafe?.user;

  // -- Theme --
  const th = {
    bg: "var(--tg-theme-bg-color, #ffffff)",
    sec: "var(--tg-theme-secondary-bg-color, #f4f4f5)",
    text: "var(--tg-theme-text-color, #111827)",
    hint: "var(--tg-theme-hint-color, #6b7280)",
    btn: "var(--tg-theme-button-color, #2563eb)",
    btnTxt: "var(--tg-theme-button-text-color, #ffffff)",
    link: "var(--tg-theme-link-color, #2563eb)",
  };

  // -- Products --
  const fetchProducts = useCallback(async () => {
    setScreen("loading");
    try {
      const res = await fetch("/api/webapp/products");
      const data = await res.json();
      setProducts(data.products ?? []);
      setScreen("products");
    } catch {
      setErrorMsg("មិនអាចទាក់ទងម៉ាស៊ីន");
      setScreen("error");
    }
  }, []);

  useEffect(() => {
    const app = twa();
    if (app) { app.ready(); app.expand(); }
    fetchProducts();
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
      if (countRef.current) clearInterval(countRef.current);
    };
  }, []);

  // -- Back button --
  useEffect(() => {
    const app = twa();
    if (!app) return;
    const goBack = () => {
      if (screen === "detail") { setScreen("products"); setSelected(null); setQty(1); }
    };
    if (screen === "detail") { app.BackButton.show(); app.BackButton.onClick(goBack); }
    else { app.BackButton.hide(); }
    return () => app.BackButton.offClick(goBack);
  }, [screen]);

  // -- Countdown during payment --
  useEffect(() => {
    if (screen === "payment" && order) {
      setCountdown(Math.max(0, Math.floor((order.expires_at - Date.now()) / 1000)));
      countRef.current = setInterval(() => {
        setCountdown((c) => { if (c <= 1) { clearInterval(countRef.current!); return 0; } return c - 1; });
      }, 1000);
    } else {
      if (countRef.current) { clearInterval(countRef.current); countRef.current = null; }
    }
    return () => { if (countRef.current) clearInterval(countRef.current); };
  }, [screen, order]);

  // -- Payment auto-poll --
  const doCheck = useCallback(async (txId: string) => {
    if (!txId) return;
    try {
      const res = await fetch("/api/webapp/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData, transaction_id: txId }),
      });
      const data = await res.json();
      if (data.paid && data.coupons) {
        setCoupons(data.coupons);
        setScreen("success");
        hapticResult("success");
        if (pollRef.current) clearTimeout(pollRef.current);
      } else if (!data.paid) {
        pollRef.current = setTimeout(() => doCheck(txId), 5000);
      }
    } catch {
      pollRef.current = setTimeout(() => doCheck(txId), 5000);
    }
  }, [initData]);

  useEffect(() => {
    if (screen === "payment" && order) {
      pollRef.current = setTimeout(() => doCheck(order.transaction_id), 5000);
    }
    return () => { if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null; } };
  }, [screen]);

  // -- Handlers --
  const selectProduct = (p: Product) => {
    setSelected(p); setQty(1); setScreen("detail"); haptic("light");
  };

  const createOrder = async () => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/webapp/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData, type: selected.type, quantity: qty }),
      });
      const data: OrderResp = await res.json();
      if (!data.ok) { setErrorMsg(data.error || "មានបញ្ហា"); setScreen("error"); return; }
      setOrder(data);
      setScreen("payment");
      haptic("medium");
    } catch {
      setErrorMsg("មិនអាចបង្កើតការបញ្ជាទិញ"); setScreen("error");
    } finally { setBusy(false); }
  };

  const manualCheck = async () => {
    if (!order || busy) return;
    setBusy(true);
    if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null; }
    try {
      const res = await fetch("/api/webapp/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData, transaction_id: order.transaction_id }),
      });
      const data = await res.json();
      if (data.paid && data.coupons) {
        setCoupons(data.coupons); setScreen("success"); hapticResult("success");
      } else {
        hapticResult("warning");
        pollRef.current = setTimeout(() => doCheck(order.transaction_id), 5000);
      }
    } catch {
      pollRef.current = setTimeout(() => doCheck(order.transaction_id), 5000);
    } finally { setBusy(false); }
  };

  const copyCode = async (text: string, idx: number) => {
    try { await navigator.clipboard.writeText(text); setCopied(idx); setTimeout(() => setCopied(null), 2000); } catch { }
  };

  const totalPrice = selected ? (selected.price * qty).toFixed(2) : "0";
  const mins = String(Math.floor(countdown / 60)).padStart(2, "0");
  const secs = String(countdown % 60).padStart(2, "0");

  // ---------- SCREENS ----------

  // Loading
  if (screen === "loading") return (
    <div style={{ ...fill, background: th.bg, color: th.text, ...center, flexDirection: "column", gap: 16 }}>
      <span style={{ fontSize: 52 }}>🎟</span>
      <span style={{ color: th.hint, fontSize: 14 }}>កំពុងផ្ទុក...</span>
    </div>
  );

  // Error
  if (screen === "error") return (
    <div style={{ ...fill, background: th.bg, color: th.text, ...center, flexDirection: "column", gap: 16, padding: "0 24px" }}>
      <span style={{ fontSize: 52 }}>❌</span>
      <b style={{ fontSize: 17 }}>មានបញ្ហា</b>
      <span style={{ color: th.hint, fontSize: 14, textAlign: "center" }}>{errorMsg}</span>
      <Btn bg={th.btn} txt={th.btnTxt} onClick={() => { setErrorMsg(""); fetchProducts(); }}>
        🔄 ព្យាយាមម្ដងទៀត
      </Btn>
    </div>
  );

  // Success
  if (screen === "success") return (
    <div style={{ ...fill, background: th.bg, color: th.text, display: "flex", flexDirection: "column" }}>
      <Header bg="#16a34a" emoji="🎉" title="ទិញបានជោគជ័យ!" sub={`${coupons.length} គូប៉ុង — ចុចដើម្បីចម្លង`} />
      <div style={{ flex: 1, padding: "16px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
        {coupons.map((c, i) => (
          <button key={i} onClick={() => copyCode(c, i)}
            style={{ background: copied === i ? "#dcfce7" : th.sec, border: `2px solid ${copied === i ? "#16a34a" : "transparent"}`, borderRadius: 14, padding: "14px 16px", cursor: "pointer", width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", transition: "all 0.2s" }}>
            <code style={{ fontSize: 13, color: th.text, wordBreak: "break-all", flex: 1, textAlign: "left", fontFamily: "monospace" }}>{c}</code>
            <span style={{ marginLeft: 10, fontSize: 20, flexShrink: 0 }}>{copied === i ? "✅" : "📋"}</span>
          </button>
        ))}
        <p style={{ color: th.hint, fontSize: 12, textAlign: "center", margin: "8px 0" }}>
          🤖 ពិនិត្យ Telegram Bot សម្រាប់ការបញ្ជាក់ផងដែរ
        </p>
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <Btn bg={th.sec} txt={th.text} flex onClick={() => { setCoupons([]); setOrder(null); setSelected(null); setQty(1); fetchProducts(); }}>
            🔄 ទិញបន្ត
          </Btn>
          <Btn bg={th.btn} txt={th.btnTxt} flex onClick={() => twa()?.close()}>
            ✅ រួចរាល់
          </Btn>
        </div>
      </div>
    </div>
  );

  // Payment
  if (screen === "payment" && order) return (
    <div style={{ ...fill, background: th.bg, color: th.text, display: "flex", flexDirection: "column" }}>
      <Header bg={th.btn} emoji="💳" title="ទូទាត់ប្រាក់" sub="ស្កេន QR ជាមួយ ABA, Wing, ឬ KHQR" />
      <div style={{ flex: 1, padding: "16px", display: "flex", flexDirection: "column", gap: 14, alignItems: "center", overflowY: "auto" }}>
        <Card bg={th.sec} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: th.hint, fontSize: 14 }}>ចំនួនទឹកប្រាក់</span>
          <span style={{ fontSize: 24, fontWeight: 700, color: th.link }}>${order.total_price.toFixed(2)}</span>
        </Card>

        <div style={{ background: "#fff", borderRadius: 18, padding: 14, boxShadow: "0 4px 20px rgba(0,0,0,0.12)" }}>
          <img src={order.qr_url} alt="QR Code" width={230} height={230}
            style={{ display: "block", borderRadius: 8 }}
            onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0.3"; }} />
        </div>

        <div style={{ textAlign: "center", fontSize: 15 }}>
          {countdown === 0
            ? <span style={{ color: "#ef4444", fontWeight: 600 }}>⏰ ផុតកំណត់ — ចុចត្រួតពិនិត្យ</span>
            : <span style={{ color: th.hint }}>⏱ <b style={{ color: th.text }}>{mins}:{secs}</b> នៅសល់</span>}
        </div>

        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10, marginTop: "auto" }}>
          <Btn bg="#16a34a" txt="#fff" onClick={manualCheck} disabled={busy}>
            {busy ? "⏳ កំពុងត្រួតពិនិត្យ..." : "✅ ខ្ញុំបានបង់ប្រាក់ហើយ"}
          </Btn>
          <button onClick={() => { if (pollRef.current) clearTimeout(pollRef.current); setOrder(null); setScreen("products"); }}
            style={{ background: "transparent", color: "#ef4444", border: "2px solid #ef4444", borderRadius: 14, padding: "13px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer", width: "100%" }}>
            🚫 បោះបង់
          </button>
        </div>
      </div>
    </div>
  );

  // Detail
  if (screen === "detail" && selected) {
    const max = Math.min(selected.count, 10);
    return (
      <div style={{ ...fill, background: th.bg, color: th.text, display: "flex", flexDirection: "column" }}>
        <Header bg={th.btn} emoji="🎟" title={selected.type} sub={`📦 ${selected.count} នៅក្នុងស្តុក`} />
        <div style={{ flex: 1, padding: "16px", display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
          <Card bg={th.sec} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: th.hint, fontSize: 14 }}>តម្លៃក្នុងមួយ</span>
            <span style={{ fontSize: 20, fontWeight: 700, color: th.link }}>${selected.price.toFixed(2)}</span>
          </Card>

          <Card bg={th.sec}>
            <div style={{ color: th.hint, fontSize: 13, marginBottom: 14 }}>ចំនួន</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 24 }}>
              <RoundBtn onClick={() => { setQty(q => Math.max(1, q - 1)); haptic("light"); }} disabled={qty <= 1} bg={th.btn} txt={th.btnTxt}>−</RoundBtn>
              <span style={{ fontSize: 32, fontWeight: 700, minWidth: 44, textAlign: "center" }}>{qty}</span>
              <RoundBtn onClick={() => { setQty(q => Math.min(max, q + 1)); haptic("light"); }} disabled={qty >= max} bg={th.btn} txt={th.btnTxt}>+</RoundBtn>
            </div>
          </Card>

          <Card bg={th.sec} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>សរុប</span>
            <span style={{ fontSize: 26, fontWeight: 700, color: th.link }}>${totalPrice}</span>
          </Card>

          <Btn bg={th.btn} txt={th.btnTxt} onClick={createOrder} disabled={busy} style={{ marginTop: "auto" }}>
            {busy ? "⏳ កំពុងដំណើរការ..." : `💳 ទិញ ($${totalPrice})`}
          </Btn>
        </div>
      </div>
    );
  }

  // Products
  return (
    <div style={{ ...fill, background: th.bg, color: th.text, display: "flex", flexDirection: "column" }}>
      <Header bg={th.btn} emoji="🎟" title="គូប៉ុង Shop" sub={user ? `👋 ${user.first_name}` : "ជ្រើសរើសគូប៉ុងដើម្បីទិញ"} />
      <div style={{ flex: 1, padding: "16px", display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
        <div style={{ fontSize: 14, color: th.hint, fontWeight: 500 }}>
          {products.length === 0 ? "😔 អស់ស្តុកទាំងអស់" : `📦 ${products.length} ប្រភេទ`}
        </div>
        {products.map((p) => (
          <button key={p.type} onClick={() => selectProduct(p)}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: th.sec, border: "none", borderRadius: 18, padding: "18px 16px", cursor: "pointer", width: "100%", textAlign: "left" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: th.text }}>{p.type}</div>
              <div style={{ fontSize: 13, color: th.hint, marginTop: 4 }}>📦 {p.count} នៅមាន</div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: th.link }}>${p.price.toFixed(2)}</div>
              <div style={{ fontSize: 12, color: th.hint }}>ក្នុងមួយ</div>
            </div>
          </button>
        ))}
        {products.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 0", color: th.hint }}>
            <div style={{ fontSize: 56 }}>🪤</div>
            <div style={{ marginTop: 16, fontSize: 15 }}>សូមត្រឡប់មកម្ដងទៀតនៅពេលក្រោយ</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Shared style atoms ----------
const fill: React.CSSProperties = { minHeight: "100dvh" };
const center: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center" };

function Header({ bg, emoji, title, sub }: { bg: string; emoji: string; title: string; sub?: string }) {
  return (
    <div style={{ background: bg, color: "#fff", padding: "22px 16px 18px", textAlign: "center" }}>
      <div style={{ fontSize: 34, marginBottom: 4 }}>{emoji}</div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{title}</div>
      {sub && <div style={{ fontSize: 13, opacity: 0.88, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Card({ bg, style, children }: { bg: string; style?: React.CSSProperties; children: React.ReactNode }) {
  return (
    <div style={{ background: bg, borderRadius: 16, padding: "16px", ...style }}>{children}</div>
  );
}

function Btn({ bg, txt, onClick, disabled, flex, style, children }: {
  bg: string; txt: string; onClick?: () => void; disabled?: boolean;
  flex?: boolean; style?: React.CSSProperties; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ background: bg, color: txt, border: "none", borderRadius: 14, padding: "15px 16px", fontSize: 16, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.65 : 1, width: flex ? undefined : "100%", flex: flex ? 1 : undefined, ...style }}>
      {children}
    </button>
  );
}

function RoundBtn({ bg, txt, onClick, disabled, children }: {
  bg: string; txt: string; onClick: () => void; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ width: 48, height: 48, borderRadius: "50%", background: bg, color: txt, border: "none", fontSize: 24, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.35 : 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {children}
    </button>
  );
}
