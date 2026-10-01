"use client";

import { useState } from "react";

/**
 * 목록 낙관적 업데이트: 화면을 먼저 바꾸고, 서버 오류면 원래 목록으로 되돌리고 메시지를 보여준다.
 * 성공하면 revalidatePath로 새 props가 내려와 서버 값으로 교체된다.
 */
export function useOptimisticList<T>(serverItems: T[]) {
  const [items, setItems] = useState(serverItems);
  const [synced, setSynced] = useState(serverItems);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (synced !== serverItems) {
    setSynced(serverItems);
    setItems(serverItems);
  }

  async function run(optimistic: (list: T[]) => T[], action: () => Promise<{ error?: string }>): Promise<boolean> {
    const snapshot = items;
    setError(null);
    setPending(true);
    setItems(optimistic(items));
    const res = await action();
    setPending(false);
    if (res.error) {
      setItems(snapshot);
      setError(res.error);
      return false;
    }
    return true;
  }

  return { items, error, pending, run };
}
