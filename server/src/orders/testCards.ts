/**
 * The agent-checkout endpoint accepts ONLY Airwallex's published sandbox
 * test cards. This is the hard gate that keeps a demo endpoint that
 * handles raw card numbers safe: no real PAN can ever pass it.
 * Source: airwallex.com/docs test-card-numbers.
 */
const PUBLISHED_TEST_PANS = new Set([
  // always succeed
  "4035501000000008",
  "2223000048410010",
  "5354563134257854",
  "370636803809394",
  "3569599999097585",
  "6580070000000008",
  "3600070000000001",
  "6250941006528599",
  "6252470144444939",
  // 3DS flows (server-side confirm will surface REQUIRES_CUSTOMER_ACTION)
  "4012000300000005",
  "4012000300000088",
  "4012000300000013",
  "4012000300000070",
  // declines
  "5307837360544518",
  "2223000010181375",
  "4012000300001003",
  "370353687686779",
  "4646464646464644",
]);

/** Friendly aliases so an agent never needs to know raw PANs. */
export const TEST_CARD_ALIASES: Record<string, string> = {
  success: "4035501000000008",
  success_mastercard: "5354563134257854",
  decline: "4646464646464644",
  insufficient_funds: "5307837360544518",
  "3ds_challenge": "4012000300000088",
};

export function resolveTestCard(input: string): string | null {
  const alias = TEST_CARD_ALIASES[input.toLowerCase().trim()];
  if (alias) return alias;
  const pan = input.replace(/\s/g, "");
  return PUBLISHED_TEST_PANS.has(pan) ? pan : null;
}
