"use client";

import { useRef, useState } from "react";
import { useOptimisticList } from "@/app/(admin)/tickets/[id]/repair-record/useOptimisticList";
import { deleteDonorPhotoAction, uploadDonorPhotoAction } from "../actions";

interface Photo {
  id: string;
  url: string | null;
  description: string | null;
}

/** Donor 사진 (비공개 버킷, 서명 URL 1시간) — 등록: 관리자/팀장/기사, 삭제: 관리자/팀장 */
export default function DonorPhotos({ donorId, photos, canDelete }: { donorId: string; photos: Photo[]; canDelete: boolean }) {
  const list = useOptimisticList(photos);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setUploadError(null);
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("donorId", donorId);
      fd.append("file", file);
      const res = await uploadDonorPhotoAction(fd);
      if (res.error) {
        setUploadError(res.error);
        break;
      }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-base font-semibold text-gray-900">사진</h2>
        <span className="text-xs text-gray-400">{list.items.length} / 12</span>
        <label className="ml-auto cursor-pointer rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
          {uploading ? "업로드 중…" : "사진 추가"}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            multiple
            disabled={uploading}
            onChange={(e) => upload(e.target.files)}
            className="hidden"
          />
        </label>
      </div>
      {(uploadError || list.error) && <p className="mb-2 rounded bg-red-50 p-2 text-xs text-red-700">{uploadError ?? list.error}</p>}
      {list.items.length === 0 ? (
        <p className="text-sm text-gray-500">등록된 사진이 없습니다.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {list.items.map((p) => (
            <li key={p.id} className="relative overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
              {p.url ? (
                <a href={p.url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element -- 서명 URL(만료) 이미지 */}
                  <img src={p.url} alt={p.description ?? "Donor 사진"} className="aspect-square w-full object-cover" />
                </a>
              ) : (
                <div className="flex aspect-square items-center justify-center text-xs text-gray-400">불러올 수 없음</div>
              )}
              {canDelete && (
                <button
                  type="button"
                  disabled={list.pending}
                  onClick={() => list.run((l) => l.filter((x) => x.id !== p.id), () => deleteDonorPhotoAction(donorId, p.id))}
                  className="absolute right-1 top-1 rounded bg-white/90 px-1.5 py-0.5 text-xs text-red-600 hover:bg-white"
                >
                  삭제
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
