"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { EmployeeRole } from "@/types";

interface NavItem {
  label: string;
  href: string;
  /** 이 메뉴를 볼 수 있는 직급 목록. 비어있으면 모든 직급에 표시 */
  roles: EmployeeRole[];
}

/** 직급 한글 매핑 */
const ROLE_LABEL: Record<EmployeeRole, string> = {
  ADMIN: "관리자",
  MANAGER: "팀장",
  RECEPTION: "접수처",
  TECHNICIAN: "담당기사",
  EXPERT_REPAIR: "정밀수리팀",
  CS: "고객서비스",
};

/**
 * 사이드바 메뉴 정의
 * roles가 빈 배열이면 모든 직급에 표시
 * 02_roles_permissions.md 기반 접근 권한 분기
 */
const NAV_ITEMS: NavItem[] = [
  {
    label: "대시보드",
    href: "/dashboard",
    roles: [],
  },
  {
    label: "신규 접수",
    href: "/tickets/new",
    roles: ["ADMIN", "MANAGER", "RECEPTION"] as EmployeeRole[],
  },
  {
    label: "접수건 목록",
    href: "/tickets",
    roles: [],
  },
  {
    label: "재고 관리",
    href: "/inventory",
    roles: ["ADMIN", "MANAGER", "TECHNICIAN", "EXPERT_REPAIR"] as EmployeeRole[],
  },
  {
    label: "직원 관리",
    href: "/employees",
    roles: ["ADMIN"] as EmployeeRole[],
  },
  {
    label: "통계",
    href: "/stats",
    roles: ["ADMIN", "MANAGER"] as EmployeeRole[],
  },
];

interface AdminSidebarProps {
  employeeName: string;
  employeeRole: EmployeeRole;
}

export function AdminSidebar({ employeeName, employeeRole }: AdminSidebarProps) {
  const pathname = usePathname();

  // 현재 직급에 맞는 메뉴만 필터링
  const visibleItems = NAV_ITEMS.filter(
    (item) => item.roles.length === 0 || item.roles.includes(employeeRole)
  );

  return (
    <aside className="flex w-60 flex-col border-r bg-white">
      {/* 브랜딩 영역 */}
      <div className="border-b px-5 py-5">
        <Link href="/dashboard" className="text-lg font-bold text-gray-900">
          디지털레스큐
        </Link>
        <p className="mt-0.5 text-xs text-gray-400">관리자 포털</p>
      </div>

      {/* 네비게이션 메뉴 */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {visibleItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* 사용자 정보 */}
      <div className="border-t px-4 py-4">
        <p className="truncate text-sm font-medium text-gray-900">
          {employeeName}
        </p>
        <p className="mt-0.5 text-xs text-gray-500">
          {ROLE_LABEL[employeeRole] ?? employeeRole}
        </p>
      </div>
    </aside>
  );
}
