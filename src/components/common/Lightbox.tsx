"use client";

import { useEffect, useCallback } from "react";
import type { TicketImage } from "@/lib/imageUpload";

interface LightboxProps {
  images: TicketImage[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

function formatLightboxDate(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

/**
 * 전체 화면 이미지 뷰어 (라이트박스)
 * ESC / 배경 클릭으로 닫기, 좌우 화살표로 이동
 * 하단에 메타데이터 표시 (설명, 업로더, 날짜)
 */
export default function Lightbox({
  images,
  currentIndex,
  onClose,
  onNavigate,
}: LightboxProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && currentIndex > 0) onNavigate(currentIndex - 1);
      if (e.key === "ArrowRight" && currentIndex < images.length - 1)
        onNavigate(currentIndex + 1);
    },
    [currentIndex, images.length, onClose, onNavigate]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown]);

  if (!images[currentIndex]) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      {/* 닫기 버튼 */}
      <button
        onClick={onClose}
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition-colors hover:bg-white/30"
      >
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* 이전 */}
      {currentIndex > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(currentIndex - 1);
          }}
          className="absolute left-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition-colors hover:bg-white/30"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {/* 이미지 + 메타데이터 */}
      <div
        className="flex max-h-[90vh] max-w-[90vw] flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={images[currentIndex].url}
          alt={`이미지 ${currentIndex + 1}`}
          className="max-h-[75vh] max-w-[90vw] rounded-t-lg object-contain"
        />
        {/* 메타데이터 패널 */}
        <div className="w-full rounded-b-lg bg-black/60 px-4 py-3 backdrop-blur-sm">
          {images[currentIndex].description && (
            <p className="text-sm text-white">{images[currentIndex].description}</p>
          )}
          {!images[currentIndex].is_customer && (
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-300">
              {images[currentIndex].uploader_name && (
                <span>업로드: {images[currentIndex].uploader_name}</span>
              )}
              {images[currentIndex].uploaded_at && (
                <span>{formatLightboxDate(images[currentIndex].uploaded_at)}</span>
              )}
            </div>
          )}
          {images[currentIndex].is_customer && images[currentIndex].uploaded_at && (
            <div className="mt-1 text-xs text-gray-300">
              <span>고객 업로드 · {formatLightboxDate(images[currentIndex].uploaded_at)}</span>
            </div>
          )}
        </div>
      </div>

      {/* 다음 */}
      {currentIndex < images.length - 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(currentIndex + 1);
          }}
          className="absolute right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition-colors hover:bg-white/30 top-1/2 -translate-y-1/2"
          style={{ right: "1rem" }}
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* 카운터 */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/20 px-4 py-1 text-sm text-white backdrop-blur-sm">
        {currentIndex + 1} / {images.length}
      </div>
    </div>
  );
}
