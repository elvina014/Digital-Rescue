import { createClient } from "@/utils/supabase/server";
import { requireAdminPage } from "../requireAdminPage";
import CatalogTabs from "../CatalogTabs";
import SymptomCodesClient from "./SymptomCodesClient";

/** 증상 코드 관리 (ADMIN 전용) */
export default async function SymptomCodesPage() {
  await requireAdminPage();
  const supabase = await createClient();
  const { data } = await supabase.from("symptom_codes").select("*").order("sort_order").order("name");

  return (
    <div className="mx-auto max-w-4xl">
      <CatalogTabs active="/catalog/symptoms" />
      <SymptomCodesClient codes={data ?? []} />
    </div>
  );
}
