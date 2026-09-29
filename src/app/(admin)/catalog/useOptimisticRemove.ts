"use client";

import { useState } from "react";

/**
 * 목록 항목 삭제용 낙관적 업데이트: 먼저 숨기고, 서버 오류면 다시 보이게 하고 메시지를 돌려준다.
 * 성공하면 revalidatePath로 새 props가 내려와 항목이 실제로 사라진다.
 */
export function useOptimisticRemove() {
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  async function remove(id: string, action: () => Promise<{ error?: string }>): Promise<string | null> {
    setHidden((prev) => new Set(prev).add(id));
    const res = await action();
    if (res.error) {
      setHidden((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      return res.error;
    }
    return null;
  }

  return { isHidden: (id: string) => hidden.has(id), remove };
}
