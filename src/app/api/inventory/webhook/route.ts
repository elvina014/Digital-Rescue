import { createAdminClient } from "@/utils/supabase/admin";
import type { NextRequest } from "next/server";

// ─── 타입 정의 ───

interface WebhookBody {
  partName?: string;
  category?: string;
  specs?: Record<string, unknown>;
  condition?: string;
  quantity?: number;
  imageUrl?: string;
  apiKey?: string;
}

const VALID_CATEGORIES = [
  "CPU", "RAM", "SSD", "HDD", "DISPLAY",
  "BATTERY", "KEYBOARD", "MAINBOARD", "POWER", "LAPTOP", "ETC",
] as const;

const VALID_CONDITIONS = ["NEW", "USED", "EXTRACTED"] as const;

// ─── POST: n8n → 재고 등록/업데이트 ───

export async function POST(request: NextRequest) {
  // 1) API Key 인증
  const webhookKey = process.env.INVENTORY_WEBHOOK_API_KEY;
  if (!webhookKey) {
    return Response.json(
      { error: "Server misconfiguration: webhook key not set" },
      { status: 500 }
    );
  }

  let body: WebhookBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // 헤더 또는 바디에서 apiKey 추출
  const apiKey =
    request.headers.get("x-api-key") ?? body.apiKey;

  if (!apiKey || apiKey !== webhookKey) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2) 입력 유효성 검사
  const partName = body.partName?.trim();
  if (!partName) {
    return Response.json(
      { error: "partName is required" },
      { status: 400 }
    );
  }

  const category = body.category?.toUpperCase();
  if (!category || !VALID_CATEGORIES.includes(category as typeof VALID_CATEGORIES[number])) {
    return Response.json(
      { error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}` },
      { status: 400 }
    );
  }

  const condition = (body.condition?.toUpperCase() ?? "NEW");
  if (!VALID_CONDITIONS.includes(condition as typeof VALID_CONDITIONS[number])) {
    return Response.json(
      { error: `Invalid condition. Must be one of: ${VALID_CONDITIONS.join(", ")}` },
      { status: 400 }
    );
  }

  const quantity = body.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return Response.json(
      { error: "quantity must be a positive integer" },
      { status: 400 }
    );
  }

  const imageUrl = body.imageUrl?.trim() || null;

  // 3) DB 처리 (RLS 우회 — 외부 webhook이므로 service role 사용)
  const supabase = createAdminClient();

  // 기존 동일 품목 검색 (이름 + 카테고리 + 상태 일치)
  const { data: existing, error: searchError } = await supabase
    .from("inventory_items")
    .select("id, quantity")
    .eq("name", partName)
    .eq("category", category)
    .eq("condition", condition)
    .maybeSingle();

  if (searchError) {
    return Response.json(
      { error: `DB search failed: ${searchError.message}` },
      { status: 500 }
    );
  }

  // n8n webhook 전용 시스템 유저 ID (트랜잭션 기록용)
  // employees 테이블에 시스템 계정이 없으므로 notes에 출처를 기록
  const systemNotes = body.specs
    ? `[n8n AI 분석] specs: ${JSON.stringify(body.specs)}`
    : "[n8n AI 분석]";

  if (existing) {
    // ── 기존 품목 수량 업데이트 ──
    const newQuantity = existing.quantity + quantity;

    const { error: updateError } = await supabase
      .from("inventory_items")
      .update({ quantity: newQuantity })
      .eq("id", existing.id);

    if (updateError) {
      return Response.json(
        { error: `Update failed: ${updateError.message}` },
        { status: 500 }
      );
    }

    // INBOUND 트랜잭션 기록 (user_id 없이 — RPC 또는 nullable 필요)
    // service role이므로 RLS 우회. user_id는 첫 번째 ADMIN 사용
    const { data: adminUser } = await supabase
      .from("employees")
      .select("id")
      .eq("role", "ADMIN")
      .limit(1)
      .single();

    if (adminUser) {
      await supabase.from("inventory_transactions").insert({
        item_id: existing.id,
        user_id: adminUser.id,
        transaction_type: "INBOUND",
        quantity_changed: quantity,
        notes: systemNotes,
        image_url: imageUrl,
      });
    }

    return Response.json({
      action: "updated",
      itemId: existing.id,
      previousQuantity: existing.quantity,
      addedQuantity: quantity,
      newQuantity,
    });
  } else {
    // ── 신규 품목 등록 ──
    const { data: inserted, error: insertError } = await supabase
      .from("inventory_items")
      .insert({
        name: partName,
        category,
        condition,
        quantity,
        unit_price: 0,
        location: null,
      })
      .select("id")
      .single();

    if (insertError) {
      return Response.json(
        { error: `Insert failed: ${insertError.message}` },
        { status: 500 }
      );
    }

    // INBOUND 트랜잭션 기록
    const { data: adminUser } = await supabase
      .from("employees")
      .select("id")
      .eq("role", "ADMIN")
      .limit(1)
      .single();

    if (adminUser) {
      await supabase.from("inventory_transactions").insert({
        item_id: inserted.id,
        user_id: adminUser.id,
        transaction_type: "INBOUND",
        quantity_changed: quantity,
        notes: systemNotes,
        image_url: imageUrl,
      });
    }

    return Response.json({
      action: "created",
      itemId: inserted.id,
      quantity,
    });
  }
}
