import { useState } from "react";

interface MandateView {
  code: string;
  max_amount: number;
  remaining: number;
  currency: string;
  card_count: number;
  expires_at: string;
  state: string;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data as T;
}

export function AgentMode({ onBack }: { onBack: () => void }) {
  const [budget, setBudget] = useState(600);
  const [ttl, setTtl] = useState(120);
  const [mandate, setMandate] = useState<MandateView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const mcpUrl = `${window.location.origin}/mcp`;

  async function create() {
    setBusy(true);
    setError(null);
    try {
      setMandate(
        await post<MandateView>("/api/mandates", {
          cards: ["success", "success_mastercard"],
          max_amount: budget,
          ttl_minutes: ttl,
        }),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    if (!mandate) return;
    const res = await fetch(`/api/mandates/${mandate.code}`);
    if (res.ok) setMandate(await res.json());
  }

  async function revoke() {
    if (!mandate) return;
    setBusy(true);
    try {
      setMandate(await post<MandateView>(`/api/mandates/${mandate.code}/revoke`));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="agent-mode">
      <button className="back-link" onClick={onBack}>
        ← Back to store
      </button>
      <h1>Give an agent a budget</h1>
      <p className="muted">
        Delegate shopping to an AI agent without handing it a card. You set a budget and an
        expiry; the agent gets a mandate code. The server enforces the limit on every purchase,
        splits payment across the two backing cards, and refuses anything over budget. Revoke it
        any time.
      </p>

      {!mandate || mandate.state === "revoked" ? (
        <div className="mandate-form">
          <label>
            Budget (AUD)
            <input
              type="number"
              min={1}
              max={100000}
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
            />
          </label>
          <label>
            Expires in
            <select value={ttl} onChange={(e) => setTtl(Number(e.target.value))}>
              <option value={30}>30 minutes</option>
              <option value={120}>2 hours</option>
              <option value={720}>12 hours</option>
              <option value={1440}>24 hours</option>
            </select>
          </label>
          <p className="muted small">
            Backed by two sandbox test cards. In production this is a wallet action: real funding
            sources, real authentication.
          </p>
          <button className="primary" disabled={busy || budget < 1} onClick={create}>
            {busy ? "Creating…" : "Create mandate"}
          </button>
          {mandate?.state === "revoked" && <p className="muted small">Previous mandate revoked.</p>}
          {error && <p className="error">{error}</p>}
        </div>
      ) : (
        <div className="mandate-card">
          <div className="mandate-code-row">
            <code className="mandate-code">{mandate.code}</code>
            <button
              className="copy-number"
              onClick={() => {
                navigator.clipboard?.writeText(mandate.code);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              <span className="copy-hint">{copied ? "Copied ✓" : "Copy"}</span>
            </button>
          </div>
          <dl className="mandate-facts">
            <div>
              <dt>Remaining</dt>
              <dd>
                {fmt(mandate.remaining)} <span className="muted">of {fmt(mandate.max_amount)}</span>
              </dd>
            </div>
            <div>
              <dt>State</dt>
              <dd>{mandate.state}</dd>
            </div>
            <div>
              <dt>Expires</dt>
              <dd>{new Date(mandate.expires_at).toLocaleTimeString()}</dd>
            </div>
            <div>
              <dt>Cards</dt>
              <dd>{mandate.card_count} test cards</dd>
            </div>
          </dl>
          <div className="mandate-actions">
            <button className="secondary" onClick={refresh}>
              Refresh
            </button>
            <button className="cancel-order" disabled={busy} onClick={revoke}>
              Revoke mandate
            </button>
          </div>

          <h3>Hand it to your agent</h3>
          <p className="muted small">Add the store's MCP server to Claude or Cursor:</p>
          <pre className="mandate-snippet">{`{
  "mcpServers": {
    "split-checkout": { "type": "http", "url": "${mcpUrl}" }
  }
}`}</pre>
          <p className="muted small">Then say something like:</p>
          <pre className="mandate-snippet">
            {`Using mandate ${mandate.code}, find the best-rated grinder under $500\nand buy it. Check the remaining budget afterwards.`}
          </pre>
        </div>
      )}
    </div>
  );
}
