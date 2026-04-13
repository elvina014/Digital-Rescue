Digital-Rescue 프로젝트 전역 지침서 (Global Guidelines)

1. 프로젝트 개요 (Project Overview)

본 프로젝트는 '디지털레스큐(Digital-Rescue)'의 노트북/PC 수리 및 데이터 복구 서비스를 위한 통합 웹 플랫폼 구축 프로젝트이다.
기존 수리 업계의 폐단(과도한 견적, 외주로 인한 책임 회피 등)을 해결하기 위해, 회사가 직영으로 운영하며 투명한 전자 견적과 철저한 직급별 권한 분리를 제공하는 것을 핵심 가치로 삼는다.

1.1 핵심 서비스 도메인 구조

메인/대고객 홈페이지: digital-rescue.com (회사 소개, 서비스 접수, 아이템 구매, 최신 뉴스)

브랜드별 랜딩 페이지: digital-rescue.com/[brand] (광고 유입용. 예: /lg, /msi, /samsung 등)

직원/관리자 포털: login.digital-rescue.com (상태 조회, 견적 산출, 센터 승인 시스템)

콘텐츠 관리 시스템 (CMS): edit.digital-rescue.com (홈페이지 모듈 및 컴포넌트 수정)

2. 기술 스택 (Tech Stack)

Framework: Next.js (App Router 권장) + React

Language: TypeScript (엄격한 타입 검사 적용)

Styling: Tailwind CSS (반응형 및 디자인 일관성 유지)

State Management: Zustand 또는 React Context API

Database / ORM: Supabase

Payment API: PortOne (포트원) 결제 API

Analytics: Google Analytics 4 (GA4), Naver Premium Log, Meta Pixel

3. UI/UX 및 디자인 원칙 (Design Principles)

절대적 일관성: 모든 웹페이지(메인, 브랜드, 관리자)는 동일한 폰트(글씨체)와 통일된 디자인 톤앤매너(색상 팔레트)를 공유해야 한다.

모듈형 아키텍처: 페이지별로 코드를 하드코딩하지 않고, Header, Footer, Hero, ServiceList, ContactForm 등을 독립된 '컴포넌트'로 제작하여 재사용한다.

향후 edit.digital-rescue.com에서 텍스트/이미지만 교체하면 즉시 반영되도록 데이터와 UI를 분리한다.

반응형 웹 (Responsive Web): Mobile-first 접근 방식을 사용하며, 모바일, 태블릿, PC 해상도에서 레이아웃이 자동으로 최적화되어야 한다.

사용자 유도 (CTA): 모바일 뷰에서는 '전화 걸기' 또는 '카톡 상담' 버튼이 화면 하단에 고정(Sticky)되어 항상 노출되어야 한다.

동적 시각 효과: 대고객 페이지의 '실시간 처리 현황'은 10분마다 리프레시 되도록 구현하며, 지루하지 않게 적절한 애니메이션(Framer Motion 등)을 가미한다.

4. AI 코딩 지침 (AI Coding Instructions)

이 문서를 읽고 있는 AI(Claude 등)는 아래의 규칙을 엄격하게 준수하여 코드를 생성해야 한다.

환각(Hallucination) 방지: 불확실한 라이브러리를 임의로 사용하거나, 지시하지 않은 복잡한 구조를 스스로 만들어내지 마라. 명확하지 않은 부분이 있다면 코드를 짜기 전에 먼저 질문(Ask first)할 것.

TypeScript 타이핑 보장: any 타입 사용을 극도로 지양하고, 모든 데이터 구조(특히 DB 스키마와 연결되는 부분)는 명확한 interface나 type으로 정의할 것.

모듈화 및 단일 책임 원칙 (SRP): 하나의 컴포넌트 파일이 200줄을 넘어가지 않도록, 기능별로 잘게 쪼개어 개발할 것.

보안 의식: 로그인 포털(login.digital-rescue.com)과 관련된 컴포넌트 작성 시, 항상 직급(Role) 기반의 권한 체크(Authorization) 로직을 포함할 것.

주석 작성: 복잡한 비즈니스 로직(예: 감가상각 반영 최소 견적 산출 로직)에는 반드시 한글로 상세한 주석을 달아줄 것.

5. 프로젝트 기본 폴더 구조 (Directory Structure)

/src
  /app
    /(main)                  # digital-rescue.com 라우트
      page.tsx
      /[brand]/page.tsx      # 브랜드별 동적 라우팅
    /(admin)                 # login.digital-rescue.com 라우트
      /dashboard/page.tsx
    /(cms)                   # edit.digital-rescue.com 라우트
  /components
    /common                  # 버튼, 입력창 등 공통 UI
    /layout                  # 헤더, 푸터, 네비게이션
    /brand                   # 브랜드별 특화 컴포넌트
  /lib                       # 유틸리티 함수 (견적 계산 공식 등)
  /types                     # TypeScript 타입 정의
  /prisma                    # DB 스키마 정의
