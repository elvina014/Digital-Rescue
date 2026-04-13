import type { TicketStatus } from "@/types";

/** 상태별 뱃지 스타일 및 한글 레이블 */
const STATUS_CONFIG: Record<
  TicketStatus,
  { label: string; className: string }
> = {
  NEW: {
    label: "신규 접수",
    className: "bg-blue-100 text-blue-700",
  },
  ASSIGNED: {
    label: "배정 완료",
    className: "bg-purple-100 text-purple-700",
  },
  IN_PROGRESS: {
    label: "수리 진행",
    className: "bg-yellow-100 text-yellow-800",
  },
  WAITING_APPROVAL: {
    label: "승인 대기",
    className: "bg-orange-100 text-orange-700",
  },
  COMPLETED: {
    label: "완료",
    className: "bg-green-100 text-green-700",
  },
  CANCELED: {
    label: "취소",
    className: "bg-gray-100 text-gray-600",
  },
};

interface TicketStatusBadgeProps {
  status: TicketStatus;
}

export function TicketStatusBadge({ status }: TicketStatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    className: "bg-gray-100 text-gray-600",
  };

  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${config.className}`}
    >
      {config.label}
    </span>
  );
}
