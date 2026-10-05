import { createClient } from "@/utils/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { EmployeeRole } from "@/types";
import DonorExtractRequestWidget from "./DonorExtractRequestWidget";

/**
 * Donor 부품 적출 입고 요청 대기 목록 (관리자/팀장 전용). 고객 정보는 조회하지 않는다.
 */
export default async function DonorExtractRequestSection() {
  const employee = await getCurrentEmployee();
  if (!employee || (employee.role !== EmployeeRole.ADMIN && employee.role !== EmployeeRole.MANAGER)) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("donor_part_candidates")
    .select(`
      id, donor_id, description, quantity, return_spec, return_name, return_capacity, updated_at,
      inventory_categories ( name ),
      donor_devices ( donor_no, brand, model_text, status )
    `)
    .eq("status", "REQUESTED")
    .order("updated_at", { ascending: true });

  const items = (data ?? [])
    .map((c) => {
      const donor = c.donor_devices as unknown as { donor_no: string; brand: string; model_text: string | null; status: string } | null;
      return {
        id: c.id,
        donor_id: c.donor_id,
        donor_no: donor?.donor_no ?? "",
        donor_label: [donor?.brand, donor?.model_text].filter(Boolean).join(" "),
        donor_available: donor?.status === "AVAILABLE",
        description: c.description,
        label: [(c.inventory_categories as unknown as { name: string } | null)?.name, c.return_spec, c.return_name, c.return_capacity]
          .filter(Boolean).join(" / "),
        quantity: c.quantity,
      };
    })
    .filter((i) => i.donor_available);

  return <DonorExtractRequestWidget items={items} />;
}
