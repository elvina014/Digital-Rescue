import type { Database } from "@/types/supabase";

export type SummaryRow = Database["public"]["Views"]["compatibility_summary"]["Row"];

export interface EvidenceRow {
  id: string;
  compatibilityId: string;
  kind: string;
  observedStatus: string;
  limitationNote: string | null;
  reference: string | null;
  note: string | null;
  receiptNo: string | null;
  createdByName: string;
  createdAt: string;
  retractedAt: string | null;
  retractReason: string | null;
}

export interface PartSpecRow {
  id: string;
  partType: string;
  name: string;
  manufacturer: string | null;
  compatTarget: "MODEL" | "BOARD";
  groupId: string | null;
  description: string | null;
  needsReview: boolean;
  aliases: { id: string; alias: string; aliasType: string }[];
  compat: SummaryRow[];
  evidence: EvidenceRow[];
}

export interface GroupOption {
  id: string;
  name: string;
}
