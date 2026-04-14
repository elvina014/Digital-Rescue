import type { EmployeeRole } from "@/types";

const ROLE_STYLES: Record<
  EmployeeRole,
  { label: string; className: string }
> = {
  ADMIN: {
    label: "관리자",
    className: "bg-red-100 text-red-700 ring-red-600/20",
  },
  MANAGER: {
    label: "팀장",
    className: "bg-purple-100 text-purple-700 ring-purple-600/20",
  },
  RECEPTION: {
    label: "접수처",
    className: "bg-green-100 text-green-700 ring-green-600/20",
  },
  TECHNICIAN: {
    label: "담당기사",
    className: "bg-blue-100 text-blue-700 ring-blue-600/20",
  },
  EXPERT_REPAIR: {
    label: "정밀수리팀",
    className: "bg-orange-100 text-orange-700 ring-orange-600/20",
  },
  CS: {
    label: "고객서비스",
    className: "bg-slate-100 text-slate-700 ring-slate-600/20",
  },
};

interface RoleBadgeProps {
  role: EmployeeRole;
}

export function RoleBadge({ role }: RoleBadgeProps) {
  const style = ROLE_STYLES[role] ?? {
    label: role,
    className: "bg-gray-100 text-gray-700 ring-gray-600/20",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${style.className}`}
    >
      {style.label}
    </span>
  );
}
