/**
 * Bot KV storage backed by Cloudflare KV REST API.
 * All state is stored under a single key "bot_state" to minimise API calls.
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

const DEFAULT_STATE: BotState = {
  accounts: { account_types: {}, prices: {} },
  sessions: {},
  settings: {},
  users: {},
  purchases: [],
};

function kvBase() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const nsId = process.env.CLOUDFLARE_KV_NAMESPACE_ID;
  if (!accountId || !apiToken || !nsId) {
    throw new Error("Missing Cloudflare KV env vars: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, CLOUDFLARE_KV_NAMESPACE_ID");
  }
  return {
    url: `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${nsId}/values`,
    token: apiToken,
  };
}

export async function loadState(): Promise<BotState> {
  try {
    const { url, token } = kvBase();
    const res = await fetch(`${url}/bot_state`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 404) return { ...DEFAULT_STATE };
    if (!res.ok) throw new Error(`KV GET bot_state: HTTP ${res.status}`);
    const text = await res.text();
    const parsed = JSON.parse(text) as Partial<BotState>;
    return {
      accounts: parsed.accounts ?? { account_types: {}, prices: {} },
      sessions: parsed.sessions ?? {},
      settings: parsed.settings ?? {},
      users: parsed.users ?? {},
      purchases: parsed.purchases ?? [],
    };
  } catch (e) {
    console.error("[storage] loadState error:", (e as Error).message);
    return { ...DEFAULT_STATE };
  }
}

export async function saveState(state: BotState): Promise<void> {
  const { url, token } = kvBase();
  const res = await fetch(`${url}/bot_state`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(state),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`KV PUT bot_state: HTTP ${res.status} ${text}`);
  }
}
