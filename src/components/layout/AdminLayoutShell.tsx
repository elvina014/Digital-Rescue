"use client";

import { useState, useCallback } from "react";
import type { EmployeeRole } from "@/types";
import { AdminSidebar } from "./AdminSidebar";
import { MyPageModal } from "./MyPageModal";

interface MyPageData {
  id: string;
  name: string;
  role: EmployeeRole;
  phone: string | null;
  email: string;
}

interface AdminLayoutShellProps {
  employeeName: string;
  employeeRole: EmployeeRole;
  logoutButton: React.ReactNode;
  myPageData: MyPageData;
  children: React.ReactNode;
}

export function AdminLayoutShell({
  employeeName,
  employeeRole,
  logoutButton,
  myPageData,
  children,
}: AdminLayoutShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [myPageOpen, setMyPageOpen] = useState(false);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* 데스크탑 사이드바 (md 이상) */}
      <div className="hidden md:flex">
        <AdminSidebar employeeName={employeeName} employeeRole={employeeRole} />
      </div>

      {/* 모바일 드로어 오버레이 */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={closeDrawer}
        />
      )}

      {/* 모바일 슬라이드 드로어 */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-60 transform transition-transform duration-300 ease-in-out md:hidden ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <AdminSidebar
          employeeName={employeeName}
          employeeRole={employeeRole}
          onLinkClick={closeDrawer}
        />
      </div>

      {/* 메인 영역 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* 헤더 */}
        <header className="flex items-center justify-between border-b bg-white px-4 py-3 md:px-6">
          {/* 모바일 햄버거 */}
          <button
            type="button"
            className="rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 md:hidden"
            onClick={() => setDrawerOpen(true)}
            aria-label="메뉴 열기"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>

          {/* 모바일 타이틀 */}
          <span className="text-sm font-semibold text-gray-900 md:hidden">
            디지털레스큐
          </span>

          {/* 데스크탑 빈 공간 */}
          <div className="hidden md:block" />

          {/* 헤더 우측: 내 정보 + 로그아웃 */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMyPageOpen(true)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600
                         transition-colors hover:bg-gray-100"
            >
              내 정보
            </button>
            {logoutButton}
          </div>
        </header>

        {/* 콘텐츠 */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>

      {/* 마이페이지 모달 */}
      <MyPageModal
        open={myPageOpen}
        onClose={() => setMyPageOpen(false)}
        employee={myPageData}
      />
    </div>
  );
}
