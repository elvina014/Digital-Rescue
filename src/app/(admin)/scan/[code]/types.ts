/** label_lookup(jsonb) 결과 타입 — 가격·고객 정보 없음, 이력은 관리자·팀장에게만 채워진다 */

export interface LookupItem {
  id: string;
  label_code: string;
  category: string;
  spec: string;
  product: string;
  capacity: string | null;
  condition: string;
  quantity: number;
  part_spec: string | null;
  location: string | null;
  is_outsourced: boolean;
  created_at: string;
}

export interface LookupHistory {
  created_at: string;
  type: string;
  quantity: number;
  notes: string | null;
  employee: string | null;
  receipt_no: string | null;
  ticket_id: string | null;
}

export interface LookupDonor {
  id: string;
  donor_no: string;
  status: string;
  device_type: string;
  brand: string;
  model_text: string | null;
  catalog_model_label: string | null;
  board_number: string | null;
  location: string | null;
  storage_note: string | null;
  source_receipt_no: string;
  source_ticket_id: string;
  created_at: string;
}

export interface LookupCandidate {
  description: string;
  status: string;
  quantity: number;
  condition_estimate: string;
  part_spec: string | null;
  extracted_at: string | null;
  item_label_code: string | null;
}

export type LookupResult =
  | { kind: "ITEM"; item: LookupItem; history: LookupHistory[] | null }
  | { kind: "DONOR"; donor: LookupDonor; candidates: LookupCandidate[] }
  | { error: string };
