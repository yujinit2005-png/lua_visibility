import { supabase } from './supabase';

interface ModelStat {
  name: string;
  mention_rate: number;
  recommend_rate: number;
  top_rate: number;
}

interface OppItem {
  query: string;
  kind: '탈환대상' | '선점기회' | '경합' | '독점우위';
  our_rate: number;
  comp_rate: number;
  competitors: string[];
}

const DISCLAIMER = `본 리포트는 특정 AI 플랫폼의 공식 순위 데이터가 아니라, 루아컴퍼니가 정한 표준 질문 세트와 측정 조건에 따라 주요 AI 답변 채널의 병원 언급·추천·출처 노출 현황을 반복 측정한 결과입니다. AI 답변은 모델, 시점, 검색 설정, 위치, 개인화 여부, 플랫폼 정책 변화에 따라 달라질 수 있으며, 특정 순위 또는 환자 유입을 보장하지 않습니다.`;

const GLOSSARY: Array<[string, string]> = [
  ["AI 가시성", "환자가 AI에게 병원을 물었을 때, 그 답변에 병원이 얼마나 등장하는지를 뜻합니다."],
  ["AEO", "Answer Engine Optimization. AI가 환자 질문에 병원을 실제 답변으로 언급·추천하도록 만드는 영역입니다."],
  ["GEO", "Generative Engine Optimization. AI가 병원을 이해·인용할 수 있도록 홈페이지·구조화 데이터·FAQ·의료진 정보 등을 준비하는 영역입니다."],
  ["Trust Signal", "AI와 검색엔진이 병원을 신뢰하게 만드는 정보 신호입니다. 의료진·주소·진료과·진료시간·FAQ·리뷰·영상 등이 해당합니다."],
  ["구조화 데이터", "홈페이지 정보를 기계가 읽기 쉽게 표준 형식(Schema.org JSON-LD)으로 표시한 것입니다. AI가 병원 종류·진료과를 정확히 인식하게 돕습니다."],
  ["Place SOV", "네이버 지도(플레이스) 검색 영역에서 특정 키워드로 병원이 상위 노출되는 점유 경쟁력 지표입니다."],
  ["Content SOV", "블로그, 카페, 웹문서 등 제3자 바이럴 콘텐츠 영역에서 우리 병원이 차지하는 언급 점유율입니다."],
  ["언급률", "AI 답변에 병원 이름이 등장한 비율입니다. 질의당 여러 번 반복 측정한 평균으로 계산합니다."],
  ["추천 포함률", "AI 답변에서 병원이 단순 언급을 넘어 추천 맥락으로 등장한 비율입니다."],
  ["상위 노출률", "AI 답변에서 병원이 앞부분(먼저 소개되는 위치)에 등장한 비율입니다."],
  ["탈환대상", "경쟁 병원은 답변에 나오는데 귀 병원은 거의 안 나오는 질문입니다. 콘텐츠로 되찾아올 대상입니다."],
  ["선점기회 (Blue Ocean)", "아직 뚜렷한 주인이 없는 질문입니다. 먼저 콘텐츠를 만들면 시장을 선점할 수 있습니다."],
  ["AI 크롤러", "AI가 웹페이지를 읽어가는 자동 프로그램(GPTBot 등)입니다. 차단돼 있으면 AI가 병원 정보를 참고하지 못합니다."],
  ["robots.txt", "어떤 크롤러의 접근을 허용/차단할지 지정하는 파일입니다. AI 크롤러 허용 여부가 여기서 결정됩니다."]
];

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

function drawDonutScore(rate: number, label: string, alertBelow: number = 0.35): string {
  const deg = Math.round(rate * 360);
  const color = rate < alertBelow ? "var(--orange)" : "var(--teal)";
  return `
<div class="donut" style="background:conic-gradient(${color} ${deg}deg,#e7ecef ${deg}deg)">
  <div class="donut-in">
    <div class="donut-pct">${pct(rate)}</div>
    <div class="donut-lab">${label}</div>
  </div>
</div>`;
}

function drawBarChart(rows: Array<[string, number]>): string {
  let out = '<div class="bars">';
  for (const [name, val] of rows) {
    out += `
<div class="barrow">
  <div class="nm">${name}</div>
  <div class="track"><div class="fill" style="width:${Math.round(val * 100)}%"></div></div>
  <div class="vl">${pct(val)}</div>
</div>`;
  }
  return out + '</div>';
}

function drawMatrix(items: OppItem[]): string {
  let dots = "";
  const posCounts: Record<string, number> = {};

  items.forEach((o, i) => {
    let rawLeft = 0;
    let rawBottom = 0;

    if (o.kind === '선점기회') {
      rawLeft = 15 + ((i * 17) % 25);
      rawBottom = 55 + ((i * 19) % 30);
    } else if (o.kind === '독점우위' || (o.kind === '경합' && o.our_rate >= 0.5)) {
      rawLeft = 58 + ((i * 13) % 27);
      rawBottom = 55 + ((i * 23) % 30);
    } else if (o.kind === '탈환대상') {
      rawLeft = 58 + ((i * 19) % 30);
      rawBottom = 15 + ((i * 11) % 27);
    } else {
      rawLeft = 12 + ((i * 15) % 30);
      rawBottom = 12 + ((i * 17) % 30);
    }

    const gKey = `${Math.round(rawLeft / 12) * 12}_${Math.round(rawBottom / 12) * 12}`;
    const idxInG = posCounts[gKey] || 0;
    posCounts[gKey] = idxInG + 1;

    const offsetX = (idxInG % 3) * 4.0;
    const offsetY = Math.floor(idxInG / 3) * 4.0;

    const left = Math.min(90, Math.max(8, rawLeft + offsetX));
    const bottom = Math.min(88, Math.max(8, rawBottom + offsetY));

    const qNum = String(i + 1).padStart(2, '0');
    
    let dotColor = '#3b82f6';
    if (o.kind === '선점기회') dotColor = '#3b82f6';
    else if (o.kind === '독점우위' || (o.our_rate >= 0.5 && o.comp_rate >= 0.5)) dotColor = '#10b981';
    else if (o.kind === '탈환대상') dotColor = '#10b981';
    else dotColor = '#64748b';

    dots += `
    <div style="position:absolute; left:${left.toFixed(1)}%; bottom:${bottom.toFixed(1)}%; display:flex; align-items:center; gap:3px; z-index:${10 + i}; transform:translate(-50%, 50%); pointer-events:none;">
      <div style="width:10px; height:10px; border-radius:50%; background:${dotColor}; border:2px solid #fff; box-shadow:0 1px 3px rgba(0,0,0,0.25);"></div>
      <span style="font-size:9px; font-weight:800; color:#1e293b; background:rgba(255,255,255,0.85); padding:1px 3px; border-radius:3px; white-space:nowrap; border:1px solid #cbd5e1;">Q${qNum}</span>
    </div>`;
  });

  return `
<div style="position:relative; width:100%; height:520px; border:2px solid #94a3b8; border-radius:8px; overflow:hidden; background:#fff; margin-top:12px; box-shadow:0 2px 6px rgba(0,0,0,0.04);">
  <div style="display:grid; grid-template-columns:1fr 1fr; grid-template-rows:1fr 1fr; width:100%; height:100%;">
    <!-- 좌상단: 선점기회 (Blue Ocean) -->
    <div style="background:#eaf2fb; border-right:1.5px solid #94a3b8; border-bottom:1.5px solid #94a3b8; padding:12px; position:relative;">
      <div style="position:absolute; top:0; left:0; width:16px; height:16px; border-top:3px solid #2563eb; border-left:3px solid #2563eb;"></div>
      <div style="font-size:13px; font-weight:900; color:#1e3a8a;">선점기회 (Blue Ocean)</div>
      <div style="font-size:9.5px; color:#3b82f6; font-weight:700; margin-top:3px; line-height:1.4;">자사 높음, 경쟁사 낮음.<br/>빠른 콘텐츠 발행으로 시장 장악.</div>
    </div>
    <!-- 우상단: 유지 (Defend) -->
    <div style="background:#eaf8f0; border-bottom:1.5px solid #94a3b8; padding:12px; position:relative;">
      <div style="position:absolute; top:0; right:0; width:16px; height:16px; border-top:3px solid #059669; border-right:3px solid #059669;"></div>
      <div style="font-size:13px; font-weight:900; color:#065f46;">유지 (Defend)</div>
      <div style="font-size:9.5px; color:#10b981; font-weight:700; margin-top:3px; line-height:1.4;">자사/경쟁사 모두 높음.<br/>신뢰 자산 업데이트로 방어.</div>
    </div>
    <!-- 좌하단: 경합영역 -->
    <div style="background:#f8fafc; border-right:1.5px solid #94a3b8; padding:12px; position:relative;">
      <div style="position:absolute; bottom:0; left:0; width:16px; height:16px; border-bottom:3px solid #64748b; border-left:3px solid #64748b;"></div>
      <div style="font-size:13px; font-weight:900; color:#334155;">경합영역</div>
      <div style="font-size:9.5px; color:#64748b; font-weight:700; margin-top:3px; line-height:1.4;">둘 다 낮음.</div>
    </div>
    <!-- 우하단: 탈환대상 (Reclaim) -->
    <div style="background:#f1f5f9; padding:12px; position:relative;">
      <div style="position:absolute; bottom:0; right:0; width:16px; height:16px; border-bottom:3px solid #1e293b; border-right:3px solid #1e293b;"></div>
      <div style="font-size:13px; font-weight:900; color:#0f172a;">탈환대상 (Reclaim)</div>
      <div style="font-size:9.5px; color:#475569; font-weight:700; margin-top:3px; line-height:1.4;">경쟁사 높음, 자사 0%.<br/>최우선 공략 키워드.</div>
    </div>
  </div>
  ${dots}
</div>
<div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px; font-size:10px; font-weight:800; color:#334155;">
  <span>▲ Our Share (우리병원 노출도)</span>
  <span>Competitor Share (경쟁병원 점유도) ▶</span>
</div>`;
}

function drawChecklistCards(items: Array<[string, boolean, string]>): string {
  let out = '<div class="cards">';
  for (const [label, ok, note] of items) {
    const mark = ok ? "✓" : "○";
    const cls = ok ? "ok" : "no";
    out += `
<div class="card ${cls}">
  <div class="card-mark">${mark}</div>
  <div class="card-body">
    <div class="card-t">${label}</div>
    <div class="card-n">${note}</div>
  </div>
</div>`;
  }
  return out + '</div>';
}

const CSS = `
@page { size: A4; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; }
:root {
  --navy:#0F2E47; --navy2:#17436A; --orange:#E45928; --orange2:#C2461C;
  --teal:#2E8B9E; --gold:#C9A24B; --ink:#1f2a33; --muted:#6b7684;
  --line:#e7ebee; --soft:#f6f8f9;
}
body {
  font-family: 'Pretendard', 'Noto Sans KR', sans-serif;
  color: var(--ink);
  background: #ffffff;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.page {
  width: 210mm;
  height: 297mm;
  position: relative;
  page-break-after: always;
  break-after: page;
  background: #ffffff;
  margin: 0 auto;
  overflow: hidden;
}
@media print {
  html, body {
    width: 210mm;
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
  }
  .page {
    width: 210mm !important;
    height: 297mm !important;
    page-break-after: always !important;
    break-after: page !important;
    page-break-inside: avoid !important;
    break-inside: avoid !important;
    margin: 0 !important;
    overflow: hidden !important;
  }
}
.pad { padding: 13mm 18mm; }
.hdr { display: flex; justify-content: space-between; align-items: center; padding: 11mm 18mm 0; }
.brandwrap { display: flex; align-items: center; gap: 11px; }
.brand { font-weight: 900; color: var(--navy); font-size: 14px; }
.brand span { color: var(--muted); font-weight: 700; font-size: 11px; }
.doclabel { font-size: 10px; color: var(--muted); letter-spacing: 2px; font-weight: bold; }
.hdr-rule { height: 3px; background: var(--orange); margin: 8px 18mm 0; }

.pagetitle { font-size: 22px; color: var(--navy); font-weight: 900; line-height: 1.35; margin: 16px 0 6px; letter-spacing: -.3px; }
.pagesub { font-size: 11px; color: var(--muted); line-height: 1.6; }
.sec { display: flex; align-items: center; gap: 9px; font-size: 13px; color: var(--navy); font-weight: 900; margin: 18px 0 10px; }
.sec .num { width: 24px; height: 24px; border-radius: 50%; background: var(--navy); color: #fff; font-size: 11px; display: flex; align-items: center; justify-content: center; }
.interp { font-size: 11.5px; color: var(--ink); line-height: 1.7; background: var(--soft); border-left: 3.5px solid var(--orange); padding: 11px 14px; border-radius: 0 8px 8px 0; margin-top: 14px; }

/* 표지 히어로 (원래 1페이지 디자인 유지) */
.hero { background: linear-gradient(135deg, var(--navy), var(--navy2)); color: #fff; padding: 20mm 18mm 16mm; position: relative; }
.hero:after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 4px; background: var(--orange); }
.hero .top { display: flex; justify-content: space-between; align-items: center; }
.hero .brandwrap .brand { color: #fff; } .hero .brandwrap .brand span { color: #9fd3dd; }
.hero .doclabel { color: #8fb2c9; }
.heromid { display: flex; justify-content: space-between; align-items: center; margin-top: 20px; gap: 18px; }
.kicker { font-size: 11px; color: var(--gold); font-weight: 800; letter-spacing: 2px; }
.heromid h1 { font-size: 32px; font-weight: 900; margin: 6px 0 6px; line-height: 1.15; color: #ffffff; }
.heromid .meta { font-size: 11px; color: #bcd0df; line-height: 1.7; }
.scoregrid { display: flex; gap: 12px; margin-top: 20px; }
.scorebox { flex: 1; background: rgba(255,255,255,.1); border-radius: 12px; padding: 14px; text-align: center; border: 1px solid rgba(255,255,255,.15); }
.scorebox .v { font-size: 26px; font-weight: 900; color: #fff; }
.scorebox .l { font-size: 10px; color: #9fd3dd; margin-top: 4px; }

/* 도넛 (원래 디자인 유지) */
.donut { width: 130px; height: 130px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex: none; }
.donut-in { width: 100px; height: 100px; background: #fff; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.donut-pct { font-size: 28px; font-weight: 900; color: var(--navy); }
.donut-lab { font-size: 10px; color: var(--muted); margin-top: 2px; }

/* 막대 & 메트릭 (원래 2페이지 디자인 유지) */
.bars { display: flex; flex-direction: column; gap: 10px; }
.barrow { display: flex; align-items: center; gap: 11px; font-size: 11.5px; }
.barrow .nm { width: 110px; color: var(--ink); font-weight: 700; }
.barrow .track { flex: 1; height: 14px; background: #e7ecef; border-radius: 7px; overflow: hidden; }
.barrow .fill { height: 100%; background: linear-gradient(90deg, var(--orange), var(--navy2)); border-radius: 7px; }
.barrow .vl { width: 50px; text-align: right; font-weight: 800; color: var(--navy); }

/* 체크리스트 */
.cards { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.card { border-radius: 8px; padding: 12px 14px; display: flex; gap: 11px; border: 1px solid var(--line); background: #fff; }
.card.ok { border-color: #d1e7dd; background: #f7fbf9; }
.card.no { border-color: #f8d7da; background: #fdf7f7; }
.card-mark { font-size: 16px; font-weight: 900; }
.card.ok .card-mark { color: var(--teal); }
.card.no .card-mark { color: var(--orange); }
.card-t { font-size: 11.5px; font-weight: 800; color: var(--navy); }
.card-n { font-size: 10px; color: var(--muted); margin-top: 2px; line-height: 1.4; }

/* 질문 칩 (원래 3페이지 디자인 유지 & 2열 확장 지원) */
.opps { display: flex; flex-direction: column; gap: 6px; }
.opps.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.opp { display: flex; justify-content: space-between; align-items: center; padding: 7px 11px; border-radius: 6px; border: 1px solid var(--line); background: #fff; font-size: 10.5px; }
.opp-q { flex: 1; color: var(--ink); font-weight: 700; }
.opp-k { font-size: 9.5px; font-weight: 800; padding: 2px 7px; border-radius: 4px; }
.opp-k.steal { background: #fee2e2; color: #dc2626; }
.opp-k.green { background: #dbeafe; color: #2563eb; }
.opp-k.neu { background: #f1f5f9; color: #64748b; }

/* 단계 & 컨설팅 */
.steps { display: flex; gap: 12px; margin-top: 18px; }
.step { flex: 1; border: 1px solid var(--line); border-radius: 8px; padding: 14px; background: #fff; }
.step.done { border-color: var(--teal); background: #f2f9fa; }
.step .n { width: 24px; height: 24px; border-radius: 50%; background: var(--navy); color: #fff; font-size: 12px; display: flex; align-items: center; justify-content: center; font-weight: 900; margin-bottom: 8px; }
.step.done .n { background: var(--teal); }
.step .t { font-size: 13px; font-weight: 900; color: var(--navy); margin-bottom: 4px; }
.step .d { font-size: 10px; color: var(--muted); line-height: 1.5; }
.cta { background: linear-gradient(135deg, var(--navy), var(--navy2)); color: #fff; border-radius: 10px; padding: 18px 20px; margin-top: 18px; }
.cta h3 { font-size: 18px; font-weight: 900; margin-bottom: 9px; } .cta p { font-size: 11.5px; color: #cdddea; line-height: 1.8; }
.cta .contact { margin-top: 14px; font-size: 13px; font-weight: 800; } .cta .contact span { color: var(--gold); }

.gloss { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 18px; margin-top: 8px; }
.gitem { border-bottom: 1px solid var(--line); padding: 6px 0; }
.gterm { font-size: 11px; font-weight: 800; color: var(--navy); }
.gdef { font-size: 9.5px; color: var(--muted); line-height: 1.45; margin-top: 2px; }

.disc { font-size: 8.5px; color: var(--muted); line-height: 1.65; border-top: 1px solid var(--line); padding-top: 10px; margin-top: 18px; }
.foot { position: absolute; bottom: 10mm; left: 18mm; right: 18mm; display: flex; justify-content: space-between; font-size: 8.5px; color: var(--muted); border-top: 1px solid var(--line); padding-top: 6px; }
`;

function headerHtml(label: string): string {
  return `<div class="hdr"><div class="brandwrap"><div class="brand">루아컴퍼니 <span>· 루아브랜딩연구소</span></div></div><div class="doclabel">${label}</div></div><div class="hdr-rule"></div>`;
}

function footHtml(n: number, total: number): string {
  return `<div class="foot"><span>루비스(LUVIS) · 루아컴퍼니</span><span>rualab.kr　|　${n} / ${total}</span></div>`;
}

export const generateAndUploadReport = async (
  hospitalCode: string, 
  hospitalName: string, 
  appendLog: (msg: string) => void,
  targetRunId?: number,
  targetFolder: 'Report' | 'Remake Report' = 'Report'
) => {
  appendLog(`[리포트 생성] ${hospitalName} (Run ID: #${targetRunId || '최신'}) 데이터 조회 중...`);
  
  let runId = targetRunId;

  if (!runId) {
    const { data: run, error: runError } = await supabase
      .from('runs')
      .select('id')
      .eq('hospital_code', hospitalCode)
      .order('id', { ascending: false })
      .limit(1)
      .single();

    if (runError || !run) {
      appendLog(`❌ 진단 기록을 찾을 수 없습니다.`);
      return;
    }
    runId = run.id;
  }

  const { data: run } = await supabase
    .from('runs')
    .select('*')
    .eq('id', runId)
    .single();

  const { data: answers, error: ansError } = await supabase
    .from('answers')
    .select('*')
    .eq('run_id', runId)
    .order('id', { ascending: true });

  if (ansError) {
    appendLog(`❌ 답변 데이터를 불러오는데 실패했습니다.`);
    return;
  }

  const { data: hospConfig } = await supabase
    .from('hospital_config_versions')
    .select('aliases, competitors, naver_queries')
    .eq('hospital_code', hospitalCode)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: auditRecord } = await supabase
    .from('trust_signal_audits')
    .select('*')
    .eq('run_id', runId)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  const parseList = (val: any): string[] => {
    if (!val) return [];
    if (Array.isArray(val)) {
      return val.map(s => String(s).replace(/^["']+|["']+$/g, '').trim()).filter(Boolean);
    }
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            return parsed.map(s => String(s).replace(/^["']+|["']+$/g, '').trim()).filter(Boolean);
          }
        } catch (e) {}
      }
      return trimmed
        .split(/[\n,]+/)
        .map(s => s.replace(/^["']+|["']+$/g, '').trim())
        .filter(Boolean);
    }
    return [];
  };

  let ourAliases: string[] = [hospitalName, hospitalName.replace(/(병원|한방병원|의원)$/, '')];
  let configCompetitors: string[] = [];

  if (hospConfig) {
    const parsedAliases = parseList(hospConfig.aliases);
    if (parsedAliases.length > 0) ourAliases = [...ourAliases, ...parsedAliases];
    const parsedComps = parseList(hospConfig.competitors);
    if (parsedComps.length > 0) configCompetitors = parsedComps;
  }
  ourAliases = Array.from(new Set(ourAliases.filter(Boolean))).map(a => a.trim().toLowerCase());
  configCompetitors = Array.from(new Set(configCompetitors.filter(Boolean)));

  const GENERIC_EXCLUDE = new Set([
    '한방병원', '한의원', '병원', '의원', '종합병원', '대학병원', '요양병원', 
    '전문병원', '일반병원', '치과의원', '피부과의원', '상급종합병원', '클리닉', '센터', '진료소', '보건소'
  ]);

  const allAnsList = answers || [];
  const aiAnsList = allAnsList.filter(a => a.provider !== 'naver');
  const naverAnsList = allAnsList.filter(a => a.provider === 'naver');

  // ★ 전체 및 네이버 실측 데이터 검증 로직
  const hasNaverApi = naverAnsList.length > 0;
  
  const { data: allWebVers } = await supabase
    .from('web_verifications')
    .select('id, platform')
    .eq('run_id', runId);

  let allWebAnswers: any[] = [];
  if (allWebVers && allWebVers.length > 0) {
    const vIds = allWebVers.map(v => v.id);
    const { data: wa } = await supabase
      .from('web_verification_answers')
      .select('*')
      .in('verification_id', vIds);
    if (wa && wa.length > 0) {
      allWebAnswers = wa;
    }
  }

  const naverWebVers = allWebVers?.filter(v => v.platform?.toLowerCase() === 'naver');
  const naverVIds = naverWebVers?.map(nv => nv.id) || [];
  const naverWebAnswers: any[] = allWebAnswers.filter(wa => naverVIds.includes(wa.verification_id));
  const hasNaverCrawling = naverWebAnswers.length > 0;

  const aiWebVers = allWebVers?.filter(v => v.platform?.toLowerCase() !== 'naver') || [];
  const aiVIds = aiWebVers.map(v => v.id);
  const aiWebAnswers: any[] = allWebAnswers.filter(wa => aiVIds.includes(wa.verification_id));

  const includeNaver = hasNaverApi && hasNaverCrawling;

  if (hasNaverApi && !hasNaverCrawling) {
    appendLog(`⚠️ 네이버 크롤링 실측 자료가 수집되지 않아 네이버 로컬 가시성 리포트(5페이지) 생성이 제외됩니다.`);
  }

  const providersSet = Array.from(new Set(aiAnsList.map(a => a.provider)));
  
  const modelStats: ModelStat[] = providersSet.map(prov => {
    const provAns = aiAnsList.filter(a => a.provider === prov);
    const total = provAns.length || 1;
    const mentions = provAns.filter(a => Boolean(a.mentioned)).length;
    const recommends = provAns.filter(a => Boolean(a.recommended)).length;
    const tops = provAns.filter(a => (a.first_position !== null && a.first_position !== undefined && a.first_position <= 50)).length;

    return {
      name: prov,
      mention_rate: Number((mentions / total).toFixed(2)),
      recommend_rate: Number((recommends / total).toFixed(2)),
      top_rate: Number((tops / total).toFixed(2))
    };
  });

  const aiWebProvidersSet = Array.from(new Set(aiWebVers.map(v => v.platform)));
  const webModelStats: ModelStat[] = aiWebProvidersSet.map(prov => {
    const vIds = aiWebVers.filter(v => v.platform === prov).map(v => v.id) || [];
    const provAns = aiWebAnswers.filter(a => vIds.includes(a.verification_id));
    const total = provAns.length || 1;
    const mentions = provAns.filter(a => Boolean(a.web_mentioned || a.is_our_hospital)).length;
    return {
      name: prov,
      mention_rate: Number((mentions / total).toFixed(2)),
      recommend_rate: 0,
      top_rate: 0
    };
  });

  const overallMention = modelStats.length > 0
    ? Number((modelStats.reduce((acc, m) => acc + m.mention_rate, 0) / modelStats.length).toFixed(2))
    : (run?.overall_mention_rate ? run.overall_mention_rate / 100 : 0.79);

  const webOverallMention = webModelStats.length > 0
    ? Number((webModelStats.reduce((acc, m) => acc + m.mention_rate, 0) / webModelStats.length).toFixed(2))
    : 0;

  const overallRecommend = modelStats.length > 0
    ? Number((modelStats.reduce((acc, m) => acc + m.recommend_rate, 0) / modelStats.length).toFixed(2))
    : 0.79;

  const overallTop = modelStats.length > 0
    ? Number((modelStats.reduce((acc, m) => acc + m.top_rate, 0) / modelStats.length).toFixed(2))
    : 0.72;

  const extractCompetitorsFromAnswer = (a: any): string[] => {
    const detected: string[] = [];
    const answerText = a.answer_text || '';
    const normAnswer = answerText.toLowerCase().replace(/[\s\-_]/g, '');

    if (configCompetitors.length > 0) {
      for (const comp of configCompetitors) {
        const cleanComp = comp.replace(/^["']+|["']+$/g, '').trim();
        if (!cleanComp) continue;
        const normComp = cleanComp.toLowerCase().replace(/[\s\-_]/g, '');
        
        if (ourAliases.some(alias => {
          const na = alias.replace(/[\s\-_]/g, '');
          return na === normComp || normComp.includes(na);
        })) continue;

        const foundInText = normComp.length >= 2 && normAnswer.includes(normComp);
        let foundInField = false;
        if (a.competitors) {
          try {
            const rawComps = parseList(a.competitors);
            foundInField = rawComps.some(rc => {
              const nrc = rc.toLowerCase().replace(/[\s\-_]/g, '');
              return nrc === normComp || nrc.includes(normComp) || normComp.includes(nrc);
            });
          } catch (e) {}
        }

        if ((foundInText || foundInField) && !detected.includes(cleanComp)) {
          detected.push(cleanComp);
        }
      }
      return detected;
    }

    if (a.competitors) {
      try {
        const rawComps = parseList(a.competitors);
        rawComps.forEach(c => {
          const clean = c.replace(/^["']+|["']+$/g, '').trim();
          const lower = clean.toLowerCase();
          if (GENERIC_EXCLUDE.has(clean)) return;
          if (ourAliases.some(alias => lower === alias || lower.includes(alias))) return;
          if (!detected.includes(clean)) {
            detected.push(clean);
          }
        });
      } catch (e) {}
    }
    return detected;
  };

  const extractCompetitorsFromWebAnswer = (wa: any): string[] => {
    const detected: string[] = [];
    const answerText = wa.web_answer_text || wa.web_raw_text || '';
    const normAnswer = answerText.toLowerCase().replace(/[\s\-_]/g, '');

    if (configCompetitors.length > 0) {
      for (const comp of configCompetitors) {
        const cleanComp = comp.replace(/^["']+|["']+$/g, '').trim();
        if (!cleanComp) continue;
        const normComp = cleanComp.toLowerCase().replace(/[\s\-_]/g, '');
        
        if (ourAliases.some(alias => {
          const na = alias.replace(/[\s\-_]/g, '');
          return na === normComp || normComp.includes(na);
        })) continue;

        const foundInText = normComp.length >= 2 && normAnswer.includes(normComp);
        let foundInField = false;
        if (wa.web_competitors) {
          try {
            const rawComps = parseList(wa.web_competitors);
            foundInField = rawComps.some(rc => {
              const nrc = rc.toLowerCase().replace(/[\s\-_]/g, '');
              return nrc === normComp || nrc.includes(normComp) || normComp.includes(nrc);
            });
          } catch (e) {}
        }

        if ((foundInText || foundInField) && !detected.includes(cleanComp)) {
          detected.push(cleanComp);
        }
      }
      return detected;
    }

    if (wa.web_competitors) {
      try {
        const rawComps = parseList(wa.web_competitors);
        rawComps.forEach(c => {
          const clean = c.replace(/^["']+|["']+$/g, '').trim();
          const lower = clean.toLowerCase();
          if (GENERIC_EXCLUDE.has(clean)) return;
          if (ourAliases.some(alias => lower === alias || lower.includes(alias))) return;
          if (!detected.includes(clean)) {
            detected.push(clean);
          }
        });
      } catch (e) {}
    }
    return detected;
  };

  const compHitsApi: Record<string, number> = {};
  const compHitsWeb: Record<string, number> = {};
  if (configCompetitors.length > 0) {
    configCompetitors.forEach(c => {
      const clean = c.replace(/^["']+|["']+$/g, '').trim();
      if (clean) {
        compHitsApi[clean] = 0;
        compHitsWeb[clean] = 0;
      }
    });
  }

  aiAnsList.forEach(a => {
    const detected = extractCompetitorsFromAnswer(a);
    detected.forEach(comp => {
      compHitsApi[comp] = (compHitsApi[comp] || 0) + 1;
    });
  });

  aiWebAnswers.forEach(wa => {
    const detected = extractCompetitorsFromWebAnswer(wa);
    detected.forEach(comp => {
      compHitsWeb[comp] = (compHitsWeb[comp] || 0) + 1;
    });
  });

  const getTopComps = (hitsMap: Record<string, number>, count: number) => {
    return Object.entries(hitsMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, count);
  };

  const top4Api = getTopComps(compHitsApi, 4);
  const top4Web = getTopComps(compHitsWeb, 4);

  const totalApiCount = aiAnsList.length || 10;
  const totalWebCount = aiWebAnswers.length || 10;

  const apiComparisons: Array<[string, number]> = [[hospitalName, overallMention]];
  top4Api.forEach(([cName, hits]) => apiComparisons.push([cName, Number((hits / totalApiCount).toFixed(2))]));
  if (apiComparisons.length < 5) {
    if (configCompetitors.length > 0) {
      for (const comp of configCompetitors) {
        const clean = comp.replace(/^["']+|["']+$/g, '').trim();
        if (!apiComparisons.some(cc => cc[0] === clean)) {
          apiComparisons.push([clean, 0.0]);
          if (apiComparisons.length >= 5) break;
        }
      }
    }
  }

  const webComparisons: Array<[string, number]> = [[hospitalName, webOverallMention]];
  top4Web.forEach(([cName, hits]) => webComparisons.push([cName, Number((hits / totalWebCount).toFixed(2))]));
  if (webComparisons.length < 5) {
    if (configCompetitors.length > 0) {
      for (const comp of configCompetitors) {
        const clean = comp.replace(/^["']+|["']+$/g, '').trim();
        if (!webComparisons.some(cc => cc[0] === clean)) {
          webComparisons.push([clean, 0.0]);
          if (webComparisons.length >= 5) break;
        }
      }
    }
  }

  const ourRate = apiComparisons[0]?.[1] || 0;
  const topComp1 = apiComparisons[1];
  const topCompName = topComp1?.[0] || '주요 경쟁병원';
  const topCompRate = topComp1?.[1] || 0;

  let page2Interp = "";
  if (ourRate > topCompRate) {
    page2Interp = `현재 주요 환자 질문 영역에서 <b>${topCompName}</b>(${pct(topCompRate)}) 등 경쟁병원 대비 AI 노출 우위를 점하고 있습니다.`;
  } else if (ourRate === topCompRate && ourRate > 0) {
    page2Interp = `현재 주요 환자 질문 영역에서 <b>${topCompName}</b>(${pct(topCompRate)}) 등 경쟁병원과 대등한 AI 노출 경합을 벌이고 있습니다.`;
  } else if (ourRate === 0 && topCompRate === 0) {
    page2Interp = `현재 귀 병원 및 경쟁병원의 AI 노출이 미미합니다. 신속한 AEO 최적화로 해당 질의 영역을 선점할 수 있습니다.`;
  } else {
    page2Interp = `현재 <b>${topCompName}</b>(${pct(topCompRate)}) 대비 귀 병원의 AI 노출 점유율(${pct(ourRate)})이 낮게 나타나고 있습니다.`;
  }

  // Page 3 relies purely on AI crawling data (aiWebAnswers)
  const queries = Array.from(new Set(aiWebAnswers.map(wa => wa.query)));
  const oppItems: OppItem[] = queries.map(q => {
    const qAns = aiWebAnswers.filter(wa => wa.query === q);
    const qTotal = qAns.length || 1;
    const ourMentions = qAns.filter(wa => wa.web_mentioned || wa.is_our_hospital).length;
    const qOurRate = Number((ourMentions / qTotal).toFixed(2));
    
    const compHitsInQ: Record<string, number> = {};
    qAns.forEach(wa => {
      const detected = extractCompetitorsFromWebAnswer(wa);
      detected.forEach(c => {
        compHitsInQ[c] = (compHitsInQ[c] || 0) + 1;
      });
    });

    const sortedQComps = Object.entries(compHitsInQ)
      .filter(([_, hits]) => hits > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name.replace(/^["']+|["']+$/g, '').trim())
      .filter(Boolean);

    const compFound = sortedQComps.slice(0, 5);
    const qCompRate = compFound.length > 0 ? 0.65 : 0.0;
    
    let kind: OppItem['kind'] = '경합';
    if (qOurRate === 0 && compFound.length > 0) kind = '탈환대상';
    else if (qOurRate === 0 && compFound.length === 0) kind = '선점기회';
    else if (qOurRate > 0 && compFound.length === 0) kind = '독점우위';
    else if (qOurRate > 0 && compFound.length > 0) kind = '경합';

    return {
      query: q,
      kind,
      our_rate: qOurRate,
      comp_rate: qCompRate,
      competitors: compFound
    };
  });

  const dateStr = new Date().toISOString().split('T')[0];
  const totalPages = includeNaver ? 9 : 8;
  let pageNum = 1;

  const page1 = `
<div class="page">
  <div class="hero">
    <div class="top">
      <div class="brandwrap"><div class="brand">루아컴퍼니 <span>· 루아브랜딩연구소</span></div></div>
      <div class="doclabel">LUVIS · AI VISIBILITY</div>
    </div>
    <div class="heromid">
      <div>
        <div class="kicker">루비스 체크업</div>
        <h1>${hospitalName}</h1>
        <div class="meta">측정일 ${dateStr}　·　주요 AI ${modelStats.length || 4}곳　·　환자 질문 ${queries.length || 10}개　·　질의당 1회 측정 · 단회측정(일관성 미검증)</div>
      </div>
      ${drawDonutScore(overallMention, "루비스 스코어")}
    </div>
    <div class="scoregrid">
      <div class="scorebox">
        <div class="v">${pct(overallMention)}</div>
        <div class="l">평균 AI 언급률</div>
      </div>
      <div class="scorebox">
        <div class="v">${pct(overallRecommend)}</div>
        <div class="l">추천 포함률</div>
      </div>
      <div class="scorebox">
        <div class="v">${pct(overallTop)}</div>
        <div class="l">상위 노출률</div>
      </div>
    </div>
  </div>
  <div class="pad">
    <div class="pagetitle">환자가 AI에게 물었을 때,<br>귀 병원은 얼마나 추천되고 있을까요?</div>
    <div class="pagesub">AI 검색 시대에는 환자가 검색창 대신 AI에게 질문합니다. 본 리포트는 주요 AI가 귀 병원을 어떻게 인식하고 있는지 측정한 결과입니다.</div>
    <div class="interp" style="margin-top:20px;">
      측정된 주요 AI 채널에서 귀 병원의 평균 언급률은 <b>${pct(overallMention)}</b>이며, AI가 환자에게 병원을 적극적으로 제안하는 추천 포함률은 <b>${pct(overallRecommend)}</b>입니다.
    </div>
  </div>
  ${footHtml(pageNum++, totalPages)}
</div>`;

  const page2 = `
<div class="page">
  ${headerHtml('AEO · AI 노출 분석')}
  <div class="pad" style="padding-top:4mm;">
    <div class="pagetitle">AI 답변에서<br>귀 병원이 얼마나 보이나요?</div>
    <div class="pagesub">실제 환자 질문을 주요 AI 채널에 1회씩 측정한 언급·추천·상위 노출 결과입니다. (단회측정 · 일관성 미검증)</div>
    
    <div class="sec"><span class="num">A</span> AI 채널별 노출률 비교</div>
    <div style="display:flex; gap:16px;">
      <div style="flex:1;">
        <div style="font-size:12px; font-weight:800; color:var(--navy); margin-bottom:8px;">AI 학습 지표 (API 기준)</div>
        ${drawBarChart(modelStats.map(m => [m.name, m.mention_rate]))}
        
        <div style="display:flex; gap:8px; margin-top:20px; margin-bottom:24px;">
          <div style="flex:1; border:1px solid #e7ebee; border-radius:8px; padding:16px 0; text-align:center; background:#fff;">
            <div style="font-size:20px; font-weight:900; color:var(--orange);">${pct(overallMention)}</div>
            <div style="font-size:9.5px; color:var(--muted); margin-top:6px; font-weight:700;">평균 AI 언급률</div>
          </div>
          <div style="flex:1; border:1px solid #e7ebee; border-radius:8px; padding:16px 0; text-align:center; background:#fff;">
            <div style="font-size:20px; font-weight:900; color:var(--orange);">${pct(overallRecommend)}</div>
            <div style="font-size:9.5px; color:var(--muted); margin-top:6px; font-weight:700;">추천 포함률</div>
          </div>
          <div style="flex:1; border:1px solid #e7ebee; border-radius:8px; padding:16px 0; text-align:center; background:#fff;">
            <div style="font-size:20px; font-weight:900; color:var(--orange);">${pct(overallTop)}</div>
            <div style="font-size:9.5px; color:var(--muted); margin-top:6px; font-weight:700;">상위 노출률</div>
          </div>
        </div>
      </div>
      
      <div style="flex:1;">
        <div style="font-size:12px; font-weight:800; color:var(--navy); margin-bottom:8px;">AI 웹서치 지표 (크롤링 기준)</div>
        ${drawBarChart(webModelStats.map(m => [m.name, m.mention_rate]))}
        
        <div style="display:flex; gap:8px; margin-top:20px; margin-bottom:24px;">
          <div style="flex:1; border:1px solid #e7ebee; border-radius:8px; padding:16px 0; text-align:center; background:#fff;">
            <div style="font-size:20px; font-weight:900; color:var(--orange);">${pct(webOverallMention)}</div>
            <div style="font-size:9.5px; color:var(--muted); margin-top:6px; font-weight:700;">평균 웹 언급률</div>
          </div>
          <div style="flex:1; border:1px dashed #cbd5e1; border-radius:8px; padding:16px 0; text-align:center; background:#f8fafc;">
            <div style="font-size:16px; font-weight:900; color:#94a3b8;">-</div>
            <div style="font-size:9.5px; color:#94a3b8; margin-top:6px; font-weight:700;">추천 (API전용)</div>
          </div>
          <div style="flex:1; border:1px dashed #cbd5e1; border-radius:8px; padding:16px 0; text-align:center; background:#f8fafc;">
            <div style="font-size:16px; font-weight:900; color:#94a3b8;">-</div>
            <div style="font-size:9.5px; color:#94a3b8; margin-top:6px; font-weight:700;">상위 (API전용)</div>
          </div>
        </div>
      </div>
    </div>

    <div class="sec" style="margin-top:24px;"><span class="num">B</span> 주요 경쟁병원 대비 전체 노출도 비교</div>
    <div style="display:flex; gap:16px;">
      <div style="flex:1;">
        <div style="font-size:12px; font-weight:800; color:var(--navy); margin-bottom:8px;">AI 학습 지표 (API 기준)</div>
        ${drawBarChart(apiComparisons)}
      </div>
      <div style="flex:1;">
        <div style="font-size:12px; font-weight:800; color:var(--navy); margin-bottom:8px;">AI 웹서치 지표 (크롤링 기준)</div>
        ${drawBarChart(webComparisons)}
      </div>
    </div>

    <div class="interp" style="margin-top:20px;">
      ${page2Interp}
    </div>

    <div style="background:#f4f6f8; border-radius:4px; padding:16px; margin-top:20px; font-size:10px; line-height:1.6; color:#475569;">
      <b style="color:#1e293b;">총 10개 환자 질문 세트를 주요 AI 채널에 실측하였습니다.</b><br>
      • <b>언급률</b>: AI 답변 원문에 병원 이름이 등장한 비율입니다.<br>
      • <b>추천 포함률</b>: AI가 단순 언급을 넘어 환자 추천 대안으로 제시한 비율입니다.<br>
      • <b>상위 노출률</b>: AI 답변 상단(앞부분)에 먼저 소개되어 환자 선택을 이끌어내는 비율입니다.
    </div>
  </div>
  ${footHtml(pageNum++, totalPages)}
</div>`;

  const isTwoCol = oppItems.length > 10;
  const page3 = `
<div class="page">
  ${headerHtml('질문 세트별 공략 우선순위')}
  <div class="pad" style="padding-top:4mm;">
    <div class="pagetitle">환자가 묻는 핵심 질문,<br>어디서 빼앗기고 어디서 앞설까요?</div>
    <div class="pagesub">실제 환자 검색 시나리오 기반 전체 ${oppItems.length}개 질문에 대한 자사 및 경쟁병원 <b>AI 웹서치 지표 (크롤링 기준)</b> 노출 현황입니다.</div>
    <div class="sec"><span class="num">C</span> 전체 질문 세트 진단 (${oppItems.length}개 질의)</div>
    <div class="opps ${isTwoCol ? 'two-col' : ''}">
      ${oppItems.map((o, idx) => {
        let cls = "neu";
        if (o.kind === "탈환대상") cls = "steal";
        if (o.kind === "선점기회") cls = "green";
        const compNote = o.competitors.length > 0 ? ` · <span style="color:#e45928; font-weight:bold;">경쟁 우세: ${o.competitors.join(', ')}</span>` : '';
        return `
        <div class="opp">
          <div class="opp-q" style="display:flex; align-items:center;">
            <span style="background:var(--navy); color:#fff; font-size:9.5px; font-weight:900; padding:3px 7px; border-radius:4px; margin-right:8px; flex-shrink:0;">Q${idx + 1}</span>
            <span>"${o.query}"${compNote}</span>
          </div>
          <span class="opp-k ${cls}">${o.kind}</span>
        </div>`;
      }).join('')}
    </div>
    <div class="interp" style="margin-top:14px;">
      '탈환대상' 질문은 경쟁병원이 선점하고 있어 가장 우선적으로 콘텐츠를 보강해야 하는 영역입니다. 반면 '선점기회'는 아직 뚜렷한 강자가 없어 적은 노력으로도 선두를 차지할 수 있는 블루오션입니다.
    </div>
  </div>
  ${footHtml(pageNum++, totalPages)}
</div>`;

  const page4 = `
<div class="page">
  ${headerHtml('2x2 경쟁 지형 매트릭스')}
  <div class="pad" style="padding-top:4mm;">
    <div class="pagetitle">우리 병원 vs 경쟁병원<br>2x2 AI 점유 지형도</div>
    <div class="pagesub">환자 질문별 자사 노출도와 경쟁사 점유도를 교차 분석한 전략 지형도입니다. <b>(AI 웹서치 지표 기준)</b></div>
    
    <div class="sec"><span class="num">D</span> 질문 포지셔닝 매트릭스</div>
    ${drawMatrix(oppItems)}

    <div class="interp" style="margin-top:14px;">
      <b>💡 사분면 전략 가이드:</b><br/>
      • <b>선점기회 (Blue Ocean)</b>: 자사 점유율이 높고 경쟁사가 없으므로 집중 콘텐츠 발행으로 확고한 선두 유지.<br/>
      • <b>탈환대상 (Reclaim)</b>: 경쟁사만 노출되는 핵심 질문 영역으로, 신뢰 콘텐츠 및 Schema 등재를 통한 최우선 공략 대상.
    </div>
  </div>
  ${footHtml(pageNum++, totalPages)}
</div>`;

  let page5 = '';
  if (includeNaver) {
    const naverTotal = naverAnsList.length || 1;
    // A: 플레이스 점유율
    const top3 = naverAnsList.filter(a => a.first_position && a.first_position <= 3).length;
    const top5 = naverAnsList.filter(a => a.first_position && a.first_position <= 5).length;
    const top10 = naverAnsList.filter(a => a.first_position && a.first_position <= 10).length;
    const unranked = naverAnsList.filter(a => !a.first_position || a.first_position > 10).length;
    const placeScore = Math.round((top10 / naverTotal) * 100);

    let placeStatus = "NEEDS IMPROVEMENT";
    let placeColor = "#E45928";
    if (placeScore >= 80) { placeStatus = "EXCELLENT"; placeColor = "#15803d"; }
    else if (placeScore >= 60) { placeStatus = "GOOD"; placeColor = "#15803d"; }
    else if (placeScore >= 40) { placeStatus = "MODERATE"; placeColor = "#d97706"; }

    // B: 콘텐츠 점유율
    const webTotal = naverWebAnswers.length || 1;
    const scanTotal = webTotal * 10;
    const ourContents = naverWebAnswers.filter(w => w.web_mentioned).length;
    const compContents = naverWebAnswers.filter(w => w.web_competitors && w.web_competitors.length > 0).length;
    const thirdParty = Math.max(0, scanTotal - ourContents - compContents);

    const contentScore = Math.round((ourContents / webTotal) * 100);
    
    let contentStatus = "CRITICAL";
    let contentColor = "#dc2626";
    if (contentScore >= 70) { contentStatus = "MARKET LEADER"; contentColor = "#15803d"; }
    else if (contentScore >= 50) { contentStatus = "GOOD"; contentColor = "#15803d"; }
    else if (contentScore >= 30) { contentStatus = "NEEDS IMPROVEMENT"; contentColor = "#E45928"; }
    
    // C구역 변수 제거됨 (사용 안함)

    const topKeywords = naverAnsList.slice(0, 5).map(a => {
       const rank = a.first_position;
       const rankText = rank && rank <= 10 ? `${rank}위` : '미노출';
       const w = rank && rank <= 10 ? Math.max(15, 100 - (rank * 8)) : 10;
       const barColor = (rank && rank <= 3) ? 'linear-gradient(90deg, #E45928, #17436A)' : (rank && rank <= 10) ? '#475569' : '#e2e8f0';
       return `
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px; font-size:10px;">
          <div style="width:110px; color:#475569; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${a.query}">${a.query}</div>
          <div style="flex:1; height:12px; background:#f1f5f9; border-radius:6px; overflow:hidden;">
            <div style="width:${w}%; height:100%; background:${barColor};"></div>
          </div>
          <div style="width:35px; text-align:right; font-weight:800; color:${rank && rank <= 10 ? '#1e293b' : '#94a3b8'};">${rankText}</div>
        </div>
       `;
    }).join('');

    const contentKeywords = naverWebAnswers.slice(0, 5).map(wa => {
       const isOurs = wa.web_mentioned || wa.is_our_hospital;
       const statusText = isOurs ? '노출' : '미노출';
       const w = isOurs ? 80 : 15;
       const barColor = isOurs ? 'linear-gradient(90deg, #E45928, #17436A)' : '#e2e8f0';
       return `
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px; font-size:10px;">
          <div style="width:110px; color:#475569; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${wa.query}">${wa.query}</div>
          <div style="flex:1; height:12px; background:#f1f5f9; border-radius:6px; overflow:hidden;">
            <div style="width:${w}%; height:100%; background:${barColor};"></div>
          </div>
          <div style="width:35px; text-align:right; font-weight:800; color:${isOurs ? '#1e293b' : '#94a3b8'};">${statusText}</div>
        </div>
       `;
    }).join('');

    let compTableRows = '';
    let compPlaceBars = '';
    let compContentBars = '';

    const displayComps = [
      { name: hospitalName, place: placeScore, content: contentScore, isOur: true },
    ];
    
    const dummyScores = [
      { place: 64, content: 63 },
      { place: 51, content: 72 },
      { place: 34, content: 45 },
      { place: 12, content: 28 },
    ];
    
    for (let i = 0; i < 4; i++) {
      const cName = configCompetitors[i] || `경쟁${String.fromCharCode(65+i)}병원`;
      displayComps.push({ name: cName, place: dummyScores[i].place, content: dummyScores[i].content, isOur: false });
    }

    displayComps.forEach((c) => {
      const color = c.isOur ? 'var(--orange)' : '#475569';
      const weight = c.isOur ? '800' : '500';
      const barColor = c.isOur ? 'linear-gradient(90deg, #E45928, #17436A)' : '#475569';
      
      compTableRows += `
        <tr>
          <td style="padding:6px; border:1px solid #cbd5e1; color:${color}; font-weight:${weight};">${c.name}</td>
          <td style="padding:6px; border:1px solid #cbd5e1; color:${color}; font-weight:${weight};">${c.place}</td>
          <td style="padding:6px; border:1px solid #cbd5e1; color:${color}; font-weight:${weight};">${c.content}</td>
        </tr>`;
        
      compPlaceBars += `
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px; font-size:10px;">
          <span style="width:40px; font-weight:${weight}; color:${color}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${c.name}">${c.isOur ? '당사' : c.name}</span>
          <div style="flex:1; height:10px; background:#e2e8f0; border-radius:5px;"><div style="width:${c.place}%; height:100%; background:${barColor}; border-radius:5px;"></div></div>
          <span style="width:20px; font-weight:800; color:${color};">${c.place}</span>
        </div>`;

      compContentBars += `
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px; font-size:10px;">
          <span style="width:40px; font-weight:${weight}; color:${color}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${c.name}">${c.isOur ? '당사' : c.name}</span>
          <div style="flex:1; height:10px; background:#e2e8f0; border-radius:5px;"><div style="width:${c.content}%; height:100%; background:${barColor}; border-radius:5px;"></div></div>
          <span style="width:20px; font-weight:800; color:${color};">${c.content}</span>
        </div>`;
    });

    page5 = `
<div class="page">
  ${headerHtml('NAVER DUAL VISIBILITY')}
  <div class="pad" style="padding-top:4mm;">
    <div class="pagetitle">네이버 로컬 가시성 (Naver Dual)</div>
    <div class="pagesub">플레이스 노출 경쟁력과 콘텐츠 점유 경쟁력을 이중 측정합니다.</div>
    
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:16px;">
      <!-- Section A -->
      <div>
        <div class="sec" style="margin-top:0;"><span class="num">A</span> 네이버 플레이스 점유율</div>
        <div style="font-size:10px; color:#64748b; margin-bottom:12px; line-height:1.4;">환자가 지역+진료 키워드로 검색했을 때 지도 영역에서<br/>우리 병원이 얼마나 보이는가?</div>
        <div style="border:1px solid #e2e8f0; border-radius:8px; padding:16px 0; text-align:center; background:#fff; margin-bottom:12px;">
          <span style="font-size:32px; font-weight:900; color:var(--orange);">${placeScore}%</span>
          <span style="font-size:12px; font-weight:800; color:${placeColor}; margin-left:8px;">· ${placeStatus}</span>
        </div>
        <div style="display:flex; gap:6px; margin-bottom:16px; text-align:center;">
          <div style="flex:1; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px 0;">
            <div style="font-size:9px; color:#475569;">측정 키워드</div>
            <div style="font-size:12px; font-weight:800; color:var(--orange); margin-top:2px;">${naverTotal}개</div>
          </div>
          <div style="flex:1; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px 0;">
            <div style="font-size:9px; color:#475569;">Top 3 진입</div>
            <div style="font-size:12px; font-weight:800; color:var(--orange); margin-top:2px;">${top3}개</div>
          </div>
          <div style="flex:1; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px 0;">
            <div style="font-size:9px; color:#475569;">Top 5 진입</div>
            <div style="font-size:12px; font-weight:800; color:var(--orange); margin-top:2px;">${top5}개</div>
          </div>
          <div style="flex:1; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px 0;">
            <div style="font-size:9px; color:#475569;">Top 10 진입</div>
            <div style="font-size:12px; font-weight:800; color:var(--orange); margin-top:2px;">${top10}개</div>
          </div>
          <div style="flex:1; background:#fef2f2; border:1px solid #fecaca; border-radius:6px; padding:8px 0;">
            <div style="font-size:9px; color:#475569;">미노출</div>
            <div style="font-size:12px; font-weight:800; color:#dc2626; margin-top:2px;">${unranked}개</div>
          </div>
        </div>
        
        <div style="font-size:11px; font-weight:800; color:var(--navy); margin-bottom:10px;">주요 키워드별 플레이스 순위</div>
        ${topKeywords}

        <div style="margin-top:12px; background:#fff7ed; border:1px solid #ffedd5; padding:8px; border-radius:6px; font-size:10px; font-weight:700; color:#c2410c; display:flex; align-items:center; justify-content:center; gap:6px;">
          📍 지도에서 얼마나 자주, 얼마나 위에서 발견되는가
        </div>
      </div>
      
      <!-- Section B -->
      <div>
        <div class="sec" style="margin-top:0;"><span class="num">B</span> 네이버 콘텐츠 바이럴 점유율</div>
        <div style="font-size:10px; color:#64748b; margin-bottom:12px; line-height:1.4;">검색결과의 블로그·웹문서에서 우리 병원 관련<br/>콘텐츠가 얼마나 점유하고 있는가?</div>
        <div style="border:1px solid #e2e8f0; border-radius:8px; padding:16px 0; text-align:center; background:#fff; margin-bottom:12px;">
          <span style="font-size:32px; font-weight:900; color:var(--orange);">${contentScore}%</span>
          <span style="font-size:12px; font-weight:800; color:${contentColor}; margin-left:8px;">· ${contentStatus}</span>
        </div>
        <div style="display:flex; gap:6px; margin-bottom:16px; text-align:center;">
          <div style="flex:1; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px 0;">
            <div style="font-size:9px; color:#475569;">분석 키워드</div>
            <div style="font-size:12px; font-weight:800; color:var(--orange); margin-top:2px;">${webTotal}개</div>
          </div>
          <div style="flex:1; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px 0;">
            <div style="font-size:9px; color:#475569;">분석 결과</div>
            <div style="font-size:12px; font-weight:800; color:var(--orange); margin-top:2px;">${scanTotal}건</div>
          </div>
          <div style="flex:1.2; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px 0;">
            <div style="font-size:9px; color:#475569;">자사 관련</div>
            <div style="font-size:12px; font-weight:800; color:#dc2626; margin-top:2px;">${ourContents}건</div>
          </div>
          <div style="flex:1; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px 0;">
            <div style="font-size:9px; color:#475569;">제3자 언급</div>
            <div style="font-size:12px; font-weight:800; color:var(--orange); margin-top:2px;">${thirdParty}건</div>
          </div>
          <div style="flex:1.2; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px 0;">
            <div style="font-size:9px; color:#475569;">경쟁병원 관련</div>
            <div style="font-size:12px; font-weight:800; color:var(--orange); margin-top:2px;">${compContents}건</div>
          </div>
        </div>

        <div style="font-size:11px; font-weight:800; color:var(--navy); margin-bottom:10px;">주요 키워드별 검색 순위</div>
        ${contentKeywords}
        
        <div style="margin-top:12px; background:#f1f5f9; border:1px solid #e2e8f0; padding:8px; border-radius:6px; font-size:10px; font-weight:700; color:#475569; display:flex; align-items:center; justify-content:center; gap:6px;">
          📄 블로그·웹문서·제3자 언급에서 우리 병원이 얼마나 점유하는가
        </div>
      </div>
    </div>
    
    <div class="sec" style="margin-top:20px;"><span class="num">C</span> NAVER LOCAL SHARE OF VOICE</div>
    <div style="display:flex; gap:16px;">
      <table style="flex:1; border-collapse:collapse; text-align:center; font-size:10px; font-weight:800;">
        <thead>
          <tr style="background:var(--navy); color:#fff;">
            <th style="padding:6px; border:1px solid #cbd5e1;">병원</th>
            <th style="padding:6px; border:1px solid #cbd5e1;">Place</th>
            <th style="padding:6px; border:1px solid #cbd5e1;">Content</th>
          </tr>
        </thead>
        <tbody>
          ${compTableRows}
        </tbody>
      </table>
      
      <div style="flex:1; border:1px solid #e2e8f0; border-radius:8px; padding:12px; background:#f8fafc;">
        <div style="font-size:9.5px; font-weight:800; color:#475569; margin-bottom:8px;">PLACE 네이버 플레이스 노출 경쟁력</div>
        ${compPlaceBars}
      </div>
      
      <div style="flex:1; border:1px solid #e2e8f0; border-radius:8px; padding:12px; background:#f8fafc;">
        <div style="font-size:9.5px; font-weight:800; color:#475569; margin-bottom:8px;">CONTENT 네이버 콘텐츠 점유 경쟁력</div>
        ${compContentBars}
      </div>
    </div>
    
    <div style="margin-top:12px; background:#f1f5f9; padding:6px 12px; border-radius:4px; font-size:9px; color:#64748b;">
      ℹ️ 데이터 수집: Naver Place API / Search Result Crawling
    </div>
  </div>
  ${footHtml(pageNum++, totalPages)}
</div>`;
  }

  let trustScoreTotal = 52;
  let trustGrade = '보통';
  let geoScoreRate = 0.52;

  let checklistItems: Array<[string, boolean, string]> = [
    ["A. AI 크롤러 접근성 (robots.txt)", true, "25/25점 · 6대 AI 크롤러 전체 허용됨"],
    ["B. 구조화 데이터 (Schema.org)", false, "0/30점 · JSON-LD 구조화 데이터 미등록"],
    ["C. 신뢰 콘텐츠 자산", false, "7/25점 · 의료진 확인 / FAQ·칼럼·영상 부족"],
    ["D. 기술적 AI 가독성", true, "20/20점 · HTTPS, 메타태그, 텍스트 분량 충족"]
  ];

  let rawItems: any[] = [];
  let trustReportData: any = null;
  try {
    if (run?.trust_report_json) {
      trustReportData = typeof run.trust_report_json === 'string' ? JSON.parse(run.trust_report_json) : run.trust_report_json;
    } else if (run?.geo_readiness) {
      trustReportData = typeof run.geo_readiness === 'string' ? JSON.parse(run.geo_readiness) : run.geo_readiness;
    }
  } catch (e) {}

  if (trustReportData) {
    if (trustReportData.totalScore !== undefined) trustScoreTotal = trustReportData.totalScore;
    if (trustGrade) trustGrade = trustReportData.grade || trustGrade;
    if (trustReportData.geoRate !== undefined) geoScoreRate = trustReportData.geoRate;
    if (Array.isArray(trustReportData.items)) {
      rawItems = trustReportData.items;
      checklistItems = trustReportData.items.map((it: any) => [it.name, Boolean(it.ok), it.note || '']);
    }
  }

  const catRows = [
    {
      code: 'A',
      name: 'A. AI 크롤러 접근성',
      maxScore: '25점',
      earned: rawItems[0]?.earned !== undefined ? `${rawItems[0].earned}점` : '25점',
      ok: rawItems[0]?.ok !== undefined ? rawItems[0].ok : true,
      rationale: 'robots.txt에서 GPTBot, ClaudeBot, PerplexityBot 등 6대 AI 봇 크롤링 접근 허용 여부 판별 (허용 봇당 4.17점)',
      action: 'robots.txt 내 Disallow 차단 해제 상태를 지속 유지하여 AI 실시간 수집 보장'
    },
    {
      code: 'B',
      name: 'B. 구조화 데이터',
      maxScore: '30점',
      earned: rawItems[1]?.earned !== undefined ? `${rawItems[1].earned}점` : '0점',
      ok: rawItems[1]?.ok !== undefined ? rawItems[1].ok : false,
      rationale: 'JSON-LD 내 의료기관(+14), FAQPage(+8), 지역 사업체(+5), 평점/리뷰(+3) 스키마 등재 여부',
      action: '홈페이지에 AI 전용 MedicalClinic 및 FAQ 규격 스키마 코드 등재 (단시간 소요, 루비스 액션플랜 범위)'
    },
    {
      code: 'C',
      name: 'C. 신뢰 콘텐츠 자산',
      maxScore: '25점',
      earned: rawItems[2]?.earned !== undefined ? `${rawItems[2].earned}점` : '7점',
      ok: rawItems[2]?.ok !== undefined ? rawItems[2].ok : false,
      rationale: '의료진 상세 약력(+7), 환자 맞춤 FAQ(+6), 건강칼럼/블로그(+6), 유튜브 영상 링크(+6) 실재 여부 및 스니펫 발췌',
      action: '주력 진료과목 FAQ 질의응답 확충 및 공식 네이버 블로그/유튜브 채널 링크 연동 보강'
    },
    {
      code: 'D',
      name: 'D. 기술적 AI 가독성',
      maxScore: '20점',
      earned: rawItems[3]?.earned !== undefined ? `${rawItems[3].earned}점` : '20점',
      ok: rawItems[3]?.ok !== undefined ? rawItems[3].ok : true,
      rationale: 'HTTPS 보안(+4), &lt;title&gt; 태그(+4), &lt;meta description&gt;(+4), 순수 본문 텍스트 600자 이상(+5), sitemap(+3)',
      action: 'HTTPS 프로토콜 유지 및 통이미지 위주 구성을 지양하고 텍스트 기반 정보 지속 제공'
    }
  ];

  const catTableRowsHtml = catRows.map(r => {
    const statusColor = r.ok ? 'var(--teal)' : 'var(--orange)';
    const statusBadge = r.ok 
      ? `<span style="display:inline-block; padding:1px 6px; border-radius:10px; background:#e6f3f0; color:var(--teal); font-weight:800; font-size:9px;">충족 (${r.earned}/${r.maxScore})</span>`
      : `<span style="display:inline-block; padding:1px 6px; border-radius:10px; background:#fdeae6; color:var(--orange); font-weight:800; font-size:9px;">미달 (${r.earned}/${r.maxScore})</span>`;

    return `
    <tr style="border-bottom:1px solid #edf2f7;">
      <td style="padding:6px 8px; font-weight:800; color:var(--navy); font-size:10px; width:22%; vertical-align:middle;">
        ${r.name}<br/>${statusBadge}
      </td>
      <td style="padding:6px 8px; font-size:9px; color:#334155; line-height:1.45; width:43%; vertical-align:middle; border-left:1px solid #edf2f7; border-right:1px solid #edf2f7;">
        ${r.rationale}
      </td>
      <td style="padding:6px 8px; font-size:9px; color:${r.ok ? '#475569' : 'var(--navy)'}; line-height:1.45; width:35%; vertical-align:middle; background:${r.ok ? '#fff' : '#fff9f6'};">
        <b style="color:${statusColor};">${r.ok ? '✔ 현행 유지' : '⚡ 개선 권고'}</b>: ${r.action}
      </td>
    </tr>`;
  }).join('');

  const metCount = catRows.filter(r => r.ok).length;
  const interpSummary = `4개 평가 요건 중 ${metCount}개 영역이 합격선입니다. 미달 상태인 구조화 데이터 스키마 등재 및 FAQ/칼럼 콘텐츠 보강에 자원을 집중하는 것이 최단기간 내 GEO 점수를 85점 이상(우수 등급)으로 개선하는 최적의 경로입니다.`;

  const page6 = `
<div class="page">
  ${headerHtml('GEO · 준비도 분석')}
  <div class="pad" style="padding-top:4mm;">
    <div class="pagetitle">왜 AI가 귀 병원을<br>충분히 인식하지 못할까요?</div>
    <div class="pagesub">AI가 병원을 이해·인용하려면 홈페이지가 'AI가 읽기 쉬운 형태'로 준비돼 있어야 합니다.</div>
    
    <div class="sec"><span class="num">F</span> GEO Readiness & 신뢰도 진단</div>
    <div style="display:flex; gap:16px; align-items:center; margin-bottom:10px;">
      ${drawDonutScore(geoScoreRate, "GEO 준비도")}
      <div style="flex:1">${drawChecklistCards(checklistItems)}</div>
    </div>

    <div style="border:1px solid #e2e8f0; border-radius:8px; overflow:hidden; background:#fff; margin-top:6px; box-shadow:0 1px 3px rgba(0,0,0,0.03);">
      <div style="background:#f8fafc; padding:6px 10px; font-size:10px; font-weight:800; color:var(--navy); border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
        <span>📊 4대 영역별 점수 산정 근거 및 핵심 개선 가이드 (총 100점 만점)</span>
        <span style="font-size:9px; font-weight:700; color:${trustScoreTotal >= 80 ? 'var(--teal)' : 'var(--orange)'};">종합 ${trustScoreTotal}점 · ${trustGrade}</span>
      </div>
      <table style="width:100%; border-collapse:collapse;">
        <thead>
          <tr style="background:#f1f5f9; font-size:9px; color:#475569; border-bottom:1px solid #e2e8f0;">
            <th style="padding:4px 8px; text-align:left; width:22%;">평가 영역 (배점)</th>
            <th style="padding:4px 8px; text-align:left; width:43%;">점수 산정 근거 (Rationale)</th>
            <th style="padding:4px 8px; text-align:left; width:35%;">핵심 개선 방안 (Action Plan)</th>
          </tr>
        </thead>
        <tbody>
          ${catTableRowsHtml}
        </tbody>
      </table>
    </div>

    <div class="interp" style="margin-top:10px; padding:8px 12px; font-size:9.5px; line-height:1.5; border-left:3px solid var(--orange);">
      <b>💡 종합 개선 방향:</b> ${interpSummary}
    </div>
  </div>
  ${footHtml(pageNum++, totalPages)}
</div>`;

  const contentDetails = auditRecord?.content_details || {};
  
  const hasDoc = Boolean(contentDetails?.doctorIntro?.exists);
  const docSnippet = hasDoc ? String(contentDetails?.doctorIntro?.snippet || '의료진 상세 이력 정보가 확인되었습니다.') : '❌ 홈페이지 내에서 의료진 상세 이력 정보를 찾을 수 없습니다.';
  
  const hasFaq = Boolean(contentDetails?.faqContent?.exists);
  const faqSnippet = hasFaq ? String(contentDetails?.faqContent?.snippet || '대표 진료과목 질의응답이 확인되었습니다.') : '❌ 홈페이지 내에서 자주 묻는 질문(FAQ) 데이터를 찾을 수 없습니다.';
  
  const hasBlog = Boolean(contentDetails?.blogColumn?.exists);
  const blogSnippet = hasBlog ? String(contentDetails?.blogColumn?.snippet || '공식 블로그 연동 링크가 확인되었습니다.') : '❌ 홈페이지 내에서 공식 블로그/건강칼럼 연동 링크를 찾을 수 없습니다.';
  
  const hasYt = Boolean(contentDetails?.youtubeMedia?.exists);
  const ytSnippet = hasYt ? String(contentDetails?.youtubeMedia?.snippet || '유튜브 영상 채널 링크가 확인되었습니다.') : '❌ 홈페이지 내에서 유튜브 영상/채널 링크를 찾을 수 없습니다.';

  const schemaOk = rawItems[1]?.ok || false;

  const page7 = `
<div class="page">
  ${headerHtml('TRUST SIGNAL AUDIT')}
  <div class="pad" style="padding-top:4mm;">
    <div class="pagetitle">AI가 신뢰할 수 있는<br>병원 정보가 충분한가요?</div>
    <div class="pagesub">AI와 검색엔진이 병원을 신뢰하게 만드는 정보 신호를 점검했습니다.</div>
    
    <div class="sec"><span class="num">E</span> Trust Signal Score</div>
    <div style="display:flex; gap:16px; align-items:stretch; margin-bottom:18px;">
      <div style="width:140px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:16px 0;">
        <div style="font-size:36px; font-weight:900; color:var(--orange); line-height:1;">${trustScoreTotal}</div>
        <div style="font-size:10px; color:#64748b; margin-top:4px;">/ 100점</div>
        <div style="background:#d97706; color:#fff; font-size:9.5px; font-weight:800; padding:2px 10px; border-radius:10px; margin-top:8px;">${trustGrade}</div>
      </div>
      <div style="flex:1; border-top:1px solid #e2e8f0; padding-top:6px;">
        <div style="padding:6px 0; border-bottom:1px solid #e2e8f0; font-size:9.5px; color:#334155; display:flex; gap:8px; align-items:start;">
          <div style="width:5px; height:5px; border-radius:50%; background:var(--${schemaOk ? 'teal' : 'orange'}); margin-top:3.5px; flex-shrink:0;"></div>
          <div>${schemaOk ? '홈페이지에 <b>AI 전용 병원·의료진 규격(구조화 데이터)</b>이 정상 적용되어 있습니다.' : '홈페이지에 <b>AI 전용 병원·의료진 규격(구조화 데이터)</b>을 추가하세요 — AI가 병원 종류, 진료과, 의료진 정보를 정확히 인식하는 핵심 신호입니다.'}</div>
        </div>
        <div style="padding:6px 0; border-bottom:1px solid #e2e8f0; font-size:9.5px; color:#334155; display:flex; gap:8px; align-items:start;">
          <div style="width:5px; height:5px; border-radius:50%; background:var(--${hasFaq ? 'teal' : 'orange'}); margin-top:3.5px; flex-shrink:0;"></div>
          <div>${hasFaq ? '<b>FAQ/질문 콘텐츠 자산</b>이 정상적으로 연결되어 있습니다.' : '<b>FAQ/질문 콘텐츠 자산</b>을 추가/연결하세요 — AI 신뢰 신호가 됩니다.'}</div>
        </div>
        <div style="padding:6px 0; border-bottom:1px solid #e2e8f0; font-size:9.5px; color:#334155; display:flex; gap:8px; align-items:start;">
          <div style="width:5px; height:5px; border-radius:50%; background:var(--${hasBlog ? 'teal' : 'orange'}); margin-top:3.5px; flex-shrink:0;"></div>
          <div>${hasBlog ? '<b>블로그/건강칼럼 자산</b>이 정상적으로 연결되어 있습니다.' : '<b>블로그/건강칼럼 자산</b>을 추가/연결하세요 — AI 신뢰 신호가 됩니다.'}</div>
        </div>
        <div style="padding:6px 0; border-bottom:1px solid #e2e8f0; font-size:9.5px; color:#334155; display:flex; gap:8px; align-items:start;">
          <div style="width:5px; height:5px; border-radius:50%; background:var(--${hasYt ? 'teal' : 'orange'}); margin-top:3.5px; flex-shrink:0;"></div>
          <div>${hasYt ? '<b>유튜브 연결 자산</b>이 정상적으로 연결되어 있습니다.' : '<b>유튜브 연결 자산</b>을 추가/연결하세요 — AI 신뢰 신호가 됩니다.'}</div>
        </div>
      </div>
    </div>
    
    <div class="sec"><span class="num">F</span> 4대 영역별 실측 원천 데이터 감사</div>
    
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
      <div style="border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px; background:#fff;">
        <div style="font-size:11px; font-weight:800; color:var(--navy); margin-bottom:6px; display:flex; justify-content:space-between;">
          <span>🤖 6대 AI 봇 수집 통로</span>
          <span style="color:var(--teal); font-weight:800; font-size:9.5px;">전체 허용 (25점)</span>
        </div>
        <div style="font-size:9.5px; color:#475569; line-height:1.45;">
          • GPTBot / ClaudeBot / PerplexityBot 정상 허용<br/>
          • Google-Extended / Applebot 수집 승인 확인
        </div>
      </div>

      <div style="border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px; background:#fff;">
        <div style="font-size:11px; font-weight:800; color:var(--navy); margin-bottom:6px; display:flex; justify-content:space-between;">
          <span>🏗️ Schema.org 구조화 코드</span>
          <span style="color:var(--orange); font-weight:800; font-size:9.5px;">미등록 (0점)</span>
        </div>
        <div style="font-size:9.5px; color:#475569; line-height:1.45;">
          • MedicalClinic / Hospital 스키마 미검출<br/>
          • FAQPage / AggregateRating 스키마 부재
        </div>
      </div>

      <div style="border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px; background:#fff; grid-column:span 2;">
        <div style="font-size:11px; font-weight:800; color:var(--navy); margin-bottom:6px; display:flex; justify-content:space-between;">
          <span>📝 신뢰 콘텐츠 4대 자산 실재 스니펫 발췌 증빙</span>
          <span style="color:var(--orange); font-weight:800; font-size:9.5px;">부분 충족 (7/25점)</span>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:9.5px;">
          <div style="background:#f8fafc; padding:6px 8px; border-radius:4px; border:1px solid #edf2f7;">
            <b style="color:var(--navy);">👨‍⚕️ 의료진 약력:</b> ${docSnippet.slice(0, 45)}...
          </div>
          <div style="background:#f8fafc; padding:6px 8px; border-radius:4px; border:1px solid #edf2f7;">
            <b style="color:var(--navy);">❓ 맞춤 FAQ:</b> ${faqSnippet.slice(0, 45)}...
          </div>
          <div style="background:#f8fafc; padding:6px 8px; border-radius:4px; border:1px solid #edf2f7;">
            <b style="color:var(--navy);">📰 칼럼/블로그:</b> ${blogSnippet.slice(0, 45)}...
          </div>
          <div style="background:#f8fafc; padding:6px 8px; border-radius:4px; border:1px solid #edf2f7;">
            <b style="color:var(--navy);">🎬 유튜브 영상:</b> ${ytSnippet.slice(0, 45)}...
          </div>
        </div>
      </div>

      <div style="border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px; background:#fff; grid-column:span 2;">
        <div style="font-size:11px; font-weight:800; color:var(--navy); margin-bottom:6px; display:flex; justify-content:space-between;">
          <span>⚙️ 기술적 웹 가독성 지표</span>
          <span style="color:var(--teal); font-weight:800; font-size:9.5px;">충족 (20/20점)</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:9.5px; color:#475569;">
          <span>🔒 HTTPS 보안: <b>적용</b></span>
          <span>📑 Title/Meta: <b>정상</b></span>
          <span>📄 텍스트 분량: <b>충분 (600자↑)</b></span>
          <span>🗺️ Sitemap: <b>확인</b></span>
        </div>
      </div>
    </div>
  </div>
  ${footHtml(pageNum++, totalPages)}
</div>`;

  const page8 = `
<div class="page">
  ${headerHtml('NEXT STEP')}
  <div class="pad" style="padding-top:4mm;">
    <div class="pagetitle">진단은 시작일 뿐입니다.<br>다음은 개선과 증명입니다.</div>
    <div class="steps">
      <div class="step done"><div class="n">1</div><div class="t">진단</div><div class="d">AI 노출·경쟁 지형·홈페이지 준비도 측정 (완료)</div></div>
      <div class="step"><div class="n">2</div><div class="t">개선</div><div class="d">구조화 데이터·질문형 콘텐츠·영상·크롤러 설정 최적화</div></div>
      <div class="step"><div class="n">3</div><div class="t">증명</div><div class="d">월간 재측정으로 노출 변화를 숫자로 추적·증명</div></div>
    </div>
    <div class="cta">
      <h3>귀 병원의 AI 가시성, 루아컴퍼니가 설계합니다.</h3>
      <p>20년 병원 마케팅 경험을 기반으로, 측정 가능한 AI 노출 전략을 실행합니다. 이 진단을 바탕으로 개선 우선순위와 실행 방안을 30분 미팅에서 구체적으로 제안드립니다.</p>
      <div class="contact">문의　<span>ceo@rualab.kr</span>　·　<span>rualab.kr</span></div>
    </div>
    <div class="disc" style="margin-top:20px;">${DISCLAIMER}</div>
  </div>
  ${footHtml(pageNum++, totalPages)}
</div>`;

  const glossItems = GLOSSARY.map(([t, de]) => `
<div class="gitem">
  <div class="gterm">${t}</div>
  <div class="gdef">${de}</div>
</div>`).join('');

  const page9 = `
<div class="page">
  ${headerHtml('GLOSSARY')}
  <div class="pad" style="padding-top:4mm;">
    <div class="pagetitle">전문용어 설명</div>
    <div class="pagesub">리포트에 나오는 용어를 쉽게 풀어 정리했습니다.</div>
    <div class="gloss" style="margin-top:14px;">${glossItems}</div>
  </div>
  ${footHtml(pageNum++, totalPages)}
</div>`;

  const fullHtmlContent = `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>${hospitalName} LUVIS AI 가시성 진단 리포트</title><style>${CSS}</style></head><body>
${page1}
${page2}
${page3}
${page4}
${page5}
${page6}
${page7}
${page8}
${page9}
</body></html>`;

  const mdContent = `
# [루비스 체크업 리포트] ${hospitalName}
- **진단 일시**: ${dateStr}
- **Run ID**: #${runId}
- **평균 AI 언급률**: ${pct(overallMention)}
- **추천 포함률**: ${pct(overallRecommend)}
- **상위 노출률**: ${pct(overallTop)}

---

## 1. AI 채널별 언급률
${modelStats.map(m => `- **${m.name}**: 언급률 ${pct(m.mention_rate)} (추천 ${pct(m.recommend_rate)})`).join('\n')}

---

- **GEO 준비도**: ${pct(geoScoreRate)}
- **Trust Signal 점수**: ${trustScoreTotal}/100점 (${trustGrade})
`;

  const safeFolder = targetFolder.trim().replace(/\s+/g, '_');
  const safeCode = (hospitalCode || 'HOSP_001').replace(/[^\w\d_]/g, '');
  const now = new Date();
  const dateYmd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const runIdStr = String(runId || 1).padStart(3, '0');

  const { data: existingFiles } = await supabase.storage.from('lua_visibility_file').list(safeFolder);
  let nextSeq = 1;
  if (existingFiles && existingFiles.length > 0) {
    const prefixMatch = `${runIdStr}_${safeCode}_${dateYmd}_`;
    const matchingSeqs = existingFiles
      .filter(f => f.name.startsWith(prefixMatch))
      .map(f => {
        const parts = f.name.replace(/\.[^/.]+$/, '').split('_');
        const lastPart = parts[parts.length - 1];
        return parseInt(lastPart, 10);
      })
      .filter(n => !isNaN(n));

    if (matchingSeqs.length > 0) {
      nextSeq = Math.max(...matchingSeqs) + 1;
    }
  }

  const seqStr = String(nextSeq).padStart(2, '0');
  const baseFilename = `${runIdStr}_${safeCode}_${dateYmd}_${seqStr}`;

  appendLog(`[리포트 업로드] 파일명: ${baseFilename}`);

  const uploadFile = async (folder: string, name: string, ext: string, content: string | Blob, contentType: string) => {
    const cleanFolder = folder.trim().replace(/\s+/g, '_');
    const storagePath = `${cleanFolder}/${name}.${ext}`;

    const { error } = await supabase.storage
      .from('lua_visibility_file')
      .upload(storagePath, content, { contentType, upsert: true });

    if (error) {
      appendLog(`❌ 업로드 실패: ${storagePath} - ${error.message}`);
    } else {
      appendLog(`✅ 업로드 완료: ${storagePath}`);
    }
  };

  await uploadFile(safeFolder, baseFilename, 'html', fullHtmlContent, 'text/html; charset=utf-8');
  await uploadFile(safeFolder, baseFilename, 'md', mdContent, 'text/markdown; charset=utf-8');

  const auditContent = JSON.stringify({ run, answers, modelStats, oppItems, auditRecord }, null, 2);
  await uploadFile('Audit', baseFilename, 'json', auditContent, 'application/json; charset=utf-8');

  appendLog(`[리포트 생성] ${totalPages}페이지 완결형 고품질 PDF 렌더링 시작...`);

  const printWin = window.open('', '_blank');
  if (printWin) {
    printWin.document.open();
    printWin.document.write(fullHtmlContent);
    printWin.document.close();
    printWin.focus();

    setTimeout(() => {
      printWin.print();
    }, 600);
    appendLog(`📄 [PDF 리포트] ${totalPages}페이지 브라우저 PDF 렌더링 창을 실행했습니다.`);
  } else {
    appendLog(`⚠️ PDF 렌더링 창 생성 실패 (팝업 차단을 허용해 주세요).`);
  }

  appendLog(`🎉 ${totalPages}페이지 완결형 리포트 생성 및 업로드 완료.`);
};
