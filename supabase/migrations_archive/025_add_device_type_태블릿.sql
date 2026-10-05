-- 025: device_type Enum에 '태블릿' 값 추가 (Surface 등 태블릿 기기 접수 지원)
ALTER TYPE device_type ADD VALUE IF NOT EXISTS '태블릿';
