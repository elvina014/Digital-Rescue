import type { Metadata } from "next";

/**
 * 개인정보처리방침 (Click Guard MVP 출시 필수 고지)
 *
 * 목차는 개인정보보호위원회 「개인정보 처리방침 작성지침」의 표준 항목을 따른다.
 * 코드·설정에서 확인되지 않은 사실은 [대표 확인 필요] / [대표 입력]으로 남겨 두었다 — 공개 전에 대표가 채워야 한다.
 * (대상 목록: docs/click-guard/MVP1-REPORT.md "대표 확인 필요")
 */

export const metadata: Metadata = {
  title: "개인정보처리방침 | 디지털레스큐",
  description: "디지털레스큐 개인정보처리방침",
};

function Confirm({ children = "[대표 확인 필요]" }: { children?: string }) {
  return <mark className="rounded bg-amber-100 px-1 font-semibold text-amber-800">{children}</mark>;
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-slate-200 pt-8">
      <h2 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">{title}</h2>
      <div className="mt-4 space-y-3 text-[15px] leading-7 text-slate-700">{children}</div>
    </section>
  );
}

const TOC = [
  ["purpose", "1. 개인정보의 처리 목적"],
  ["items", "2. 처리하는 개인정보의 항목"],
  ["retention", "3. 개인정보의 처리 및 보유 기간"],
  ["provision", "4. 개인정보의 제3자 제공"],
  ["outsourcing", "5. 개인정보 처리업무의 위탁"],
  ["overseas", "6. 개인정보의 국외 이전"],
  ["destruction", "7. 개인정보의 파기 절차 및 방법"],
  ["rights", "8. 정보주체와 법정대리인의 권리·의무 및 행사방법"],
  ["security", "9. 개인정보의 안전성 확보조치"],
  ["cookies", "10. 개인정보 자동 수집 장치의 설치·운영 및 거부"],
  ["behavioral", "11. 행태정보의 수집·이용 및 거부"],
  ["officer", "12. 개인정보 보호책임자"],
  ["remedy", "13. 권익침해 구제방법"],
  ["changes", "14. 개인정보 처리방침의 변경"],
] as const;

const tableClass = "w-full min-w-[560px] border-collapse text-left text-sm";
const thClass = "border border-slate-200 bg-slate-50 px-3 py-2 font-semibold text-slate-800";
const tdClass = "border border-slate-200 px-3 py-2 align-top";

export default function PrivacyPage() {
  return (
    <div className="bg-white">
      <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 sm:py-20">
        <p className="text-sm font-semibold text-blue-600">디지털레스큐</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">개인정보처리방침</h1>
        <p className="mt-6 text-[15px] leading-7 text-slate-700">
          디지털레스큐(이하 &lsquo;회사&rsquo;)는 「개인정보 보호법」 제30조에 따라 정보주체의 개인정보를 보호하고 이와 관련한
          고충을 신속하고 원활하게 처리할 수 있도록 다음과 같이 개인정보 처리방침을 수립·공개합니다.
        </p>

        <nav aria-label="목차" className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <p className="text-sm font-semibold text-slate-800">목차</p>
          <ol className="mt-3 grid gap-1.5 text-sm text-slate-600 sm:grid-cols-2">
            {TOC.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="hover:text-blue-600 hover:underline">
                  {label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-10 space-y-10">
          <Section id="purpose" title="1. 개인정보의 처리 목적">
            <p>회사는 다음 목적을 위하여 개인정보를 처리하며, 목적이 변경되는 경우에는 「개인정보 보호법」 제18조에 따라 별도의 동의를 받는 등 필요한 조치를 이행합니다.</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li><strong>수리 상담 및 접수 응대</strong>: 온라인 접수 신청 확인, 상담·견적 안내 연락, 방문·택배 접수 일정 조율, 수리 진행 안내</li>
              <li><strong>광고 부정클릭 방지</strong>: 네이버 검색광고를 통해 접속한 기록을 분석하여 비정상적인 반복 클릭을 확인하고 대응</li>
            </ol>
          </Section>

          <Section id="items" title="2. 처리하는 개인정보의 항목">
            <p><strong>① 온라인 접수 시 입력 항목</strong></p>
            <ul className="list-disc space-y-1 pl-5">
              <li>필수: 이름, 휴대폰번호, 접수 방식, 기기 종류, 기기 브랜드, 고장 증상</li>
              <li>선택: 주소, 기기 모델명, 방문 예정 일시 또는 택배 접수 방식, 첨부 사진 및 사진 설명</li>
            </ul>
            <p><strong>② 네이버 검색광고를 통해 접속한 경우 자동으로 수집되는 항목</strong></p>
            <ul className="list-disc space-y-1 pl-5">
              <li>접속 IP 주소</li>
              <li>기기·브라우저 정보(브라우저 식별 문자열, 기기 구분)</li>
              <li>광고 유입 정보: 광고 매체, 검색어, 노출 순위, 광고 그룹·소재·키워드 식별값, 캠페인 유형, 키워드 일치 유형 등 네이버가 접속 주소에 붙이는 값</li>
              <li>방문 기록: 접속 일시, 접속 페이지, 이전 페이지 주소, 접속 국가, 체류 시간, 스크롤 정도, 클릭·입력 횟수, 페이지 이동 수, 전화·카카오톡·접수 버튼 클릭 여부</li>
              <li>쿠키: cg_sid (광고 유입 방문을 묶기 위한 임의 식별값, 30분 후 만료)</li>
            </ul>
            <p><strong>③ 모든 방문자에 대해 자동으로 수집되는 항목</strong></p>
            <ul className="list-disc space-y-1 pl-5">
              <li>전화·카카오톡·접수 버튼 클릭 기록: 클릭 위치, 페이지 경로, 기기 구분(모바일/PC), 브라우저 탭 단위 임의 식별값, 처음 접속한 유입 경로(광고 출처·검색어·이전 사이트)</li>
            </ul>
          </Section>

          <Section id="retention" title="3. 개인정보의 처리 및 보유 기간">
            <p>회사는 법령에 따른 보유·이용 기간 또는 정보주체로부터 동의받은 기간 내에서 개인정보를 처리·보유합니다.</p>
            <div className="overflow-x-auto">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={thClass}>구분</th>
                    <th className={thClass}>보유 기간</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className={tdClass}>네이버 검색광고 접속·방문 기록 (2-②)</td>
                    <td className={tdClass}>수집일로부터 90일 (경과 시 매일 자동 삭제)</td>
                  </tr>
                  <tr>
                    <td className={tdClass}>온라인 접수 정보 (2-①)</td>
                    <td className={tdClass}><Confirm /></td>
                  </tr>
                  <tr>
                    <td className={tdClass}>버튼 클릭 기록 (2-③)</td>
                    <td className={tdClass}><Confirm /></td>
                  </tr>
                  <tr>
                    <td className={tdClass}>관계 법령에 따라 보존이 필요한 정보</td>
                    <td className={tdClass}><Confirm /></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>

          <Section id="provision" title="4. 개인정보의 제3자 제공">
            <p>
              회사는 정보주체의 개인정보를 제1조의 목적 범위 내에서만 처리하며, 정보주체의 동의, 법률의 특별한 규정 등
              「개인정보 보호법」 제17조 및 제18조에 해당하는 경우에만 개인정보를 제3자에게 제공합니다.
            </p>
            <p>현재 제3자 제공 현황: <Confirm /></p>
          </Section>

          <Section id="outsourcing" title="5. 개인정보 처리업무의 위탁">
            <p>회사는 원활한 서비스 제공을 위하여 다음과 같이 개인정보 처리업무를 위탁하고 있습니다.</p>
            <div className="overflow-x-auto">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={thClass}>수탁자</th>
                    <th className={thClass}>위탁 업무</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className={tdClass}>Vercel Inc.</td>
                    <td className={tdClass}>홈페이지 호스팅 및 접속 처리</td>
                  </tr>
                  <tr>
                    <td className={tdClass}>Supabase Inc.</td>
                    <td className={tdClass}>데이터베이스 및 첨부 사진 저장</td>
                  </tr>
                  <tr>
                    <td className={tdClass}>접수 알림 자동화 서버 운영 주체 <Confirm /></td>
                    <td className={tdClass}>신규 접수 알림 (이름·연락처 등 접수 내용 전달)</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              회사는 위탁계약 체결 시 「개인정보 보호법」 제26조에 따라 위탁업무 수행 목적 외 개인정보 처리 금지, 안전성 확보조치,
              재위탁 제한, 수탁자에 대한 관리·감독, 손해배상 등 책임에 관한 사항을 계약서 등 문서에 명시하고, 수탁자가 개인정보를
              안전하게 처리하는지를 감독합니다. 위탁업무의 내용이나 수탁자가 변경될 경우에는 지체 없이 본 개인정보 처리방침을 통하여 공개합니다.
            </p>
          </Section>

          <Section id="overseas" title="6. 개인정보의 국외 이전">
            <p>회사는 제5조의 위탁 업무 수행을 위하여 다음과 같이 개인정보를 국외 사업자에게 이전(처리위탁·보관)할 수 있습니다.</p>
            <div className="overflow-x-auto">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={thClass}>이전받는 자</th>
                    <th className={thClass}>이전 국가(서버 위치)</th>
                    <th className={thClass}>이전 항목</th>
                    <th className={thClass}>이전 일시·방법</th>
                    <th className={thClass}>보유·이용 기간</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className={tdClass}>Vercel Inc.</td>
                    <td className={tdClass}><Confirm /></td>
                    <td className={tdClass}>제2조의 항목</td>
                    <td className={tdClass}>홈페이지 이용 시 네트워크를 통해 전송</td>
                    <td className={tdClass}>제3조의 보유 기간 또는 위탁계약 종료 시까지</td>
                  </tr>
                  <tr>
                    <td className={tdClass}>Supabase Inc.</td>
                    <td className={tdClass}><Confirm /></td>
                    <td className={tdClass}>제2조의 항목</td>
                    <td className={tdClass}>접수·방문 기록 저장 시 네트워크를 통해 전송</td>
                    <td className={tdClass}>제3조의 보유 기간 또는 위탁계약 종료 시까지</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>국외 이전을 원하지 않는 경우: <Confirm /></p>
          </Section>

          <Section id="destruction" title="7. 개인정보의 파기 절차 및 방법">
            <p>회사는 개인정보 보유기간의 경과, 처리목적 달성 등 개인정보가 불필요하게 되었을 때에는 지체 없이 해당 개인정보를 파기합니다.</p>
            <p>법령에 따라 개인정보를 계속 보존하여야 하는 경우에는 해당 개인정보를 별도로 분리하여 보관합니다.</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>전자적 파일 형태의 정보는 복구할 수 없는 방법으로 삭제합니다. 네이버 검색광고 접속·방문 기록은 매일 자동 삭제 작업으로 파기합니다.</li>
              <li>종이 문서에 기록된 개인정보는 분쇄하거나 소각하여 파기합니다.</li>
            </ul>
          </Section>

          <Section id="rights" title="8. 정보주체와 법정대리인의 권리·의무 및 행사방법">
            <p>정보주체는 회사에 대해 언제든지 개인정보 열람·정정·삭제·처리정지 요구 등의 권리를 행사할 수 있습니다.</p>
            <p>
              권리 행사는 서면, 전화(대표전화 1544-9814), 카카오톡 채널 등을 통하여 하실 수 있으며, 회사는 이에 대해 지체 없이 조치하겠습니다.
              정보주체의 법정대리인이나 위임을 받은 자 등 대리인을 통하여도 권리를 행사할 수 있습니다.
            </p>
            <p>
              개인정보 열람 및 처리정지 요구는 「개인정보 보호법」 제35조 제4항, 제37조 제2항에 의하여 제한될 수 있으며, 다른 법령에서 그
              개인정보가 수집 대상으로 명시되어 있는 경우에는 그 삭제를 요구할 수 없습니다.
            </p>
          </Section>

          <Section id="security" title="9. 개인정보의 안전성 확보조치">
            <p>회사는 개인정보의 안전성 확보를 위해 다음과 같은 조치를 하고 있습니다.</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>접근 권한 관리: 개인정보를 처리하는 관리 시스템은 로그인한 직원만 이용할 수 있으며, 직원 역할에 따라 접근 범위를 제한합니다.</li>
              <li>전송 구간 암호화: 홈페이지와 관리 시스템은 암호화 통신(HTTPS)으로 운영합니다.</li>
              <li>관리적 조치(내부관리계획 수립·시행, 직원 교육 등): <Confirm /></li>
            </ul>
          </Section>

          <Section id="cookies" title="10. 개인정보 자동 수집 장치의 설치·운영 및 거부">
            <p>회사는 다음과 같이 쿠키 및 브라우저 저장소를 사용합니다.</p>
            <div className="overflow-x-auto">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={thClass}>이름</th>
                    <th className={thClass}>용도</th>
                    <th className={thClass}>보관 기간</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className={tdClass}>cg_sid (쿠키)</td>
                    <td className={tdClass}>네이버 검색광고로 접속한 경우에만 설정. 같은 방문의 기록을 묶어 부정클릭 여부를 판단</td>
                    <td className={tdClass}>30분</td>
                  </tr>
                  <tr>
                    <td className={tdClass}>브라우저 세션 저장소(sessionStorage)</td>
                    <td className={tdClass}>버튼 클릭 기록과 광고 유입 방문 측정을 위한 임의 식별값·측정값</td>
                    <td className={tdClass}>브라우저 탭을 닫을 때까지</td>
                  </tr>
                  <tr>
                    <td className={tdClass}>Google 광고 태그 쿠키</td>
                    <td className={tdClass}><Confirm /></td>
                    <td className={tdClass}><Confirm /></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              <strong>거부 방법</strong>: 웹 브라우저 설정에서 쿠키 저장을 거부하거나 저장된 쿠키를 삭제할 수 있습니다.
              (예: Chrome — 설정 &gt; 개인정보 보호 및 보안 &gt; 서드파티 쿠키 / 인터넷 사용 기록 삭제, Edge — 설정 &gt; 쿠키 및 사이트 권한,
              Safari — 설정 &gt; 개인정보 보호) 쿠키 저장을 거부하더라도 홈페이지 이용과 상담 신청에는 지장이 없습니다.
            </p>
          </Section>

          <Section id="behavioral" title="11. 행태정보의 수집·이용 및 거부">
            <p>
              회사 홈페이지에는 Google LLC의 광고 태그(Google Ads)가 설치되어 있어, 방문 및 이용 기록 등 행태정보가 Google에 의해
              수집될 수 있습니다.
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>수집 목적·항목·보유 기간: <Confirm /></li>
              <li>거부 방법: 브라우저의 쿠키 설정(제10조) 또는 Google 광고 설정에서 맞춤 광고를 끌 수 있습니다.</li>
            </ul>
          </Section>

          <Section id="officer" title="12. 개인정보 보호책임자">
            <p>회사는 개인정보 처리에 관한 업무를 총괄해서 책임지고, 관련 불만 처리 및 피해 구제를 위하여 아래와 같이 개인정보 보호책임자를 지정하고 있습니다.</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>성명: <Confirm>[대표 입력]</Confirm></li>
              <li>직책: <Confirm>[대표 입력]</Confirm></li>
              <li>연락처: <Confirm>[대표 입력]</Confirm></li>
            </ul>
            <p>개인정보 관련 문의·불만·피해 구제 요청은 개인정보 보호책임자 또는 대표전화(1544-9814)로 하실 수 있습니다.</p>
          </Section>

          <Section id="remedy" title="13. 권익침해 구제방법">
            <p>정보주체는 개인정보 침해로 인한 구제를 받기 위하여 아래 기관에 분쟁 해결이나 상담 등을 신청할 수 있습니다.</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>개인정보분쟁조정위원회: (국번없이) 1833-6972 (www.kopico.go.kr)</li>
              <li>개인정보침해신고센터: (국번없이) 118 (privacy.kisa.or.kr)</li>
              <li>대검찰청: (국번없이) 1301 (www.spo.go.kr)</li>
              <li>경찰청: (국번없이) 182 (ecrm.police.go.kr)</li>
            </ul>
          </Section>

          <Section id="changes" title="14. 개인정보 처리방침의 변경">
            <p>이 개인정보 처리방침은 <Confirm /> 부터 적용됩니다.</p>
          </Section>
        </div>
      </div>
    </div>
  );
}
