-- 024: receipt_type Enum에 '미정' 값 추가 (브랜드 랜딩페이지 미선택 접수 지원)
ALTER TYPE receipt_type ADD VALUE IF NOT EXISTS '미정';
