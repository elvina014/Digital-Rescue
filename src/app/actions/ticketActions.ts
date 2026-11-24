"use server";

import { z } from "zod";
import { after } from "next/server";
import sharp from "sharp";
import { createAdminClient } from "@/utils/supabase/admin";

// ── Zod 유효성 검사 스키마 ──
const ticketFormSchema = z.object({
  name: z
    .string()
    .min(1, "이름을 입력해 주세요.")
    .max(50, "이름은 50자 이내로 입력해 주세요."),
  phone: z
    .string()
    .min(1, "연락처를 입력해 주세요.")
    .regex(
      /^01[016789]-?\d{3,4}-?\d{4}$/,
      "올바른 휴대폰 번호를 입력해 주세요. (예: 010-1234-5678)"
    ),
  address: z.string().optional().default(""),
  receiptType: z.enum(["WALK_IN", "VISIT", "QUICK", "PARCEL", "미정"], {
    message: "접수 방식을 선택해 주세요.",
  }),
  deviceType: z.enum(["노트북", "데스크탑", "태블릿", "서버", "나스", "기타저장장치"], {
    message: "기기 종류를 선택해 주세요.",
  }),
  deviceBrand: z
    .string()
    .min(1, "브랜드를 입력해 주세요.")
    .max(50, "브랜드명은 50자 이내로 입력해 주세요."),
  deviceModel: z.string().optional().default(""),
  symptoms: z
    .string()
    .min(5, "고장 증상을 5자 이상 입력해 주세요.")
    .max(2000, "고장 증상은 2000자 이내로 입력해 주세요."),
});

export type TicketFormState = {
  success: boolean;
  message: string;
  errors?: Record<string, string>;
  values?: Record<string, string>;
};

/**
 * 대고객 홈페이지 접수 폼 Server Action
 *
 * 1) customers 테이블에서 phone으로 고객 조회 → 없으면 INSERT
 * 2) repair_tickets 테이블에 새 접수건 INSERT (status: NEW)
 *
 * RLS를 우회하기 위해 service_role 클라이언트를 사용합니다.
 */
export async function submitTicketAction(
  _prevState: TicketFormState,
  formData: FormData
): Promise<TicketFormState> {
  // ── 1. 폼 데이터 파싱 ──
  const raw = {
    name: formData.get("name") as string | null,
    phone: formData.get("phone") as string | null,
    address: formData.get("address") as string | null,
    receiptType: formData.get("receiptType") as string | null,
    deviceType: formData.get("deviceType") as string | null,
    deviceBrand: formData.get("deviceBrand") as string | null,
    deviceModel: formData.get("deviceModel") as string | null,
    symptoms: formData.get("symptoms") as string | null,
  };

  // ── 2. Zod 유효성 검사 ──
  const result = z.safeParse(ticketFormSchema, {
    name: raw.name?.trim() ?? "",
    phone: raw.phone?.trim().replace(/\s/g, "") ?? "",
    address: raw.address?.trim() ?? "",
    receiptType: raw.receiptType ?? "",
    deviceType: raw.deviceType?.trim() ?? "",
    deviceBrand: raw.deviceBrand?.trim() ?? "",
    deviceModel: raw.deviceModel?.trim() ?? "",
    symptoms: raw.symptoms?.trim() ?? "",
  });

  if (!result.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = String(issue.path[0]);
      if (!fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }

    // 에러 난 필드는 값을 비우고, 나머지는 유지
    const preserved: Record<string, string> = {
      name: raw.name?.trim() ?? "",
      phone: raw.phone?.trim() ?? "",
      address: raw.address?.trim() ?? "",
      receiptType: raw.receiptType ?? "",
      deviceType: raw.deviceType?.trim() ?? "",
      deviceBrand: raw.deviceBrand?.trim() ?? "",
      deviceModel: raw.deviceModel?.trim() ?? "",
      symptoms: raw.symptoms?.trim() ?? "",
    };
    for (const key of Object.keys(fieldErrors)) {
      preserved[key] = "";
    }

    return {
      success: false,
      message: "입력 정보를 확인해 주세요.",
      errors: fieldErrors,
      values: preserved,
    };
  }

  const data = result.data;

  // ── 3. Supabase Admin 클라이언트 (RLS 우회) ──
  const supabase = createAdminClient();

  try {
    // ── 4. 고객 조회 또는 생성 (phone 기준) ──
    const { data: existingCustomer, error: selectError } = await supabase
      .from("customers")
      .select("id")
      .eq("phone", data.phone)
      .maybeSingle();

    if (selectError) {
      console.error("Customer lookup failed:", selectError);
      return {
        success: false,
        message: "접수 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
      };
    }

    let customerId: string;

    if (existingCustomer) {
      customerId = existingCustomer.id;
    } else {
      const { data: newCustomer, error: insertError } = await supabase
        .from("customers")
        .insert({
          name: data.name,
          phone: data.phone,
          address: data.address || null,
        })
        .select("id")
        .single();

      if (insertError || !newCustomer) {
        console.error("Customer insert failed:", insertError);
        return {
          success: false,
          message:
            "고객 정보 저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
        };
      }

      customerId = newCustomer.id;
    }

    // ── 5. 접수건 생성 (status: NEW) ──
    const { data: newTicket, error: ticketError } = await supabase
      .from("repair_tickets")
      .insert({
        customer_id: customerId,
        status: "NEW",
        receipt_type: data.receiptType,
        device_type: data.deviceType,
        device_brand: data.deviceBrand,
        device_model: data.deviceModel || null,
        symptoms: data.symptoms,
      })
      .select("id, created_at")
      .single();

    if (ticketError || !newTicket) {
      console.error("Ticket insert failed:", ticketError);
      return {
        success: false,
        message:
          "접수건 저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
      };
    }

    // ── 6. 이미지 업로드 (최대 2장) ──
    const imageFiles = formData.getAll("images") as File[];
    const imageDescriptions = formData.getAll("imageDescriptions") as string[];
    const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
    const MAX_IMAGE_DIMENSION = 1920;
    const validImages = imageFiles.filter(
      (f) => f instanceof File && f.size > 0 && f.size <= MAX_IMAGE_SIZE && f.type.startsWith("image/")
    ).slice(0, 2);

    if (validImages.length > 0) {
      const uploaded: { path: string; url: string; description: string; uploaded_by: string; uploader_name: string; uploaded_at: string; is_customer: boolean }[] = [];

      for (let i = 0; i < validImages.length; i++) {
        const file = validImages[i];
        const desc = imageDescriptions[i] ?? "";
        const timestamp = Date.now();
        const safeName = file.name
          .replace(/\.[^.]+$/, "")
          .replace(/[^a-zA-Z0-9_-]/g, "_")
          .replace(/_+/g, "_")
          .slice(0, 40);
        const filePath = `${newTicket.id}/${timestamp}_${safeName}.webp`;

        const arrayBuffer = await file.arrayBuffer();
        const inputBuffer = Buffer.from(arrayBuffer);
        const outputBuffer = await sharp(inputBuffer, { failOn: "none" })
          .rotate()
          .resize({
            width: MAX_IMAGE_DIMENSION,
            height: MAX_IMAGE_DIMENSION,
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp()
          .toBuffer();

        const { error: uploadError } = await supabase.storage
          .from("ticket-images")
          .upload(filePath, outputBuffer, {
            contentType: "image/webp",
            upsert: false,
          });

        if (uploadError) {
          console.error("[submitTicketAction] Upload failed:", uploadError);
        } else {
          const { data: urlData } = supabase.storage
            .from("ticket-images")
            .getPublicUrl(filePath);
          uploaded.push({
            path: filePath,
            url: urlData.publicUrl,
            description: desc,
            uploaded_by: "customer",
            uploader_name: data.name,
            uploaded_at: new Date().toISOString(),
            is_customer: true,
          });
        }
      }

      if (uploaded.length > 0) {
        await supabase
          .from("repair_tickets")
          .update({ images: uploaded })
          .eq("id", newTicket.id);
      }
    }

    // ── 7. n8n 웹훅 전송 ──
    // after()를 사용해 고객 응답 반환 후 서버리스 함수가 종료되기 전에 완전히 전송됨을 보장
    const webhookUrl = process.env.N8N_NEW_TICKET_WEBHOOK_URL;
    if (!webhookUrl) {
      console.warn("[submitTicketAction] N8N_NEW_TICKET_WEBHOOK_URL not set — webhook skipped");
    } else {
      const payload = {
        ticket_id: newTicket.id,
        submitted_at: newTicket.created_at,
        customer: {
          name: data.name,
          phone: data.phone,
          address: data.address || null,
        },
        ticket: {
          receipt_type: data.receiptType,
          device_type: data.deviceType,
          device_brand: data.deviceBrand,
          device_model: data.deviceModel || null,
          symptoms: data.symptoms,
          status: "NEW",
        },
      };
      after(async () => {
        try {
          await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        } catch (err) {
          console.error("[submitTicketAction] Webhook failed:", err);
        }
      });
    }

    return {
      success: true,
      message: "접수가 완료되었습니다. 담당자가 곧 연락드리겠습니다.",
    };
  } catch (err) {
    console.error("Unexpected error in submitTicketAction:", err);
    return {
      success: false,
      message: "서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }
}
