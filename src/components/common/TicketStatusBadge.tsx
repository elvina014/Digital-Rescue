import type { TicketStatus } from "@/types";

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
  RECEIVED: {
    label: "입고 완료",
    className: "bg-teal-100 text-teal-700",
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

const DISPOSAL_LABEL: Record<string, string> = {
  RETURN: "취소 - 기기 반환",
  DISPOSE: "취소 - 기기 폐기",
};

interface TicketStatusBadgeProps {
  status: TicketStatus;
  cancelDisposal?: string | null;
  /**
   * 입고 완료 시각. 전달 시 CANCELED 상태를 '입고전취소'/'입고후취소'로 구분 표시한다.
   * 미전달(undefined) 시 기존 '취소' 라벨을 유지한다.
   */
  receivedAt?: string | null;
}

export function TicketStatusBadge({ status, cancelDisposal, receivedAt }: TicketStatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    className: "bg-gray-100 text-gray-600",
  };

  // CANCELED + receivedAt 전달(옵트인) 시 입고 전/후 취소를 라벨·배경색으로 구분
  if (status === "CANCELED" && receivedAt !== undefined && !cancelDisposal) {
    const isPostReceipt = receivedAt !== null;
    return (
      <span
        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
          isPostReceipt ? "bg-rose-100 text-rose-700" : "bg-gray-100 text-gray-600"
        }`}
      >
        {isPostReceipt ? "입고후취소" : "입고전취소"}
      </span>
    );
  }

  const label =
    status === "CANCELED" && cancelDisposal
      ? (DISPOSAL_LABEL[cancelDisposal] ?? config.label)
      : config.label;

  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${config.className}`}
    >
      {label}
    </span>
  );
}
