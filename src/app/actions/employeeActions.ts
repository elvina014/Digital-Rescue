"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
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
  email: z.string().email("올바른 이메일 형식을 입력해 주세요."),
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
    email: (formData.get("email") as string | null)?.trim() ?? "",
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
    // 이메일 변경 (Supabase Auth)
    const { error: emailError } = await supabase.auth.admin.updateUserById(
      employeeId,
      { email: data.email, email_confirm: true }
    );
    if (emailError) {
      const msg = emailError.message?.includes("already been registered")
        ? "이미 사용 중인 이메일입니다."
        : `이메일 변경 실패: ${emailError.message}`;
      return { success: false, message: msg, values: raw };
    }

    // 프로필 변경 (employees 테이블)
    // is_assignable은 담당기사/정밀수리팀 직급에서만 의미가 있으므로 해당 직급일 때만 반영
    const profileUpdate: {
      name: string;
      role: string;
      phone: string | null;
      is_assignable?: boolean;
    } = {
      name: data.name,
      role: data.role,
      phone: data.phone || null,
    };
    if (data.role === "TECHNICIAN" || data.role === "EXPERT_REPAIR") {
      profileUpdate.is_assignable = formData.get("is_assignable") === "true";
    }

    const { error } = await supabase
      .from("employees")
      .update(profileUpdate)
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

// ── 비밀번호 정책: 영문 + 숫자 조합, 8자 이상 ──
const PASSWORD_REGEX = /^(?=.*[a-zA-Z])(?=.*\d).{8,}$/;

const updateMyProfileSchema = z.object({
  name: z
    .string()
    .min(1, "이름을 입력해 주세요.")
    .max(50, "이름은 50자 이내로 입력해 주세요."),
  phone: z.string().optional().default(""),
  newPassword: z
    .string()
    .optional()
    .refine(
      (val) => !val || PASSWORD_REGEX.test(val),
      "비밀번호는 영문+숫자 조합 8자 이상이어야 합니다."
    ),
  confirmPassword: z.string().optional(),
});

/**
 * 내 프로필 수정 Server Action (마이페이지)
 * - 이름, 연락처: employees 테이블 UPDATE
 * - 비밀번호: Supabase Auth updateUser (현재 세션 기준)
 */
export async function updateMyProfileAction(
  _prevState: EmployeeFormState,
  formData: FormData
): Promise<EmployeeFormState> {
  const currentEmployee = await getCurrentEmployee();
  if (!currentEmployee) {
    return { success: false, message: "인증이 필요합니다." };
  }

  const raw = {
    name: (formData.get("name") as string | null)?.trim() ?? "",
    phone: (formData.get("phone") as string | null)?.trim() ?? "",
    newPassword: (formData.get("newPassword") as string | null) ?? "",
    confirmPassword: (formData.get("confirmPassword") as string | null) ?? "",
  };

  // 비밀번호 일치 확인 (프론트에서도 하지만 백엔드에서도 검증)
  if (raw.newPassword && raw.newPassword !== raw.confirmPassword) {
    return {
      success: false,
      message: "새 비밀번호와 확인 비밀번호가 일치하지 않습니다.",
      values: { name: raw.name, phone: raw.phone },
    };
  }

  const result = z.safeParse(updateMyProfileSchema, raw);
  if (!result.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = String(issue.path[0]);
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return {
      success: false,
      message: "입력 정보를 확인해 주세요.",
      errors: fieldErrors,
      values: { name: raw.name, phone: raw.phone },
    };
  }

  const supabase = await createClient();
  const adminSupa = createAdminClient();

  try {
    // 1) 이름·연락처 업데이트
    const { error: profileError } = await adminSupa
      .from("employees")
      .update({
        name: result.data.name,
        phone: result.data.phone || null,
      })
      .eq("id", currentEmployee.id);

    if (profileError) {
      return {
        success: false,
        message: `프로필 수정 실패: ${profileError.message}`,
        values: { name: raw.name, phone: raw.phone },
      };
    }

    // 2) 비밀번호 변경 (입력된 경우에만)
    if (result.data.newPassword) {
      const { error: pwError } = await supabase.auth.updateUser({
        password: result.data.newPassword,
      });
      if (pwError) {
        return {
          success: false,
          message: `비밀번호 변경 실패: ${pwError.message}`,
          values: { name: raw.name, phone: raw.phone },
        };
      }
    }

    revalidatePath("/dashboard");
    return {
      success: true,
      message: result.data.newPassword
        ? "프로필과 비밀번호가 모두 변경되었습니다."
        : "프로필이 수정되었습니다.",
    };
  } catch (err) {
    console.error("Unexpected error in updateMyProfileAction:", err);
    return {
      success: false,
      message: "서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
      values: { name: raw.name, phone: raw.phone },
    };
  }
}

// ── 임시 비밀번호 생성 헬퍼 ──
function generateTempPassword(): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const all = letters + digits;
  // 영문 1자 + 숫자 1자 보장 후 나머지 6자 랜덤
  const arr = [
    letters[Math.floor(Math.random() * letters.length)],
    digits[Math.floor(Math.random() * digits.length)],
    ...Array.from({ length: 6 }, () => all[Math.floor(Math.random() * all.length)]),
  ];
  // 셔플
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join("");
}

export type ResetPasswordResult = {
  success: boolean;
  message: string;
  tempPassword?: string;
};

/**
 * 관리자용 직원 비밀번호 초기화 Server Action
 * - 8자리 영문+숫자 임시 비밀번호 생성
 * - Supabase Auth Admin으로 해시화 후 DB 업데이트
 * - 평문 임시 비밀번호를 프론트로 반환
 */
export async function resetEmployeePasswordAction(
  employeeId: string
): Promise<ResetPasswordResult> {
  const currentEmployee = await getCurrentEmployee();
  if (!currentEmployee || currentEmployee.role !== EmployeeRole.ADMIN) {
    return { success: false, message: "비밀번호 초기화 권한이 없습니다." };
  }

  if (employeeId === currentEmployee.id) {
    return { success: false, message: "자신의 비밀번호는 마이페이지에서 변경해 주세요." };
  }

  const tempPassword = generateTempPassword();
  const adminSupa = createAdminClient();

  const { error } = await adminSupa.auth.admin.updateUserById(employeeId, {
    password: tempPassword,
  });

  if (error) {
    return { success: false, message: `초기화 실패: ${error.message}` };
  }

  return {
    success: true,
    message: "임시 비밀번호가 발급되었습니다.",
    tempPassword,
  };
}
