interface BrandPageProps {
  params: Promise<{ brand: string }>;
}

/**
 * 브랜드별 랜딩 페이지 (digital-rescue.com/[brand])
 * 광고 유입용. 예: /lg, /msi, /samsung 등
 */
export default async function BrandPage({ params }: BrandPageProps) {
  const { brand } = await params;

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold capitalize">{brand} 수리 서비스</h1>
      <p className="mt-4 text-lg text-gray-600">
        디지털레스큐의 {brand} 전문 수리 서비스를 만나보세요.
      </p>
    </div>
  );
}
