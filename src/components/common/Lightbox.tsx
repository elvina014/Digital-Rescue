"use client";

import { useEffect, useCallback, useRef } from "react";
import useEmblaCarousel from "embla-carousel-react";
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
 * Embla Carousel 기반 — 모바일 터치 스와이프 + 키보드 + 화살표 버튼 지원
 */
export default function Lightbox({
  images,
  currentIndex,
  onClose,
  onNavigate,
}: LightboxProps) {
  // Embla 초기화: 드래그/스와이프 활성화
  const [emblaRef, emblaApi] = useEmblaCarousel({
    startIndex: currentIndex,
    loop: false,
    dragFree: false,
    watchDrag: true,
  });

  // 슬라이드 변경 시 부모 상태 동기화
  const onSelectRef = useRef<(() => void) | null>(null);
  onSelectRef.current = () => {
    if (!emblaApi) return;
    const selected = emblaApi.selectedScrollSnap();
    if (selected !== currentIndex) onNavigate(selected);
  };

  useEffect(() => {
    if (!emblaApi) return;
    const handler = () => onSelectRef.current?.();
    emblaApi.on("select", handler);
    return () => { emblaApi.off("select", handler); };
  }, [emblaApi]);

  // 외부 currentIndex 변경 시 캐러셀도 이동
  useEffect(() => {
    if (!emblaApi) return;
    if (emblaApi.selectedScrollSnap() !== currentIndex) {
      emblaApi.scrollTo(currentIndex, false);
    }
  }, [emblaApi, currentIndex]);

  // 키보드 단축키
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") emblaApi?.scrollPrev();
      if (e.key === "ArrowRight") emblaApi?.scrollNext();
    },
    [onClose, emblaApi]
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

  const current = images[currentIndex];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < images.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85"
      onClick={onClose}
    >
      {/* 닫기 버튼 */}
      <button
        onClick={onClose}
        aria-label="닫기"
        className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition-colors hover:bg-white/40"
      >
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* 이전 버튼 (데스크탑 — md 이상에서 표시) */}
      <button
        onClick={(e) => { e.stopPropagation(); emblaApi?.scrollPrev(); }}
        aria-label="이전 이미지"
        disabled={!hasPrev}
        className="absolute left-4 top-1/2 z-10 hidden -translate-y-1/2 md:flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition-colors hover:bg-white/40 disabled:opacity-20 disabled:cursor-not-allowed"
      >
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* 다음 버튼 (데스크탑 — md 이상에서 표시) */}
      <button
        onClick={(e) => { e.stopPropagation(); emblaApi?.scrollNext(); }}
        aria-label="다음 이미지"
        disabled={!hasNext}
        className="absolute right-4 top-1/2 z-10 hidden -translate-y-1/2 md:flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition-colors hover:bg-white/40 disabled:opacity-20 disabled:cursor-not-allowed"
      >
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Embla 캐러셀 뷰포트 */}
      <div
        className="w-full max-w-4xl px-0 md:px-16"
        onClick={(e) => e.stopPropagation()}
      >
        <div ref={emblaRef} className="overflow-hidden">
          <div className="flex touch-pan-y">
            {images.map((img, idx) => (
              <div
                key={idx}
                className="min-w-0 flex-[0_0_100%] flex flex-col items-center"
              >
                {/* 이미지 */}
                <div className="flex items-center justify-center" style={{ maxHeight: "75vh" }}>
                  <img
                    src={img.url}
                    alt={`이미지 ${idx + 1}`}
                    className="max-h-[75vh] max-w-[92vw] md:max-w-[80vw] rounded-t-lg object-contain select-none"
                    draggable={false}
                  />
                </div>
                {/* 메타데이터 패널 */}
                <div className="w-full max-w-[92vw] md:max-w-[80vw] rounded-b-lg bg-black/60 px-4 py-3 backdrop-blur-sm">
                  {img.description && (
                    <p className="text-sm text-white">{img.description}</p>
                  )}
                  {!img.is_customer && (
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-300">
                      {img.uploader_name && <span>업로드: {img.uploader_name}</span>}
                      {img.uploaded_at && <span>{formatLightboxDate(img.uploaded_at)}</span>}
                    </div>
                  )}
                  {img.is_customer && img.uploaded_at && (
                    <p className="mt-1 text-xs text-gray-300">
                      고객 업로드 · {formatLightboxDate(img.uploaded_at)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 카운터 + 썸네일 인디케이터 */}
      <div
        className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 도트 인디케이터 */}
        {images.length > 1 && (
          <div className="flex gap-1.5">
            {images.map((_, idx) => (
              <button
                key={idx}
                onClick={() => { emblaApi?.scrollTo(idx); }}
                aria-label={`${idx + 1}번째 이미지로 이동`}
                className={`h-2 rounded-full transition-all duration-300 ${
                  idx === currentIndex
                    ? "w-6 bg-white"
                    : "w-2 bg-white/40 hover:bg-white/70"
                }`}
              />
            ))}
          </div>
        )}
        {/* 숫자 카운터 */}
        <div className="rounded-full bg-white/20 px-4 py-1 text-sm text-white backdrop-blur-sm">
          {currentIndex + 1} / {images.length}
        </div>
      </div>
    </div>
  );
}
