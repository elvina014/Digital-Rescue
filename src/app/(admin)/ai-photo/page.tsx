import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth";
import { AI_PHOTO_ROLES } from "./labels";
import PhotoRecognizeForm from "./PhotoRecognizeForm";

// 사진 인식(n8n → OpenRouter)은 수십 초 걸릴 수 있다 — 이 페이지의 서버 액션 제한 시간
export const maxDuration = 60;

/** AI 사진 인식 (Phase 9): 부품 라벨·칩 마킹 / 메인보드 번호 / 기기 라벨 사진 → 별칭 후보 (관리자 검토 대기) */
export default async function AiPhotoPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/login");
  if (!AI_PHOTO_ROLES.includes(employee.role)) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-xl font-bold text-gray-900">AI 사진 인식</h1>
      <p className="mb-4 text-sm text-gray-500">
        사진 속 품번·마킹·보드 번호·모델 번호를 AI가 읽어 <strong>별칭 후보</strong>로 올립니다.
        관리자가 기기 마스터 → AI 후보에서 승인해야 등록됩니다.
      </p>
      <PhotoRecognizeForm />
    </div>
  );
}
