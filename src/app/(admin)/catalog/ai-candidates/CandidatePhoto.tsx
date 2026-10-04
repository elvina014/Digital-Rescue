"use client";

import { useState, useTransition } from "react";
import { deleteCandidatePhotoAction } from "./actions";

/**
 * 사진 인식 후보의 사진 (비공개 버킷, 10분 서명 URL).
 * 검토가 끝나면 자동으로 지워진다(D3). 자동 삭제가 실패해 남아 있으면 검토된 카드에서 다시 지울 수 있다.
 */
export default function CandidatePhoto({
  photoRequestId,
  photoUrl,
  reviewed,
}: {
  photoRequestId: string;
  photoUrl: string | null;
  reviewed: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!photoUrl) {
    return <p className="mt-2 text-xs text-gray-400">사진 없음{reviewed ? " (검토 후 삭제됨)" : ""}</p>;
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const res = await deleteCandidatePhotoAction(photoRequestId);
      if (res.error) setError(res.error);
    });
  }

  return (
    <div className="mt-2 flex items-end gap-3">
      <a href={photoUrl} target="_blank" rel="noopener noreferrer" title="원본 크기로 보기">
        {/* eslint-disable-next-line @next/next/no-img-element -- 서명 URL(만료) 이미지 */}
        <img src={photoUrl} alt="인식에 사용한 사진" className="h-32 w-auto rounded border border-gray-200 object-contain" />
      </a>
      {reviewed && (
        <button type="button" onClick={remove} disabled={pending}
          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50">
          {pending ? "삭제 중…" : "사진 삭제"}
        </button>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
