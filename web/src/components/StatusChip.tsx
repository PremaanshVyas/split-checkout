import type { SlotStatus } from "../types";

const CHIP: Record<SlotStatus, { label: string; className: string }> = {
  created: { label: "Awaiting card", className: "chip chip-pending" },
  authorized: { label: "Held ✓ — not charged", className: "chip chip-held" },
  captured: { label: "Captured ✓", className: "chip chip-captured" },
  failed: { label: "Failed ✕", className: "chip chip-declined" },
  cancelled: { label: "Cancelled", className: "chip chip-pending" },
};

export function StatusChip({ status, declined }: { status: SlotStatus; declined?: boolean }) {
  if (status === "created" && declined) {
    return <span className="chip chip-declined">Declined ✕ — retry below</span>;
  }
  const { label, className } = CHIP[status];
  return <span className={className}>{label}</span>;
}
