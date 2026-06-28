/**
 * Bot KV storage backed by Replit PostgreSQL.
 * All state is stored in a single `bot_kv` table keyed by name.
 */

export type AccountItem =
  | { email: string }
  | { phone: string; password: string }
  | { code: string }
  | Record<string, unknown>;

export interface AccountsData {
  account_types: Record<string, AccountItem[]>;
  prices: Record<string, number>;
}

export interface Session {
  state?: string;
  account_type?: string;
  quantity?: number;
  price?: number;
  available_count?: number;
  total_price?: number;
  transaction_id?: string | null;
  md5?: string | null;
  qr_sent_at?: number;
  photo_message_id?: number;
  qr_message_id?: number;
  started_at?: number;
  labels?: Record<string, string>;
  type_name?: string;
  accounts?: AccountItem[];
  broadcast_text?: string;
  broadcast_message_id?: number;
  broadcast_chat_id?: number;
  broadcast_use_copy?: boolean;
  [k: string]: unknown;
}

export interface KnownUser {
  first_name: string;
  last_name: string;
  username: string;
  first_seen: string;
}

export interface Purchase {
  user_id: number;
  account_type: string;
  quantity: number;
  total_price: number;
  accounts: AccountItem[];
  purchased_at: string;
}

export interface BotState {
  accounts: AccountsData;
  sessions: Record<string, Session>;
  settings: Record<string, string>;
  users: Record<string, KnownUser>;
  purchases: Purchase[];
}

export interface WebappOrder {
  userId: number;
  type: string;
  quantity: number;
  total_price: number;
  transaction_id: string;
  md5: string | null;
  khpayToken: string;
  created_at: number;
  delivered: boolean;
}

const DEFAULT_STATE: BotState = {
  accounts: { account_types: {}, prices: {} },
  sessions: {},
  settings: {},
  users: {},
  purchases: [],
};

// ---------- DB helpers ----------

async function getDb() {
  const { pool } = await import("../../server/db");
  return pool;
}

async function kvGet<T>(key: string): Promise<T | null> {
  const db = await getDb();
  const res = await db.query(
    "SELECT value FROM bot_kv WHERE key = $1",
    [key],
  );
  if (res.rows.length === 0) return null;
  return res.rows[0].value as T;
}

async function kvSet(key: string, value: unknown): Promise<void> {
  const db = await getDb();
  await db.query(
    `INSERT INTO bot_kv (key, value, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  );
}

// ---------- BotState ----------

export async function loadState(): Promise<BotState> {
  try {
    const [accounts, sessions, settings, users, purchases] = await Promise.all([
      kvGet<AccountsData>("accounts"),
      kvGet<Record<string, Session>>("sessions"),
      kvGet<Record<string, string>>("settings"),
      kvGet<Record<string, KnownUser>>("users"),
      kvGet<Purchase[]>("purchases"),
    ]);
    return {
      accounts: accounts ?? { account_types: {}, prices: {} },
      sessions: sessions ?? {},
      settings: settings ?? {},
      users: users ?? {},
      purchases: purchases ?? [],
    };
  } catch (e) {
    console.error("[storage] loadState error:", (e as Error).message);
    return { ...DEFAULT_STATE };
  }
}

export async function saveState(state: BotState): Promise<void> {
  await Promise.all([
    kvSet("accounts", state.accounts),
    kvSet("sessions", state.sessions),
    kvSet("settings", state.settings),
    kvSet("users", state.users),
    kvSet("purchases", state.purchases),
  ]);
}

// ---------- Webapp orders ----------

export async function loadWebappOrder(txId: string): Promise<WebappOrder | null> {
  try {
    const db = await getDb();
    const key = `webapp_order_${txId.replace(/[^a-zA-Z0-9]/g, "_")}`;
    const res = await db.query(
      "SELECT value FROM bot_kv WHERE key = $1",
      [key],
    );
    if (res.rows.length === 0) return null;
    return res.rows[0].value as WebappOrder;
  } catch {
    return null;
  }
}

export async function saveWebappOrder(txId: string, order: WebappOrder): Promise<void> {
  const key = `webapp_order_${txId.replace(/[^a-zA-Z0-9]/g, "_")}`;
  await kvSet(key, order);
}

export async function markWebappOrderDelivered(txId: string): Promise<void> {
  const order = await loadWebappOrder(txId);
  if (order) {
    order.delivered = true;
    await saveWebappOrder(txId, order);
  }
}
