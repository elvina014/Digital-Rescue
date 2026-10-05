import type { DeviceTypeValue } from "../actions";

export interface ModelRow {
  id: string;
  name: string;
  brand: string;
  deviceType: DeviceTypeValue | null;
  releaseYear: number | null;
  notes: string | null;
  needsReview: boolean;
  ticketCount: number;
  variants: { id: string; name: string }[];
  aliases: { id: string; alias: string; source: string; variantId: string | null }[];
  boards: { id: string; variantId: string | null; boardId: string; boardNumber: string }[];
}
