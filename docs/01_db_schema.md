데이터베이스 스키마 설계 (Database Schema)(중략... 이전 1~2, 3.1~3.2 항목 동일)3.3 repair_tickets (수리 접수건 테이블)필드명타입제약 조건설명idUUIDPK접수건 고유 IDcustomer_idUUIDFK(customers.id)접수 고객assignee_idUUIDFK(employees.id), NULL배정된 담당기사statusTicketStatusDEFAULT 'NEW'현재 처리 상태receipt_typeReceiptTypeNOT NULL접수 방식device_brandVARCHARNOT NULL브랜드명device_modelVARCHARNULL기기 모델명symptomsTEXTNOT NULL고장 증상 및 문의 내용initial_estimateINTEGERDEFAULT 0시스템 산출 최소 견적expected_estimateINTEGERDEFAULT 0예상 견적material_costINTEGERDEFAULT 0자재비 총합material_cost_detailsJSONBDEFAULT '[]'자재비 상세 내역final_priceINTEGERDEFAULT 0최종 확정 견적is_approvedBOOLEANDEFAULT FALSE회사 최종 승인 여부payment_statusVARCHARDEFAULT 'PENDING'결제 상태payment_methodVARCHARNULL결제 방식has_admin_messageBOOLEANDEFAULT FALSE관리자 메시지 여부imagesJSONBDEFAULT '[]'[수정] 업로드된 이미지 정보 목록 (최대 12장). 상세 구조는 아래 참조created_atTIMESTAMPTZDEFAULT NOW()접수 일시updated_atTIMESTAMPTZDEFAULT NOW()마지막 수정 일시images JSONB 배열의 객체 구조 정의:[
  {
    "url": "https://...",
    "path": "ticket-images/...",
    "description": "액정 파손 부위", 
    "uploaded_by": "uuid_or_customer",
    "uploader_name": "홍길동 기사",
    "uploaded_at": "2024-05-20T10:30:00Z",
    "is_customer": false
  }
]
(이하 생략)