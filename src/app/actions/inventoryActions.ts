"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { EmployeeRole, ItemCondition } from "@/types";

// ─── 권한 상수 ───

const CAN_MANAGE: EmployeeRole[] = [
  EmployeeRole.ADMIN,
  EmployeeRole.MANAGER,
];

function requireAuth(employee: { role: EmployeeRole } | null) {
  if (!employee) return { error: "로그인이 필요합니다." } as const;
  return null;
}

function requireAdmin(employee: { role: EmployeeRole }) {
  if (employee.role !== EmployeeRole.ADMIN)
    return { error: "권한이 없습니다. (ADMIN만 가능)" } as const;
  return null;
}

function requireManager(employee: { role: EmployeeRole }) {
  if (!CAN_MANAGE.includes(employee.role))
    return { error: "권한이 없습니다. (ADMIN/MANAGER만 가능)" } as const;
  return null;
}

// =============================================
// 1. 카테고리 CRUD
// =============================================

export async function getCategories() {
  const employee = await getCurrentEmployee();
  const authErr = requireAuth(employee);
  if (authErr) return { ...authErr, data: [] };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_categories")
    .select("*")
    .order("name");

  if (error) return { error: error.message, data: [] };
  return { data: data ?? [] };
}

export async function addCategory(name: string) {
  const employee = await getCurrentEmployee();
  const authErr = requireAuth(employee);
  if (authErr) return authErr;
  const permErr = requireAdmin(employee!);
  if (permErr) return permErr;

  const trimmed = name.trim();
  if (!trimmed) return { error: "카테고리명을 입력해 주세요." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_categories")
    .insert({ name: trimmed })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/inventory");
  return { success: true, id: data.id as string };
}

export async function updateCategory(id: string, name: string) {
  const employee = await getCurrentEmployee();
  const authErr = requireAuth(employee);
  if (authErr) return authErr;
  const permErr = requireAdmin(employee!);
  if (permErr) return permErr;

  const trimmed = name.trim();
  if (!trimmed) return { error: "카테고리명을 입력해 주세요." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("inventory_categories")
    .update({ name: trimmed })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/inventory");
  return { success: true };
}

export async function deleteCategory(id: string) {
  const employee = await getCurrentEmployee();
  const authErr = requireAuth(employee);
  if (authErr) return authErr;
  const permErr = requireAdmin(employee!);
  if (permErr) return permErr;

  const supabase = await createClient();
  const { error } = await supabase
    .from("inventory_categories")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/inventory");
  return { success: true };
}

// =============================================
// 2. 스펙 CRUD
// =============================================

export async function getSpecs(categoryId?: string) {
  const employee = await getCurrentEmployee();
  const authErr = requireAuth(employee);
  if (authErr) return { ...authErr, data: [] };

  const supabase = await createClient();
  let query = supabase
    .from("inventory_specs")
    .select("*, inventory_categories(name)")
    .order("name");

  if (categoryId) {
    query = query.eq("category_id", categoryId);
  }

  const { data, error } = await query;

  if (error) return { error: error.message, data: [] };
  return { data: data ?? [] };
}

export async function addSpec(categoryId: string, name: string) {
  const employee = await getCurrentEmployee();
  const authErr = requireAuth(employee);
  if (authErr) return authErr;
  const permErr = requireAdmin(employee!);
  if (permErr) return permErr;

  const trimmed = name.trim();
  if (!trimmed) return { error: "스펙명을 입력해 주세요." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_specs")
    .insert({ category_id: categoryId, name: trimmed })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/inventory");
  return { success: true, id: data.id as string };
}

export async function updateSpec(id: string, name: string) {
  const employee = await getCurrentEmployee();
  const authErr = requireAuth(employee);
  if (authErr) return authErr;
  const permErr = requireAdmin(employee!);
  if (permErr) return permErr;

  const trimmed = name.trim();
  if (!trimmed) return { error: "스펙명을 입력해 주세요." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("inventory_specs")
    .update({ name: trimmed })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/inventory");
  return { success: true };
}

export async function deleteSpec(id: string) {
  const employee = await getCurrentEmployee();
  const authErr = requireAuth(employee);
  if (authErr) return authErr;
  const permErr = requireAdmin(employee!);
  if (permErr) return permErr;

  const supabase = await createClient();
  const { error } = await supabase
    .from("inventory_specs")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/inventory");
  return { success: true };
}

// =============================================
// 3. 제품 CRUD
// =============================================

export async function getProducts(specId?: string) {
  const employee = await getCurrentEmployee();
  const authErr = requireAuth(employee);
  if (authErr) return { ...authErr, data: [] };

  const supabase = await createClient();
  let query = supabase
    .from("inventory_products")
    .select("*, inventory_specs(name)")
    .order("name");

  if (specId) {
    query = query.eq("spec_id", specId);
  }

  const { data, error } = await query;

  if (error) return { error: error.message, data: [] };
  return { data: data ?? [] };
}

export async function addProduct(specId: string, name: string) {
  const employee = await getCurrentEmployee();
  const authErr = requireAuth(employee);
  if (authErr) return authErr;
  const permErr = requireAdmin(employee!);
  if (permErr) return permErr;

  const trimmed = name.trim();
  if (!trimmed) return { error: "제품명을 입력해 주세요." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_products")
    .insert({ spec_id: specId, name: trimmed })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/inventory");
  return { success: true, id: data.id as string };
}

export async function updateProduct(id: string, name: string) {
  const employee = await getCurrentEmployee();
  const authErr = requireAuth(employee);
  if (authErr) return authErr;
  const permErr = requireAdmin(employee!);
  if (permErr) return permErr;

  const trimmed = name.trim();
  if (!trimmed) return { error: "제품명을 입력해 주세요." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("inventory_products")
    .update({ name: trimmed })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/inventory");
  return { success: true };
}

export async function deleteProduct(id: string) {
  const employee = await getCurrentEmployee();
  const authErr = requireAuth(employee);
  if (authErr) return authErr;
  const permErr = requireAdmin(employee!);
  if (permErr) return permErr;

  const supabase = await createClient();
  const { error } = await supabase
    .from("inventory_products")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/inventory");
  return { success: true };
}

// =============================================
// 4. 재고 아이템 조회 (JOIN)
// =============================================

export interface InventoryFilters {
  categoryId?: string;
  specId?: string;
  productId?: string;
  condition?: ItemCondition;
  search?: string;
}

export async function getInventoryItems(filters?: InventoryFilters) {
  const employee = await getCurrentEmployee();
  const authErr = requireAuth(employee);
  if (authErr) return { ...authErr, data: [] };

  const supabase = await createClient();

  let query = supabase
    .from("inventory_items")
    .select(
      `
      *,
      inventory_categories(name),
      inventory_specs(name),
      inventory_products(name)
    `
    )
    .order("updated_at", { ascending: false });

  if (filters?.categoryId) {
    query = query.eq("category_id", filters.categoryId);
  }
  if (filters?.specId) {
    query = query.eq("spec_id", filters.specId);
  }
  if (filters?.productId) {
    query = query.eq("product_id", filters.productId);
  }
  if (filters?.condition) {
    query = query.eq("condition", filters.condition);
  }
  if (filters?.search) {
    query = query.ilike("capacity", `%${filters.search}%`);
  }

  const { data, error } = await query;

  if (error) return { error: error.message, data: [] };
  return { data: data ?? [] };
}

// =============================================
// 5. 재고 아이템 등록
// =============================================

export async function addInventoryItem(data: {
  category_id: string;
  spec_id: string;
  product_id: string;
  capacity?: string;
  condition: ItemCondition;
  quantity: number;
  base_estimate: number;
}) {
  const employee = await getCurrentEmployee();
  const authErr = requireAuth(employee);
  if (authErr) return authErr;
  const permErr = requireManager(employee!);
  if (permErr) return permErr;

  if (data.quantity < 0) return { error: "수량은 0 이상이어야 합니다." };
  if (data.base_estimate < 0) return { error: "기초견적은 0 이상이어야 합니다." };

  const supabase = await createClient();

  // 중복 재고 체크: 카테고리·사양·제품명·용량·상태가 모두 동일한 항목이 이미 존재하는지 확인
  const capacityValue = data.capacity?.trim() || null;
  let duplicateQuery = supabase
    .from("inventory_items")
    .select("id")
    .eq("category_id", data.category_id)
    .eq("spec_id", data.spec_id)
    .eq("product_id", data.product_id)
    .eq("condition", data.condition);

  if (capacityValue === null) {
    duplicateQuery = duplicateQuery.is("capacity", null);
  } else {
    duplicateQuery = duplicateQuery.eq("capacity", capacityValue);
  }

  const { data: existing } = await duplicateQuery.maybeSingle();
  if (existing) {
    return {
      error:
        "이미 같은 이름의 재고 리스트가 존재합니다. 리스트 확인 후 관리자에게 문의하세요.",
    };
  }

  const { data: inserted, error } = await supabase.from("inventory_items").insert({
    category_id: data.category_id,
    spec_id: data.spec_id,
    product_id: data.product_id,
    capacity: data.capacity?.trim() || null,
    condition: data.condition,
    quantity: data.quantity,
    base_estimate: data.base_estimate,
  }).select("id").single();

  if (error) return { error: error.message };

  // INBOUND 트랜잭션 기록 (신규 재고 등록)
  if (inserted && data.quantity > 0) {
    await supabase.from("inventory_transactions").insert({
      item_id: inserted.id,
      user_id: employee!.id,
      transaction_type: "INBOUND",
      quantity_changed: data.quantity,
      notes: "신규 재고 등록",
    });
  }

  revalidatePath("/inventory");
  return { success: true };
}

// =============================================
// 6. 재고 아이템 수정
// =============================================

export async function updateInventoryItem(
  itemId: string,
  data: {
    category_id?: string;
    spec_id?: string;
    product_id?: string;
    capacity?: string | null;
    condition?: ItemCondition;
    quantity?: number;
    base_estimate?: number;
  }
) {
  const employee = await getCurrentEmployee();
  const authErr = requireAuth(employee);
  if (authErr) return authErr;
  const permErr = requireManager(employee!);
  if (permErr) return permErr;

  const updates: Record<string, unknown> = {};

  if (data.category_id !== undefined) updates.category_id = data.category_id;
  if (data.spec_id !== undefined) updates.spec_id = data.spec_id;
  if (data.product_id !== undefined) updates.product_id = data.product_id;
  if (data.capacity !== undefined) {
    updates.capacity = data.capacity?.trim() || null;
  }
  if (data.condition !== undefined) updates.condition = data.condition;
  if (data.quantity !== undefined) {
    if (data.quantity < 0) return { error: "수량은 0 이상이어야 합니다." };
    updates.quantity = data.quantity;
  }
  if (data.base_estimate !== undefined) {
    if (data.base_estimate < 0) return { error: "기초견적은 0 이상이어야 합니다." };
    updates.base_estimate = data.base_estimate;
  }

  if (Object.keys(updates).length === 0) {
    return { error: "변경할 항목이 없습니다." };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("inventory_items")
    .update(updates)
    .eq("id", itemId);

  if (error) return { error: error.message };

  revalidatePath("/inventory");
  return { success: true };
}

// =============================================
// 7. 재고 아이템 삭제
// =============================================

export async function deleteInventoryItem(itemId: string) {
  const employee = await getCurrentEmployee();
  const authErr = requireAuth(employee);
  if (authErr) return authErr;
  const permErr = requireManager(employee!);
  if (permErr) return permErr;

  const supabase = await createClient();

  const { error } = await supabase
    .from("inventory_items")
    .delete()
    .eq("id", itemId);

  if (error) return { error: error.message };

  revalidatePath("/inventory");
  return { success: true };
}

// =============================================
// 8. 분류 다중 추가 (Bulk Insert)
// =============================================

export async function bulkAddCategories(names: string[]) {
  const employee = await getCurrentEmployee();
  const authErr = requireAuth(employee);
  if (authErr) return authErr;
  const permErr = requireAdmin(employee!);
  if (permErr) return permErr;

  const trimmed = names.map((n) => n.trim()).filter((n) => n.length > 0);
  if (trimmed.length === 0) return { error: "추가할 항목이 없습니다." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_categories")
    .insert(trimmed.map((name) => ({ name })))
    .select("id, name");

  if (error) return { error: error.message };

  revalidatePath("/inventory");
  return { success: true, data: data ?? [] };
}

export async function bulkAddSpecs(categoryId: string, names: string[]) {
  const employee = await getCurrentEmployee();
  const authErr = requireAuth(employee);
  if (authErr) return authErr;
  const permErr = requireAdmin(employee!);
  if (permErr) return permErr;

  const trimmed = names.map((n) => n.trim()).filter((n) => n.length > 0);
  if (trimmed.length === 0) return { error: "추가할 항목이 없습니다." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_specs")
    .insert(trimmed.map((name) => ({ category_id: categoryId, name })))
    .select("id, category_id, name");

  if (error) return { error: error.message };

  revalidatePath("/inventory");
  return { success: true, data: data ?? [] };
}

export async function bulkAddProducts(specId: string, names: string[]) {
  const employee = await getCurrentEmployee();
  const authErr = requireAuth(employee);
  if (authErr) return authErr;
  const permErr = requireAdmin(employee!);
  if (permErr) return permErr;

  const trimmed = names.map((n) => n.trim()).filter((n) => n.length > 0);
  if (trimmed.length === 0) return { error: "추가할 항목이 없습니다." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_products")
    .insert(trimmed.map((name) => ({ spec_id: specId, name })))
    .select("id, spec_id, name");

  if (error) return { error: error.message };

  revalidatePath("/inventory");
  return { success: true, data: data ?? [] };
}

// =============================================
// 9. 기본 서비스 비용 설정 (Global Settings)
// =============================================

export async function getGlobalSettings() {
  const employee = await getCurrentEmployee();
  const authErr = requireAuth(employee);
  if (authErr) return authErr;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("global_settings")
    .select("base_service_cost, value_reference_amount, discount_surcharge_rate, updated_at")
    .eq("id", true)
    .single();

  if (error) return { error: error.message };
  return { data };
}

export async function updateGlobalSettings(settings: {
  base_service_cost: number;
  value_reference_amount: number;
  discount_surcharge_rate: number;
}) {
  const employee = await getCurrentEmployee();
  const authErr = requireAuth(employee);
  if (authErr) return authErr;
  const permErr = requireAdmin(employee!);
  if (permErr) return permErr;

  const supabase = await createClient();
  const { error } = await supabase
    .from("global_settings")
    .update({
      base_service_cost: settings.base_service_cost,
      value_reference_amount: settings.value_reference_amount,
      discount_surcharge_rate: settings.discount_surcharge_rate,
    })
    .eq("id", true);

  if (error) return { error: error.message };

  revalidatePath("/inventory");
  return { success: true };
}

// =============================================
// 10. 재고 입출고 트랜잭션 조회 (관리자용)
// =============================================

export async function getInventoryTransactions(limit = 100) {
  const employee = await getCurrentEmployee();
  const authErr = requireAuth(employee);
  if (authErr) return { error: authErr.error, data: null };
  const permErr = requireManager(employee!);
  if (permErr) return { error: permErr.error, data: null };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("inventory_transactions")
    .select(
      `
      id,
      transaction_type,
      quantity_changed,
      notes,
      ticket_id,
      created_at,
      employees:user_id ( name ),
      inventory_items:item_id (
        capacity,
        inventory_categories ( name ),
        inventory_specs ( name ),
        inventory_products ( name )
      )
    `
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return { error: error.message, data: null };
  return { error: null, data };
}

// =============================================
// 11. 관리자 인라인 재고 직접 수정
// =============================================

export async function adminInlineUpdateInventoryItem(
  itemId: string,
  data: { capacity?: string | null; quantity?: number; base_estimate?: number }
) {
  const employee = await getCurrentEmployee();
  const authErr = requireAuth(employee);
  if (authErr) return authErr;
  const permErr = requireAdmin(employee!);
  if (permErr) return permErr;

  const updates: Record<string, unknown> = {};
  if ("capacity" in data) updates.capacity = data.capacity?.trim() || null;
  if (data.quantity !== undefined) {
    if (data.quantity < 0) return { error: "수량은 0 이상이어야 합니다." };
    updates.quantity = data.quantity;
  }
  if (data.base_estimate !== undefined) {
    if (data.base_estimate < 0) return { error: "기초견적은 0 이상이어야 합니다." };
    updates.base_estimate = data.base_estimate;
  }

  if (Object.keys(updates).length === 0) return { error: "변경할 항목이 없습니다." };

  const supabase = await createClient();

  // 수량 변경이 있는 경우 이전 수량 조회 (트랜잭션 기록용)
  let prevQuantity: number | null = null;
  if (data.quantity !== undefined) {
    const { data: current } = await supabase
      .from("inventory_items")
      .select("quantity")
      .eq("id", itemId)
      .single();
    prevQuantity = current?.quantity ?? null;
  }

  const { error } = await supabase
    .from("inventory_items")
    .update(updates)
    .eq("id", itemId);

  if (error) return { error: error.message };

  // 수량 변경 시 트랜잭션 기록
  if (data.quantity !== undefined && prevQuantity !== null) {
    const delta = data.quantity - prevQuantity;
    if (delta !== 0) {
      await supabase.from("inventory_transactions").insert({
        item_id: itemId,
        user_id: employee!.id,
        transaction_type: delta > 0 ? "INBOUND" : "ADJUSTMENT",
        quantity_changed: Math.abs(delta),
        notes: delta > 0
          ? `관리자 수동 입고 (+${delta}개)`
          : `관리자 수동 조정 (${delta}개)`,
      });
    }
  }

  revalidatePath("/inventory");
  return { success: true };
}