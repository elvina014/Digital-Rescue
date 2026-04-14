"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";
import { getCurrentEmployee } from "@/lib/auth";
import { EmployeeRole } from "@/types";

// ── Zod 유효성 검사 ──
const createEmployeeSchema = z.object({
  email: z.string().email("올바른 이메일 형식을 입력해 주세요."),
  password: z
    .string()
    .min(6, "비밀번호는 6자 이상이어야 합니다.")
    .max(72, "비밀번호는 72자 이내여야 합니다."),
  name: z
    .string()
    .min(1, "이름을 입력해 주세요.")
    .max(50, "이름은 50자 이내로 입력해 주세요."),
  phone: z.string().optional().default(""),
  role: z.enum(
    ["ADMIN", "MANAGER", "RECEPTION", "TECHNICIAN", "EXPERT_REPAIR", "CS"],
    { message: "직급을 선택해 주세요." }
  ),
});

export type EmployeeFormState = {
  success: boolean;
  message: string;
  errors?: Record<string, string>;
  values?: Record<string, string>;
};

/**
 * 신규 직원 생성 Server Action
 *
 * 1) ADMIN 권한 체크
 * 2) Zod 유효성 검사
 * 3) Supabase Admin으로 auth.users 생성
 * 4) employees 테이블에 프로필 INSERT
 */
export async function createEmployeeAction(
  _prevState: EmployeeFormState,
  formData: FormData
): Promise<EmployeeFormState> {
  // ── 1. ADMIN 권한 체크 ──
  const currentEmployee = await getCurrentEmployee();
  if (!currentEmployee || currentEmployee.role !== EmployeeRole.ADMIN) {
    return {
      success: false,
      message: "직원 생성 권한이 없습니다.",
    };
  }

  // ── 2. 폼 데이터 파싱 ──
  const raw = {
    email: (formData.get("email") as string | null)?.trim() ?? "",
    password: formData.get("password") as string | null ?? "",
    name: (formData.get("name") as string | null)?.trim() ?? "",
    phone: (formData.get("phone") as string | null)?.trim() ?? "",
    role: formData.get("role") as string | null ?? "",
  };

  // ── 3. Zod 유효성 검사 ──
  const result = z.safeParse(createEmployeeSchema, raw);

  if (!result.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = String(issue.path[0]);
      if (!fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }

    const preserved = { ...raw };
    for (const key of Object.keys(fieldErrors)) {
      if (key === "password") preserved[key] = "";
    }

    return {
      success: false,
      message: "입력 정보를 확인해 주세요.",
      errors: fieldErrors,
      values: preserved,
    };
  }

  const data = result.data;
  const supabase = createAdminClient();

  try {
    // ── 4. auth.users에 유저 생성 ──
    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
      });

    if (authError || !authData.user) {
      // 이메일 중복 등
      const msg =
        authError?.message?.includes("already been registered")
          ? "이미 등록된 이메일입니다."
          : `계정 생성 실패: ${authError?.message ?? "알 수 없는 오류"}`;
      return {
        success: false,
        message: msg,
        values: { ...raw, password: "" },
      };
    }

    const userId = authData.user.id;

    // ── 5. employees 테이블에 프로필 INSERT ──
    const { error: profileError } = await supabase
      .from("employees")
      .insert({
        id: userId,
        name: data.name,
        role: data.role,
        phone: data.phone || null,
      });

    if (profileError) {
      // 롤백: auth.users에서 생성된 유저 삭제
      await supabase.auth.admin.deleteUser(userId);
      return {
        success: false,
        message: `직원 프로필 저장 실패: ${profileError.message}`,
        values: { ...raw, password: "" },
      };
    }

    return {
      success: true,
      message: `${data.name} (${data.role}) 직원이 성공적으로 등록되었습니다.`,
    };
  } catch (err) {
    console.error("Unexpected error in createEmployeeAction:", err);
    return {
      success: false,
      message: "서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
      values: { ...raw, password: "" },
    };
  }
}

// ── 직원 정보 수정 ──

const updateEmployeeSchema = z.object({
  name: z
    .string()
    .min(1, "이름을 입력해 주세요.")
    .max(50, "이름은 50자 이내로 입력해 주세요."),
  phone: z.string().optional().default(""),
  role: z.enum(
    ["ADMIN", "MANAGER", "RECEPTION", "TECHNICIAN", "EXPERT_REPAIR", "CS"],
    { message: "직급을 선택해 주세요." }
  ),
});

/**
 * 직원 정보 수정 Server Action
 *
 * 1) ADMIN 권한 체크
 * 2) Zod 유효성 검사
 * 3) employees 테이블 UPDATE
 * 4) revalidatePath로 목록 갱신
 */
export async function updateEmployeeAction(
  _prevState: EmployeeFormState,
  formData: FormData
): Promise<EmployeeFormState> {
  const currentEmployee = await getCurrentEmployee();
  if (!currentEmployee || currentEmployee.role !== EmployeeRole.ADMIN) {
    return { success: false, message: "직원 수정 권한이 없습니다." };
  }

  const employeeId = formData.get("employeeId") as string | null;
  if (!employeeId) {
    return { success: false, message: "수정 대상 직원 ID가 없습니다." };
  }

  const raw = {
    name: (formData.get("name") as string | null)?.trim() ?? "",
    phone: (formData.get("phone") as string | null)?.trim() ?? "",
    role: (formData.get("role") as string | null) ?? "",
  };

  const result = z.safeParse(updateEmployeeSchema, raw);

  if (!result.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = String(issue.path[0]);
      if (!fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return {
      success: false,
      message: "입력 정보를 확인해 주세요.",
      errors: fieldErrors,
      values: raw,
    };
  }

  const data = result.data;
  const supabase = createAdminClient();

  try {
    const { error } = await supabase
      .from("employees")
      .update({
        name: data.name,
        role: data.role,
        phone: data.phone || null,
      })
      .eq("id", employeeId);

    if (error) {
      return {
        success: false,
        message: `직원 정보 수정 실패: ${error.message}`,
        values: raw,
      };
    }

    revalidatePath("/(admin)/employees");

    return {
      success: true,
      message: "직원 정보가 수정되었습니다.",
    };
  } catch (err) {
    console.error("Unexpected error in updateEmployeeAction:", err);
    return {
      success: false,
      message: "서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
      values: raw,
    };
  }
}
