"use client";

import { useEffect, useLayoutEffect, useCallback, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, X, ZoomIn, ZoomOut } from "lucide-react";
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
  const [actualSize, setActualSize] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [imageSizes, setImageSizes] = useState<Record<number, { width: number; height: number }>>({});

  // Embla 초기화: 드래그/스와이프 활성화
  const [emblaRef, emblaApi] = useEmblaCarousel({
    startIndex: currentIndex,
    loop: false,
    dragFree: false,
    watchDrag: true,
  });

  // 슬라이드 변경 시 부모 상태 동기화
  // ref 갱신은 렌더 외부(layoutEffect)에서 수행해 React Compiler 규칙 준수
  const onSelectRef = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    onSelectRef.current = () => {
      if (!emblaApi) return;
      const selected = emblaApi.selectedScrollSnap();
      if (selected !== currentIndex) {
        setActualSize(false);
        setZoom(1);
        onNavigate(selected);
      }
    };
  });

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

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < images.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90"
      onClick={onClose}
    >
      {/* 닫기 버튼 */}
      <button
        onClick={onClose}
        aria-label="닫기"
        className="absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition-colors hover:bg-white/40"
      >
        <X className="h-6 w-6" />
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setActualSize((value) => {
            const next = !value;
            setZoom(1);
            return next;
          });
        }}
        aria-label={actualSize ? "화면에 맞게 보기" : "원본 크기로 보기"}
        className="absolute left-4 top-4 z-20 flex h-10 items-center gap-2 rounded-full bg-white/20 px-3 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/40"
      >
        {actualSize ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
        <span className="hidden sm:inline">{actualSize ? "화면 맞춤" : "원본 크기"}</span>
      </button>

      {actualSize && (
        <div
          className="absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full bg-white/20 p-1 text-white backdrop-blur-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => setZoom((value) => Math.max(0.5, Number((value - 0.25).toFixed(2))))}
            aria-label="축소"
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/20 disabled:opacity-40"
            disabled={zoom <= 0.5}
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="min-w-12 text-center text-xs font-medium tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((value) => Math.min(3, Number((value + 0.25).toFixed(2))))}
            aria-label="확대"
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/20 disabled:opacity-40"
            disabled={zoom >= 3}
          >
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 이전 버튼 (데스크탑 — md 이상에서 표시) */}
      <button
        onClick={(e) => { e.stopPropagation(); emblaApi?.scrollPrev(); }}
        aria-label="이전 이미지"
        disabled={!hasPrev}
        className="absolute left-4 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition-colors hover:bg-white/40 disabled:cursor-not-allowed disabled:opacity-20 md:flex"
      >
        <ChevronLeft className="h-6 w-6" />
      </button>

      {/* 다음 버튼 (데스크탑 — md 이상에서 표시) */}
      <button
        onClick={(e) => { e.stopPropagation(); emblaApi?.scrollNext(); }}
        aria-label="다음 이미지"
        disabled={!hasNext}
        className="absolute right-4 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition-colors hover:bg-white/40 disabled:cursor-not-allowed disabled:opacity-20 md:flex"
      >
        <ChevronRight className="h-6 w-6" />
      </button>

      {/* Embla 캐러셀 뷰포트 */}
      <div
        className="h-screen w-screen px-3 pb-16 pt-16 md:px-20"
        onClick={(e) => e.stopPropagation()}
      >
        <div ref={emblaRef} className="h-full overflow-hidden">
          <div className="flex h-full touch-pan-y">
            {images.map((img, idx) => (
              <div
                key={idx}
                className="flex h-full min-w-0 flex-[0_0_100%] flex-col items-center justify-center gap-3 overflow-hidden"
              >
                {/* 이미지 */}
                <div
                  className={`flex min-h-0 w-full flex-1 ${
                    actualSize
                      ? "items-start justify-start overflow-auto"
                      : "items-center justify-center overflow-hidden"
                  }`}
                >
                  <img
                    src={img.url}
                    alt={`이미지 ${idx + 1}`}
                    className={
                      actualSize
                        ? "h-auto w-auto max-h-none max-w-none rounded-lg select-none"
                        : "h-full w-full rounded-lg object-contain select-none"
                    }
                    style={
                      actualSize && imageSizes[idx]
                        ? {
                            width: imageSizes[idx].width * zoom,
                            height: imageSizes[idx].height * zoom,
                          }
                        : undefined
                    }
                    onLoad={(event) => {
                      const imgElement = event.currentTarget;
                      if (imageSizes[idx]) return;
                      setImageSizes((prev) => ({
                        ...prev,
                        [idx]: {
                          width: imgElement.naturalWidth,
                          height: imgElement.naturalHeight,
                        },
                      }));
                    }}
                    draggable={false}
                  />
                </div>
                {/* 메타데이터 패널 */}
                <div className="max-h-24 w-full max-w-5xl shrink-0 overflow-auto rounded-lg bg-black/60 px-4 py-3 backdrop-blur-sm">
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
