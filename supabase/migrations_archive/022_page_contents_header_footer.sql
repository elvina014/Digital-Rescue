-- =============================================
-- 022_page_contents_header_footer.sql
-- main:header / main:footer 시드 추가.
-- src/data/mainPageData.json 의 header / footer 키와 동일한 모양.
-- 재실행 안전: ON CONFLICT DO NOTHING
-- =============================================

INSERT INTO page_contents (page_key, section_key, content_data) VALUES

('main', 'header', $cms$
{
  "brand": {
    "leadText":   "디지털",
    "accentText": "레스큐",
    "href":       "/"
  },
  "navLinks": [
    { "label": "회사소개",   "href": "#about" },
    { "label": "서비스 안내", "href": "#services" },
    { "label": "수리 과정",   "href": "#process" },
    { "label": "접수하기",   "href": "#contact" },
    { "label": "내역조회",   "href": "/lookup" }
  ],
  "cta": { "label": "전화 상담", "href": "tel:010-0000-0000" }
}
$cms$::jsonb),

('main', 'footer', $cms$
{
  "brand": {
    "leadText":   "디지털",
    "accentText": "레스큐",
    "intro":      "직영 운영, 투명한 전자 견적.\n노트북·PC 수리 및 데이터 복구 전문 서비스."
  },
  "columns": [
    {
      "title": "서비스",
      "items": [
        { "label": "노트북 수리" },
        { "label": "데스크탑 PC 수리" },
        { "label": "데이터 복구" },
        { "label": "부품 교체 / 업그레이드" }
      ]
    },
    {
      "title": "고객센터",
      "items": [
        { "label": "전화: 010-0000-0000", "href": "tel:010-0000-0000" },
        { "label": "카카오톡 문의", "href": "https://pf.kakao.com/", "external": true },
        { "label": "영업시간: 평일 10:00 ~ 19:00" }
      ]
    }
  ],
  "business": [
    { "label": "상호명",         "value": "디지털레스큐" },
    { "label": "대표자",         "value": "홍길동" },
    { "label": "사업자등록번호", "value": "000-00-00000" },
    { "label": "주소",           "value": "서울특별시 OO구 OO로 00, 0층" }
  ],
  "disclaimer": "본 센터는 제조사 공식 서비스 센터가 아닌 독립적인 사설 수리 전문점입니다.\n제조사의 공식 보증과는 별개로 운영되며, 수리 후 자체 보증을 제공합니다.",
  "copyright":  "© %YEAR% 디지털레스큐. All rights reserved."
}
$cms$::jsonb)

ON CONFLICT (page_key, section_key) DO NOTHING;
