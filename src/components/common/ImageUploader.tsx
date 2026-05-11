"use client";

import { useRef, useState, useCallback } from "react";
import { validateImageFiles } from "@/lib/imageUpload";

interface ImageUploaderProps {
  /** 업로드 버튼 클릭 시 호출 — file과 description을 전달 */
  onUpload: (file: File, description: string) => Promise<void>;
  /** 업로드 가능 여부 (최대 수 초과 등) */
  disabled?: boolean;
  /** 안내 문구 (옵션) */
  label?: string;
  /** 업로드 진행 중 여부 (부모에서 제어) */
  uploading?: boolean;
}

/**
 * 1장씩 업로드하는 이미지 업로더
 * 이미지 선택 → 미리보기 + 설명 입력 → [업로드] 클릭 시 콜백 호출
 */
export default function ImageUploader({
  onUpload,
  disabled,
  label,
  uploading,
}: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [description, setDescription] = useState("");

  const selectFile = useCallback(
    (file: File) => {
      setError(null);
      const validationError = validateImageFiles([file]);
      if (validationError) {
        setError(validationError);
        return;
      }
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setDescription("");
    },
    []
  );

  const clearSelection = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl(null);
    setDescription("");
    setError(null);
  }, [previewUrl]);

  const handleUploadClick = useCallback(async () => {
    if (!selectedFile) return;
    await onUpload(selectedFile, description);
    clearSelection();
  }, [selectedFile, description, onUpload, clearSelection]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith("image/")
      );
      if (files.length > 0) selectFile(files[0]);
    },
    [selectFile]
  );

  return (
    <div className="space-y-3">
      {label && (
        <p className="text-sm font-medium text-gray-700">{label}</p>
      )}

      {/* 이미지 미선택 상태: 드래그 앤 드롭 영역 */}
      {!selectedFile && !disabled && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 transition-colors ${
            dragOver
              ? "border-blue-500 bg-blue-50"
              : "border-gray-300 bg-gray-50 hover:border-gray-400"
          }`}
        >
          <svg
            className="mb-2 h-8 w-8 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
            />
          </svg>
          <p className="text-sm text-gray-500">
            클릭하거나 이미지를 여기에 드래그하세요
          </p>
          <p className="mt-1 text-xs text-gray-400">
            JPG, PNG, WebP · 1장씩 업로드 · 각 20MB 이하 · WebP 변환
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) selectFile(file);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {disabled && !selectedFile && (
        <p className="text-xs text-gray-400">최대 업로드 수에 도달했습니다.</p>
      )}

      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}

      {/* 이미지 선택 후: 미리보기 + 설명 입력 + 업로드/취소 */}
      {selectedFile && previewUrl && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
          <div className="flex gap-4">
            <img
              src={previewUrl}
              alt="미리보기"
              className="h-28 w-28 shrink-0 rounded-lg border border-gray-200 object-cover"
            />
            <div className="flex-1 space-y-2">
              <p className="text-xs text-gray-500 truncate">{selectedFile.name}</p>
              <div>
                <label htmlFor="img-desc" className="mb-1 block text-xs font-medium text-gray-600">
                  이미지 설명 (메모)
                </label>
                <input
                  id="img-desc"
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="예: 액정 파손 부위, 뒷면 손상 등"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={clearSelection}
              disabled={uploading}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleUploadClick}
              disabled={uploading}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {uploading ? "업로드 중..." : "업로드"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
