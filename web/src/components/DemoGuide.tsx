import { useState } from "react";

interface TestCard {
  label: string;
  number: string;
  note: string;
}

const TEST_CARDS: TestCard[] = [
  {
    label: "Successful payment",
    number: "4035 5010 0000 0008",
    note: "Authorizes and captures normally.",
  },
  {
    label: "Card that always declines",
    number: "4646 4646 4646 4644",
    note: "Use it on either step to see the safe-failure path — the other card is never charged, and you can retry with a different card.",
  },
  {
    label: "Bank verification (3D Secure)",
    number: "4012 0003 0000 0088",
    note: "A verification window opens, like a real bank check. Enter code 1234 to approve.",
  },
  {
    label: "Insufficient funds",
    number: "5307 8373 6054 4518",
    note: "Choose the “Insufficient funds demo” split first — this card is declined for insufficient funds on the $80.51 amount. Enter 1234 if a verification window appears.",
  },
];

function CopyableNumber({ number }: { number: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="copy-number"
      title="Copy card number"
      onClick={() => {
        navigator.clipboard?.writeText(number.replace(/\s/g, ""));
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      <code>{number}</code>
      <span className="copy-hint">{copied ? "Copied ✓" : "Copy"}</span>
    </button>
  );
}

/**
 * Plain-language guide to driving the demo. This is a sandbox store:
 * only Airwallex's published test cards work here.
 */
export function DemoGuide() {
  return (
    <div className="demo-guide">
      <h3>Demo guide</h3>
      <p className="muted small">
        This store runs on Airwallex's test environment — no real money ever moves. Pay with the
        test cards below. For every card, use <strong>any future expiry</strong> (e.g. 12/30) and{" "}
        <strong>any 3-digit CVC</strong> (e.g. 123).
      </p>
      <ul className="test-card-list">
        {TEST_CARDS.map((card) => (
          <li key={card.number}>
            <strong>{card.label}</strong>
            <CopyableNumber number={card.number} />
            <span className="muted small">{card.note}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
