import { createAdminClient } from "@/utils/supabase/admin";
import type { NextRequest } from "next/server";

// ─── 타입 정의 ───

interface WebhookBody {
  partName?: string;
  category?: string;
  specName?: string;
  specs?: Record<string, unknown>;
  condition?: string;
  capacity?: string;
  quantity?: number;
  imageUrl?: string;
  apiKey?: string;
}

const VALID_CATEGORIES = [
  "CPU", "RAM", "SSD", "HDD", "DISPLAY",
  "BATTERY", "KEYBOARD", "MAINBOARD", "POWER", "LAPTOP", "ETC",
] as const;

const VALID_CONDITIONS = ["NEW", "USED"] as const;

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

  const apiKey = request.headers.get("x-api-key") ?? body.apiKey;
  if (!apiKey || apiKey !== webhookKey) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2) 입력 유효성 검사
  const partName = body.partName?.trim();
  if (!partName) {
    return Response.json({ error: "partName is required" }, { status: 400 });
  }

  const category = body.category?.toUpperCase();
  if (!category || !VALID_CATEGORIES.includes(category as typeof VALID_CATEGORIES[number])) {
    return Response.json(
      { error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}` },
      { status: 400 }
    );
  }

  const condition = body.condition?.toUpperCase() ?? "NEW";
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

  const capacity = body.capacity?.trim() || null;
  // n8n이 specName을 명시하지 않으면 "기본" 사용
  const specName = body.specName?.trim() || "기본";
  const imageUrl = body.imageUrl?.trim() || null;

  // 3) DB 처리 — service role 사용 (외부 webhook)
  const supabase = createAdminClient();

  // 3-1. 카테고리 조회 또는 생성
  const catResult = await supabase
    .from("inventory_categories")
    .select("id")
    .eq("name", category)
    .maybeSingle();
  if (catResult.error) return Response.json({ error: `Category lookup failed: ${catResult.error.message}` }, { status: 500 });
  let cat = catResult.data;
  if (!cat) {
    const { data: newCat, error: newCatErr } = await supabase
      .from("inventory_categories")
      .insert({ name: category })
      .select("id")
      .single();
    if (newCatErr || !newCat) return Response.json({ error: `Category create failed: ${newCatErr?.message}` }, { status: 500 });
    cat = newCat;
  }

  // 3-2. 스펙 조회 또는 생성
  const specResult = await supabase
    .from("inventory_specs")
    .select("id")
    .eq("category_id", cat.id)
    .eq("name", specName)
    .maybeSingle();
  if (specResult.error) return Response.json({ error: `Spec lookup failed: ${specResult.error.message}` }, { status: 500 });
  let spec = specResult.data;
  if (!spec) {
    const { data: newSpec, error: newSpecErr } = await supabase
      .from("inventory_specs")
      .insert({ category_id: cat.id, name: specName })
      .select("id")
      .single();
    if (newSpecErr || !newSpec) return Response.json({ error: `Spec create failed: ${newSpecErr?.message}` }, { status: 500 });
    spec = newSpec;
  }

  // 3-3. 제품 조회 또는 생성
  const productResult = await supabase
    .from("inventory_products")
    .select("id")
    .eq("spec_id", spec.id)
    .eq("name", partName)
    .maybeSingle();
  if (productResult.error) return Response.json({ error: `Product lookup failed: ${productResult.error.message}` }, { status: 500 });
  let product = productResult.data;
  if (!product) {
    const { data: newProduct, error: newProductErr } = await supabase
      .from("inventory_products")
      .insert({ spec_id: spec.id, name: partName })
      .select("id")
      .single();
    if (newProductErr || !newProduct) return Response.json({ error: `Product create failed: ${newProductErr?.message}` }, { status: 500 });
    product = newProduct;
  }

  // 3-4. 재고 아이템 조회 (product_id + condition + capacity 조합으로 식별)
  let itemQuery = supabase
    .from("inventory_items")
    .select("id, quantity")
    .eq("product_id", product.id)
    .eq("condition", condition);
  if (capacity) {
    itemQuery = itemQuery.eq("capacity", capacity);
  } else {
    itemQuery = itemQuery.is("capacity", null);
  }
  const { data: existing, error: searchError } = await itemQuery.maybeSingle();
  if (searchError) return Response.json({ error: `Item lookup failed: ${searchError.message}` }, { status: 500 });

  const systemNotes = [
    "[n8n AI 분석]",
    body.specs ? `specs: ${JSON.stringify(body.specs)}` : null,
    imageUrl ? `imageUrl: ${imageUrl}` : null,
  ].filter(Boolean).join(" | ");

  // 트랜잭션 기록용 admin 계정 조회
  const { data: adminUser } = await supabase
    .from("employees")
    .select("id")
    .eq("role", "ADMIN")
    .limit(1)
    .single();

  if (existing) {
    // ── 기존 품목 수량 업데이트 ──
    const newQuantity = existing.quantity + quantity;
    const { error: updateError } = await supabase
      .from("inventory_items")
      .update({ quantity: newQuantity })
      .eq("id", existing.id);
    if (updateError) return Response.json({ error: `Update failed: ${updateError.message}` }, { status: 500 });

    if (adminUser) {
      await supabase.from("inventory_transactions").insert({
        item_id: existing.id,
        user_id: adminUser.id,
        transaction_type: "INBOUND",
        quantity_changed: quantity,
        notes: systemNotes,
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
        category_id: cat.id,
        spec_id: spec.id,
        product_id: product.id,
        capacity,
        condition,
        quantity,
        base_estimate: 0,
      })
      .select("id")
      .single();
    if (insertError || !inserted) return Response.json({ error: `Insert failed: ${insertError?.message}` }, { status: 500 });

    if (adminUser) {
      await supabase.from("inventory_transactions").insert({
        item_id: inserted.id,
        user_id: adminUser.id,
        transaction_type: "INBOUND",
        quantity_changed: quantity,
        notes: systemNotes,
      });
    }

    return Response.json({ action: "created", itemId: inserted.id, quantity });
  }
}
