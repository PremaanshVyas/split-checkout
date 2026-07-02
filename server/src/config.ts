const required = ["AIRWALLEX_CLIENT_ID", "AIRWALLEX_API_KEY"] as const;

export interface Config {
  airwallexClientId: string;
  airwallexApiKey: string;
  airwallexBaseUrl: string;
  airwallexWebhookSecret: string | undefined;
  port: number;
}

export function loadConfig(): Config {
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing environment variables: ${missing.join(", ")}. ` +
        `Copy .env.example to .env and fill in your Airwallex sandbox credentials ` +
        `(https://demo.airwallex.com → Settings → Developer → API keys).`,
    );
  }
  return {
    airwallexClientId: process.env.AIRWALLEX_CLIENT_ID!,
    airwallexApiKey: process.env.AIRWALLEX_API_KEY!,
    airwallexBaseUrl: process.env.AIRWALLEX_BASE_URL ?? "https://api-demo.airwallex.com",
    airwallexWebhookSecret: process.env.AIRWALLEX_WEBHOOK_SECRET || undefined,
    port: Number(process.env.PORT ?? 3001),
  };
}
