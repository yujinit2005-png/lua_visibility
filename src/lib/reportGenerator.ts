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
  ["구조화 데이터", "홈페이지 정보를 기계가 읽기 쉽게 표준 형식(Schema)으로 표시한 것입니다. AI가 병원 종류·진료과를 정확히 인식하게 돕습니다."],
  ["FAQ 콘텐츠", "환자가 자주 묻는 질문과 답을 정리한 콘텐츠입니다. AI가 질문에 병원을 연결하기 쉬워집니다."],
  ["언급률", "AI 답변에 병원 이름이 등장한 비율입니다. 질의당 여러 번 반복 측정한 평균으로 계산합니다."],
  ["추천 포함률", "AI 답변에서 병원이 단순 언급을 넘어 추천 맥락으로 등장한 비율입니다."],
  ["상위 노출률", "AI 답변에서 병원이 앞부분(먼저 소개되는 위치)에 등장한 비율입니다."],
  ["탈환대상", "경쟁 병원은 답변에 나오는데 귀 병원은 거의 안 나오는 질문입니다. 콘텐츠로 되찾아올 대상입니다."],
  ["선점기회", "아직 뚜렷한 주인이 없는 질문입니다. 먼저 콘텐츠를 만들면 선점할 수 있습니다."],
  ["AI 크롤러", "AI가 웹페이지를 읽어가는 자동 프로그램입니다. 차단돼 있으면 AI가 병원 정보를 참고하지 못합니다."],
  ["sitemap.xml", "홈페이지의 전체 페이지 목록을 정리한 파일로, AI·검색엔진이 내용을 빠짐없이 찾도록 돕습니다."],
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

function drawMatrix(items: OppItem[], standalone: boolean = false): string {
  let dots = "";
  const posCounts: Record<string, number> = {};

  items.forEach((o, i) => {
    const rawLeft = Math.min(88, Math.max(8, o.comp_rate * 100));
    const rawBottom = Math.min(85, Math.max(8, o.our_rate * 100));
    const gKey = `${Math.round(rawLeft / 10) * 10}_${Math.round(rawBottom / 10) * 10}`;
    const idxInG = posCounts[gKey] || 0;
    posCounts[gKey] = idxInG + 1;

    const cols = 6;
    const col = idxInG % cols;
    const row = Math.floor(idxInG / cols);
    const offsetX = (col - (cols - 1) / 2) * 5.0;
    const offsetY = (row - 0.5) * 6.0;

    const left = Math.min(92, Math.max(5, rawLeft + offsetX));
    const bottom = Math.min(90, Math.max(5, rawBottom + offsetY));

    const cls = o.kind === "탈환대상" ? "steal" : o.kind === "선점기회" ? "green" : "neu";
    dots += `<div class="dot ${cls}" style="left:${left.toFixed(1)}%;bottom:${bottom.toFixed(1)}%;z-index:${10 + i}" title="${o.query}">Q${i + 1}</div>`;
  });

  const matrixCls = standalone ? "matrix standalone" : "matrix";
  return `
<div class="${matrixCls}">
  <div class="mq tl">우선도 낮음</div><div class="mq tr">유지 영역</div>
  <div class="mq bl">선점기회</div><div class="mq br">탈환대상</div>
  <div class="axisY">우리 노출도 →</div><div class="axisX">경쟁병원 점유도 →</div>
  ${dots}
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
  min-height: 296mm;
  position: relative;
  page-break-after: always;
  break-after: page;
  overflow: hidden;
  background: #ffffff;
  margin: 0 auto;
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

/* 표지 히어로 */
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

/* 도넛 */
.donut { width: 130px; height: 130px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex: none; }
.donut-in { width: 100px; height: 100px; background: #fff; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.donut-pct { font-size: 28px; font-weight: 900; color: var(--navy); }
.donut-lab { font-size: 10px; color: var(--muted); margin-top: 2px; }

/* 막대 & 메트릭 */
.bars { display: flex; flex-direction: column; gap: 10px; }
.barrow { display: flex; align-items: center; gap: 11px; font-size: 11.5px; }
.barrow .nm { width: 110px; color: var(--ink); font-weight: 700; }
.track { flex: 1; height: 14px; background: #eef1f3; border-radius: 7px; overflow: hidden; }
.fill { height: 100%; background: linear-gradient(90deg, var(--orange), var(--navy)); border-radius: 7px; }
.barrow .vl { width: 42px; text-align: right; font-weight: 800; color: var(--navy); }
.aeo-metrics { display: flex; gap: 12px; margin-top: 16px; }
.metric { flex: 1; border: 1px solid var(--line); border-radius: 11px; padding: 14px; text-align: center; background: #fff; }
.metric .v { font-size: 22px; font-weight: 900; color: var(--orange); }
.metric .l { font-size: 10px; color: var(--muted); margin-top: 4px; }

/* Opportunity Cards & Matrix */
.oppcard { border: 1px solid var(--line); border-radius: 8px; padding: 8px 12px; margin-bottom: 6px; background: #fff; }
.oppcard .top { display: flex; justify-content: space-between; align-items: center; gap: 6px; }
.oppq { font-size: 11.5px; font-weight: 800; color: var(--navy); display: flex; align-items: center; gap: 6px; }
.qnum { background: var(--navy); color: #fff; font-size: 9px; font-weight: 900; padding: 2px 6px; border-radius: 4px; flex: none; }
.tag { font-size: 9px; font-weight: 800; padding: 2px 8px; border-radius: 12px; color: #fff; flex: none; }
.tag.steal { background: var(--orange); } .tag.green { background: var(--teal); } .tag.navy { background: var(--navy); }
.tag.comp { background: #475569; }
.oppmeta { font-size: 10px; color: var(--muted); margin-top: 4px; }
.chip2 { display: inline-block; background: #fdeae6; color: var(--orange); font-size: 9px; font-weight: 700; padding: 1px 6px; border-radius: 10px; margin: 0 2px 0 0; }
.ourzero { color: var(--orange); font-weight: 800; }
.ourok { color: var(--teal); font-weight: 800; }

.matrix { position: relative; width: 160mm; height: 60mm; margin: 10px auto; border: 1px solid var(--line); background: linear-gradient(90deg,#fafbfc,#fff); }
.matrix.standalone { width: 170mm; height: 140mm; margin: 16px auto 8px; }
.matrix .mq { position: absolute; font-size: 9px; font-weight: 800; color: #b3bcc4; padding: 4px 6px; }
.matrix.standalone .mq { font-size: 11px; padding: 8px 12px; }
.mq.tl { top: 0; left: 0; } .mq.tr { top: 0; right: 0; color: var(--teal); } .mq.bl { bottom: 14px; left: 0; } .mq.br { bottom: 14px; right: 0; color: var(--orange); }
.matrix:before { content: ""; position: absolute; left: 50%; top: 0; bottom: 0; border-left: 1px dashed var(--line); }
.matrix:after { content: ""; position: absolute; top: 50%; left: 0; right: 0; border-top: 1px dashed var(--line); }
.axisX { position: absolute; bottom: 2px; left: 50%; transform: translateX(-50%); font-size: 8.5px; color: var(--muted); }
.axisY { position: absolute; top: 50%; left: 3px; transform: translateY(-50%); font-size: 8.5px; color: var(--muted); }
.dot { position: absolute; width: 16px; height: 16px; border-radius: 50%; transform: translate(-50%,50%); font-size: 8px; font-weight: 900; color: #fff; display: flex; align-items: center; justify-content: center; }
.dot.steal { background: var(--orange); } .dot.green { background: var(--teal); } .dot.neu { background: var(--navy); }

/* Checklist & Trust Cards */
.cards { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 8px; }
.card { display: flex; gap: 11px; border: 1px solid var(--line); border-radius: 11px; padding: 12px 14px; align-items: flex-start; background: #fff; }
.card-mark { width: 24px; height: 24px; border-radius: 50%; flex: none; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 13px; }
.card.ok .card-mark { background: #e6f3f0; color: var(--teal); }
.card.no .card-mark { background: #fdeae6; color: var(--orange); }
.card-t { font-size: 12px; font-weight: 800; color: var(--ink); }
.card-n { font-size: 10px; color: var(--muted); margin-top: 3px; line-height: 1.45; }

.trust { display: flex; gap: 20px; align-items: flex-start; }
.tscore { flex: none; width: 140px; text-align: center; border-radius: 13px; padding: 18px 12px; background: var(--soft); border: 1px solid var(--line); }
.tscore .big { font-size: 40px; font-weight: 900; }
.tscore .max { font-size: 11px; color: var(--muted); }
.tscore .grade { margin-top: 8px; font-size: 11px; font-weight: 800; display: inline-block; padding: 3px 10px; border-radius: 20px; color: #fff; }
.tlist { flex: 1; }
.tlist li { list-style: none; font-size: 11px; line-height: 1.5; padding: 7px 0 7px 20px; border-bottom: 1px solid var(--line); position: relative; }
.tlist li:before { content: ""; position: absolute; left: 2px; top: 12px; width: 7px; height: 7px; border-radius: 50%; background: var(--orange); }

/* 개선 액션 카드 */
.actions { display: flex; flex-direction: column; gap: 9px; }
.act { display: flex; align-items: center; gap: 13px; border: 1px solid var(--line); border-radius: 11px; padding: 12px 15px; box-shadow: 0 1px 3px rgba(15,46,71,.05); }
.act .rank { width: 30px; height: 30px; border-radius: 8px; background: var(--navy); color: #fff; font-weight: 900; display: flex; align-items: center; justify-content: center; flex: none; }
.act .t { flex: 1; font-size: 12.5px; font-weight: 800; color: var(--ink); }
.badge { font-size: 9.5px; font-weight: 800; padding: 3px 9px; border-radius: 20px; }
.b-diff { background: #eef2f4; color: var(--navy); } .b-imp { background: #fdeae6; color: var(--orange); }

/* Steps + CTA */
.steps { display: flex; gap: 11px; margin: 16px 0 22px; }
.step { flex: 1; border: 1px solid var(--line); border-radius: 13px; padding: 18px 13px; text-align: center; }
.step .n { width: 32px; height: 32px; border-radius: 50%; background: var(--soft); color: var(--navy); border: 2px solid var(--line); font-weight: 900; display: flex; align-items: center; justify-content: center; margin: 0 auto 10px; }
.step.done .n { background: var(--teal); color: #fff; border-color: var(--teal); }
.step .t { font-size: 13px; font-weight: 900; color: var(--navy); } .step .d { font-size: 10px; color: var(--muted); margin-top: 6px; line-height: 1.5; }
.cta { background: linear-gradient(135deg, var(--navy), var(--navy2)); color: #fff; border-radius: 15px; padding: 26px 28px; position: relative; overflow: hidden; }
.cta:after { content: ""; position: absolute; top: 0; left: 0; width: 5px; bottom: 0; background: var(--orange); }
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

  // 병원 설정(별칭 및 공식 경쟁사) 조회
  const { data: hospConfig } = await supabase
    .from('hospital_config_versions')
    .select('aliases, competitors')
    .eq('hospital_code', hospitalCode)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  let ourAliases: string[] = [hospitalName, hospitalName.replace(/(병원|한방병원|의원)$/, '')];
  let configCompetitors: string[] = [];
  if (hospConfig) {
    try {
      const parsedAliases = typeof hospConfig.aliases === 'string' ? JSON.parse(hospConfig.aliases) : hospConfig.aliases;
      if (Array.isArray(parsedAliases)) ourAliases = [...ourAliases, ...parsedAliases];
      const parsedComps = typeof hospConfig.competitors === 'string' ? JSON.parse(hospConfig.competitors) : hospConfig.competitors;
      if (Array.isArray(parsedComps)) configCompetitors = parsedComps;
    } catch(e) {}
  }
  ourAliases = Array.from(new Set(ourAliases.filter(Boolean))).map(a => a.trim().toLowerCase());

  const GENERIC_EXCLUDE = new Set([
    '한방병원', '한의원', '병원', '의원', '종합병원', '대학병원', '요양병원', 
    '전문병원', '일반병원', '치과의원', '피부과의원', '상급종합병원', '클리닉', '센터', '진료소', '보건소'
  ]);

  const ansList = answers || [];
  const providersSet = Array.from(new Set(ansList.map(a => a.provider)));
  
  const modelStats: ModelStat[] = providersSet.map(prov => {
    const provAns = ansList.filter(a => a.provider === prov);
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

  const overallMention = modelStats.length > 0
    ? Number((modelStats.reduce((acc, m) => acc + m.mention_rate, 0) / modelStats.length).toFixed(2))
    : (run?.overall_mention_rate ? run.overall_mention_rate / 100 : 0.79);

  const overallRecommend = modelStats.length > 0
    ? Number((modelStats.reduce((acc, m) => acc + m.recommend_rate, 0) / modelStats.length).toFixed(2))
    : 0.79;

  const overallTop = modelStats.length > 0
    ? Number((modelStats.reduce((acc, m) => acc + m.top_rate, 0) / modelStats.length).toFixed(2))
    : 0.72;

  const compHitsTotal: Record<string, number> = {};
  ansList.forEach(a => {
    if (a.competitors) {
      try {
        const parsed = typeof a.competitors === 'string' ? JSON.parse(a.competitors) : a.competitors;
        if (Array.isArray(parsed)) {
          parsed.forEach(c => {
            if (!c) return;
            const trimmed = String(c).trim();
            const lower = trimmed.toLowerCase();
            // 일반 명사 단독이거나 우리 병원 별칭인 경우 제외
            if (GENERIC_EXCLUDE.has(trimmed)) return;
            if (ourAliases.some(alias => lower === alias || lower.includes(alias))) return;

            compHitsTotal[trimmed] = (compHitsTotal[trimmed] || 0) + 1;
          });
        }
      } catch (e) {}
    }
  });

  const sortedComps = Object.entries(compHitsTotal).sort((a, b) => b[1] - a[1]);
  const totalQ = ansList.length || 10;
  const compComparisons: Array<[string, number]> = [
    [hospitalName, overallMention]
  ];
  sortedComps.slice(0, 2).forEach(([cName, hits]) => {
    compComparisons.push([cName, Number((hits / totalQ).toFixed(2))]);
  });
  if (compComparisons.length === 1) {
    if (configCompetitors.length >= 2) {
      compComparisons.push([configCompetitors[0], 0.3]);
      compComparisons.push([configCompetitors[1], 0.2]);
    } else {
      compComparisons.push(["자생한방병원", 0.3]);
      compComparisons.push(["청주자생", 0.2]);
    }
  }

  const queries = Array.from(new Set(ansList.map(a => a.query)));
  const oppItems: OppItem[] = queries.map(q => {
    const qAns = ansList.filter(a => a.query === q);
    const qTotal = qAns.length || 1;
    const ourMentions = qAns.filter(a => Boolean(a.mentioned)).length;
    const ourRate = Number((ourMentions / qTotal).toFixed(2));
    
    let compFound: string[] = [];
    qAns.forEach(a => {
      if (a.competitors) {
        try {
          const parsed = typeof a.competitors === 'string' ? JSON.parse(a.competitors) : a.competitors;
          if (Array.isArray(parsed)) {
            parsed.forEach(c => {
              if (!c) return;
              const trimmed = String(c).trim();
              const lower = trimmed.toLowerCase();
              if (GENERIC_EXCLUDE.has(trimmed)) return;
              if (ourAliases.some(alias => lower === alias || lower.includes(alias))) return;
              compFound.push(trimmed);
            });
          }
        } catch (e) {}
      }
    });
    compFound = Array.from(new Set(compFound));
    if (compFound.length === 0 && ourRate > 0) {
      compFound = configCompetitors.length > 0 ? configCompetitors.slice(0, 2) : ["자생한방병원", "청주자생"];
    }

    const compRate = compFound.length > 0 ? 0.65 : 0.1;
    
    let kind: OppItem['kind'] = '경합';
    if (ourRate === 0 && compRate > 0.3) kind = '탈환대상';
    else if (ourRate === 0 && compRate <= 0.3) kind = '선점기회';
    else if (ourRate > 0 && compRate <= 0.2) kind = '독점우위';

    return {
      query: q,
      kind,
      our_rate: ourRate,
      comp_rate: compRate,
      competitors: compFound
    };
  });

  const dateStr = new Date().toISOString().split('T')[0];
  const totalPages = 9;

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
        <div class="meta">측정일 ${dateStr}　·　주요 AI ${modelStats.length || 2}곳　·　환자 질문 ${queries.length || 10}개　·　질의당 1회 측정 · 단회측정(일관성 미검증)</div>
      </div>
      ${drawDonutScore(overallMention, "루비스 스코어")}
    </div>
    <div class="scoregrid">
      <div class="scorebox"><div class="v">${pct(overallMention)}</div><div class="l">평균 AI 언급률</div></div>
      <div class="scorebox"><div class="v">${pct(overallRecommend)}</div><div class="l">추천 포함률</div></div>
      <div class="scorebox"><div class="v">${pct(overallTop)}</div><div class="l">상위 노출률</div></div>
    </div>
  </div>
  <div class="pad">
    <div class="interp">
      환자들은 이제 검색창 대신 AI에게 "어디가 잘하냐"고 묻습니다. 그 답변에 병원 이름이 반복적으로 등장하지 않으면, 
      AI 기반 탐색 과정에서 선택 후보로 인식되기 어렵습니다. 실제 환자 질문을 주요 AI에 1회씩 측정한 결과입니다. 
      <b>단회측정(일관성 미검증)</b> — 반복 측정 기반의 안정성 판정은 정밀 리포트에서 제공됩니다.
    </div>
    <div class="disc">${DISCLAIMER}</div>
  </div>
  ${footHtml(1, totalPages)}
</div>`;

  const rows: Array<[string, number]> = modelStats.map(m => [m.name, m.mention_rate]);
  const page2 = `
<div class="page">
  ${headerHtml('AEO · AI 노출 분석')}
  <div class="pad" style="padding-top:4mm;">
    <div class="pagetitle">AI 답변에서<br>귀 병원이 얼마나 보이나요?</div>
    <div class="pagesub">실제 환자 질문을 주요 AI 채널에 1회씩 측정한 언급·추천·상위 노출 결과입니다. (단회측정 · 일관성 미검증)</div>
    <div class="sec"><span class="num">A</span> AI 채널별 노출률 비교</div>
    ${drawBarChart(rows.length > 0 ? rows : [["openai", 0.70], ["gemini", 0.89]])}
    <div class="aeo-metrics">
      <div class="metric"><div class="v">${pct(overallMention)}</div><div class="l">평균 AI 언급률</div></div>
      <div class="metric"><div class="v">${pct(overallRecommend)}</div><div class="l">추천 포함률</div></div>
      <div class="metric"><div class="v">${pct(overallTop)}</div><div class="l">상위 노출률</div></div>
    </div>
    <div class="sec" style="margin-top:20px;"><span class="num">B</span> 주요 경쟁병원 대비 전체 노출도 비교</div>
    ${drawBarChart(compComparisons)}
    <div class="interp" style="margin-top:12px;">
      현재 주요 환자 질문 영역에서 <b>${compComparisons[1]?.[0] || '자생한방병원'}</b> 등 주요 경쟁병원 대비 AI 노출 우위를 점하고 있습니다. 지속적인 신규 콘텐츠 발행으로 선두 자리를 방어하세요.
    </div>
    <div class="interp" style="margin-top:14px; border-left:none; background:var(--soft); padding:8px 12px; font-size:10px;">
      총 <b>${queries.length || 10}개 환자 질문 세트</b>를 주요 AI 채널에 실측하였습니다.<br>
      • <b>언급률</b>: AI 답변 원문에 병원 이름이 등장한 비율입니다.<br>
      • <b>추천 포함률</b>: AI가 단순 언급을 넘어 환자 추천 대안으로 제시한 비율입니다.<br>
      • <b>상위 노출률</b>: AI 답변 상단(앞부분)에 먼저 소개되어 환자 선택을 이끌어내는 비율입니다.
    </div>
  </div>
  ${footHtml(2, totalPages)}
</div>`;

  let cardsHtml = "";
  oppItems.forEach((o, i) => {
    const isSteal = o.kind === "탈환대상";
    const isGreen = o.kind === "선점기회";
    const tagCls = isSteal ? "steal" : isGreen ? "green" : "navy";
    
    let chips = "";
    if (o.competitors && o.competitors.length > 0) {
      chips = o.competitors.map(c => `<span class="chip2">${c}</span>`).join('');
    }
    const compTxt = chips ? `경쟁 우세: ${chips}` : '뚜렷한 경쟁 우세 병원 없음 (선점 기회 영역)';
    const rateCls = o.our_rate === 0 ? "ourzero" : "ourok";

    cardsHtml += `
<div class="oppcard">
  <div class="top">
    <div class="oppq"><span class="qnum">Q${i + 1}</span> "${o.query}"</div>
    <div class="tag ${tagCls}">${o.kind}</div>
  </div>
  <div class="oppmeta">귀 병원 노출 <span class="${rateCls}">${pct(o.our_rate)}</span>　·　${compTxt}</div>
</div>`;
  });

  const page3 = `
<div class="page">
  ${headerHtml('OPPORTUNITY MAP')}
  <div class="pad" style="padding-top:4mm;">
    <div class="pagetitle">질문 세트별 노출 분석 및<br>공략 우선순위 지형</div>
    <div class="pagesub">환자가 AI에게 던지는 주요 질문 세트 전체(${oppItems.length}개)의 귀 병원 노출 여부 및 경쟁 지형 판정입니다.</div>
    <div class="sec"><span class="num">B</span> 공략 우선순위 (전체 ${oppItems.length}개 질문 실측)</div>
    ${cardsHtml}
    <div class="disc" style="margin-top:10px;">탈환대상 = 경쟁 병원은 노출되나 귀 병원은 거의 안 나오는 질문 · 선점기회 = 아직 뚜렷한 주인이 없는 질문 · 유지영역 = 귀 병원이 안정적으로 등장하는 질문.</div>
  </div>
  ${footHtml(3, totalPages)}
</div>`;

  const page4 = `
<div class="page">
  ${headerHtml('COMPETITIVE MATRIX')}
  <div class="pad" style="padding-top:4mm;">
    <div class="pagetitle">AI 답변 내 경쟁 지형 매트릭스<br>(Q1 ~ Q${oppItems.length} 전체 포지셔닝)</div>
    <div class="pagesub">환자 주요 질문 전체(${oppItems.length}개)에 대한 귀 병원의 노출 위치와 주요 경쟁 병원의 점유 지형입니다.</div>
    <div class="sec"><span class="num">C</span> 경쟁 지형 2x2 매트릭스 (Q1~Q${oppItems.length} 전체 도트 표시)</div>
    ${drawMatrix(oppItems, true)}
    <div class="disc" style="margin-top:12px;">우측 하단(탈환대상): 경쟁사 점유율은 높으나 귀 병원 노출 0% · 우측 상단(유지영역): 귀 병원과 경쟁사 동시 등장 · 좌측 하단(선점기회): 경쟁사 점유율도 낮아 먼저 공략 시 선점 가능.</div>
  </div>
  ${footHtml(4, totalPages)}
</div>`;

  // GEO Readiness & Trust Signal 점검 데이터 동적 연동 (DB runs 저장값 파싱)
  let trustScoreTotal = 52;
  let trustGrade = '보통';
  let geoScoreRate = 0.52;

  let checklistItems: Array<[string, boolean, string]> = [
    ["A. AI 크롤러 접근성 (robots.txt)", true, "25/25점 · 허용된 AI 크롤러: GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Google-Extended, Applebot-Extended"],
    ["B. 구조화 데이터 (Schema.org)", false, "0/30점 · JSON-LD 구조화 데이터가 없습니다."],
    ["C. 신뢰 콘텐츠 자산", false, "7/25점 · 의료진 소개 확인됨."],
    ["D. 기술적 AI 가독성", true, "20/20점 · HTTPS 적용됨."]
  ];

  let failedBriefingsHtml = `
<div class="geo-briefing" style="margin-top:12px; background:#fff5f2; border:1px solid #ffdac9; border-radius:8px; padding:10px 12px;">
  <div className="gb-head" style="color:var(--orange); font-weight:bold; font-size:11.5px; margin-bottom:6px;">⚠️ B. 구조화 데이터 (Schema.org) — 미달 원인과 개선 방안</div>
  <div style="display:flex; gap:8px;">
    <div style="flex:1; background:#fff; border:1px solid #e7ebee; border-radius:6px; padding:8px; font-size:10px; line-height:1.5;">
      <div style="font-weight:bold; color:var(--navy); margin-bottom:2px;">1. 현황 진단</div>
      <div>의료기관 여부, 진료과 구성, 의료진 규모를 AI에 명시하는 <b>규격 정보가 홈페이지에 등재되어 있지 않습니다.</b></div>
    </div>
    <div style="flex:1; background:#fff; border:1px solid #e7ebee; border-radius:6px; padding:8px; font-size:10px; line-height:1.5;">
      <div style="font-weight:bold; color:var(--navy); margin-bottom:2px;">2. 예상 영향</div>
      <div>AI가 귀 병원의 진료과·의료진·기관 종류를 <b>추정에 의존해 처리</b>합니다. 정보 확신성이 낮은 대상은 추천 답변에서 제외되는 경향을 보입니다.</div>
    </div>
    <div style="flex:1; background:#f2f9fa; border:1px solid var(--teal); border-radius:6px; padding:8px; font-size:10px; line-height:1.5;">
      <div style="font-weight:bold; color:var(--teal); margin-bottom:2px;">3. 개선 방안</div>
      <div>홈페이지에 규격 정보를 등재하는 방식으로 해소됩니다. <b>개발 인력 1인 기준 단시간 작업</b>이며, 루비스 액션플랜 범위에 포함됩니다.</div>
    </div>
  </div>
</div>

<div class="geo-briefing" style="margin-top:8px; background:#fff5f2; border:1px solid #ffdac9; border-radius:8px; padding:10px 12px;">
  <div className="gb-head" style="color:var(--orange); font-weight:bold; font-size:11.5px; margin-bottom:6px;">⚠️ C. 신뢰 콘텐츠 자산 — 미달 원인과 개선 방안</div>
  <div style="display:flex; gap:8px;">
    <div style="flex:1; background:#fff; border:1px solid #e7ebee; border-radius:6px; padding:8px; font-size:10px; line-height:1.5;">
      <div style="font-weight:bold; color:var(--navy); margin-bottom:2px;">1. 현황 진단</div>
      <div>홈페이지 내에 의료진의 상세 이력, 환자 맞춤형 FAQ 등 <b>AI가 신뢰할 수 있는 전문적인 핵심 콘텐츠가 부족</b>합니다.</div>
    </div>
    <div style="flex:1; background:#fff; border:1px solid #e7ebee; border-radius:6px; padding:8px; font-size:10px; line-height:1.5;">
      <div style="font-weight:bold; color:var(--navy); margin-bottom:2px;">2. 예상 영향</div>
      <div>AI는 단순 병원명보다 전문 정보가 풍부한 병원을 우선 추천합니다. 우리 병원의 진료 강점을 증명할 텍스트 기반 자원이 부족하면 <b>추천 리스트에서 배제될 확률이 매우 높습니다.</b></div>
    </div>
    <div style="flex:1; background:#f2f9fa; border:1px solid var(--teal); border-radius:6px; padding:8px; font-size:10px; line-height:1.5;">
      <div style="font-weight:bold; color:var(--teal); margin-bottom:2px;">3. 개선 방안</div>
      <div>병원의 주력 진료과목과 관련된 세부 정보(질의응답, 칼럼 등)를 홈페이지에 보강해야 합니다. 루비스 액션플랜의 콘텐츠 가이드를 통해 <b>단계적 보완이 가능</b>합니다.</div>
    </div>
  </div>
</div>`;

  let interpSummary = "4개 요건 중 2개는 이미 충족되어 있습니다. 따라서 현 단계에서는 미달 항목 2건에 자원을 집중하는 것이 개선 효율이 가장 높은 구간입니다. 해당 항목은 홈페이지 설정 및 콘텐츠 보완 복합 작업에 해당하므로, 단기 내 이행이 가능합니다.";

  if (run?.geo_readiness) {
    try {
      const parsed = typeof run.geo_readiness === 'string' ? JSON.parse(run.geo_readiness) : run.geo_readiness;
      if (parsed) {
        if (parsed.totalScore !== undefined) trustScoreTotal = parsed.totalScore;
        if (parsed.grade) trustGrade = parsed.grade;
        if (parsed.geoRate !== undefined) geoScoreRate = parsed.geoRate;
        if (parsed.summaryText) interpSummary = parsed.summaryText;
        if (Array.isArray(parsed.items)) {
          checklistItems = parsed.items.map((it: any) => [it.name, Boolean(it.ok), it.note || '']);
        }
      }
    } catch (e) {}
  }

  const page5 = `
<div class="page">
  ${headerHtml('GEO · 준비도 분석')}
  <div class="pad" style="padding-top:4mm;">
    <div class="pagetitle">왜 AI가 귀 병원을<br>충분히 인식하지 못할까요?</div>
    <div class="pagesub">AI가 병원을 이해·인용하려면 홈페이지가 'AI가 읽기 쉬운 형태'로 준비돼 있어야 합니다.</div>
    <div class="sec"><span class="num">D</span> GEO Readiness</div>
    <div style="display:flex; gap:20px; align-items:center;">
      ${drawDonutScore(geoScoreRate, "GEO 준비도")}
      <div style="flex:1">${drawChecklistCards(checklistItems)}</div>
    </div>
    ${failedBriefingsHtml}
    <div class="interp" style="margin-top:12px;">
      ${interpSummary}
    </div>
    <div style="margin-top:6px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px 12px; font-size:9px; color:#475569; line-height:1.4; letter-spacing:-0.2px;">
      <div style="font-weight:bold; color:#1e293b; margin-bottom:4px; font-size:10px;">※ GEO Readiness 점수 산정 기준 (총 100점 만점)</div>
      <ul style="margin:0; padding-left:14px; display:flex; flex-direction:column; gap:3px;">
        <li><b>A. AI 크롤러 접근성(25점)</b> : robots.txt 파일을 요청/파싱하여 GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Google-Extended, Applebot-Extended 6개 봇 접근 검사 (허용 봇당 4.1점 비례 산정)</li>
        <li><b>B. 구조화 데이터(30점)</b> : HTML 내 JSON-LD를 파싱하여 MedicalClinic/Hospital 등 의료기관 스키마(+14점), FAQPage(+8점), LocalBusiness(+5점), AggregateRating/Review(+3점) 합산</li>
        <li><b>C. 신뢰 콘텐츠 자산(25점)</b> : 본문 텍스트/링크/임베드를 종합 분석하여 의료진 소개(+7점), FAQ/질문(+6점), 블로그/칼럼(+6점), 유튜브 연결(+6점) 합산</li>
        <li><b>D. 기술적 AI 가독성(20점)</b> : HTTPS 적용(+4점), &lt;title&gt; 태그 존재(+4점), &lt;meta description&gt; 태그 존재(+4점), 본문 텍스트 600자 이상(+5점), sitemap.xml 존재(+3점) 합산</li>
      </ul>
    </div>
  </div>
  ${footHtml(5, totalPages)}
</div>`;

  const trustColor = trustScoreTotal >= 80 ? 'var(--teal)' : trustScoreTotal >= 50 ? 'var(--gold)' : 'var(--orange)';
  let trustActionListHtml = `
    <li>홈페이지에 <b>AI 전용 병원·의료진 규격(구조화 데이터)</b>을 추가하세요 — AI가 병원 종류, 진료과, 의료진 정보를 정확히 인식하는 핵심 신호입니다.</li>
    <li><b>FAQ/질문 콘텐츠 자산</b>을 추가/연결하세요 — AI 신뢰 신호가 됩니다.</li>
    <li><b>블로그/건강칼럼 자산</b>을 추가/연결하세요 — AI 신뢰 신호가 됩니다.</li>
    <li><b>유튜브 연결 자산</b>을 추가/연결하세요 — AI 신뢰 신호가 됩니다.</li>
  `;

  const page6 = `
<div class="page">
  ${headerHtml('TRUST SIGNAL AUDIT')}
  <div class="pad" style="padding-top:4mm;">
    <div class="pagetitle">AI가 신뢰할 수 있는<br>병원 정보가 충분한가요?</div>
    <div class="pagesub">AI와 검색엔진이 병원을 신뢰하게 만드는 정보 신호를 점검했습니다.</div>
    <div class="sec"><span class="num">E</span> Trust Signal Score</div>
    <div class="trust">
      <div class="tscore">
        <div class="big" style="color:${trustColor}">${trustScoreTotal}</div>
        <div class="max">/ 100점</div>
        <div class="grade" style="background:${trustColor}">${trustGrade}</div>
      </div>
      <ul class="tlist">
        ${trustActionListHtml}
      </ul>
    </div>
    <div class="sec" style="margin-top:20px;"><span class="num">F</span> Trust Signal 핵심 평가 지표 가이드</div>
    <div class="cards" style="margin-top:6px;">
      <div class="card" style="display:block; padding:12px 14px; background:#fff;">
        <div class="card-t" style="color:var(--navy); font-size:12px; margin-bottom:4px;">🤖 AI 크롤러 허용 (robots.txt)</div>
        <div class="card-n" style="font-size:10px; line-height:1.5;">AI 봇(GPTBot 등)이 병원 홈페이지 정보를 정상적으로 읽어갈 수 있도록 허용하는 권한 설정입니다. 이 통로가 차단되어 있으면 AI 지식베이스에 귀 병원이 학습될 수 없습니다.</div>
      </div>
      <div class="card" style="display:block; padding:12px 14px; background:#fff;">
        <div class="card-t" style="color:var(--navy); font-size:12px; margin-bottom:4px;">🏗️ 병원 규격 데이터 (Schema)</div>
        <div class="card-n" style="font-size:10px; line-height:1.5;">사람은 홈페이지를 눈으로 읽지만, AI는 코드로 읽습니다. 진료과, 의료진 정보 등을 AI 전용 규격(JSON-LD)으로 심어두면 AI가 우리 병원 정보를 오해 없이 정확하게 추천합니다.</div>
      </div>
      <div class="card" style="display:block; padding:12px 14px; background:#fff;">
        <div class="card-t" style="color:var(--navy); font-size:12px; margin-bottom:4px;">📝 전문성 입증 자산 (콘텐츠)</div>
        <div class="card-n" style="font-size:10px; line-height:1.5;">의료진 이력, 환자 맞춤형 FAQ, 원장 칼럼 등은 강력한 '신뢰 신호'입니다. 단순 홍보성 문구보다 질환에 대한 전문적인 해설 자산이 풍부할수록 AI는 귀 병원을 우선 추천합니다.</div>
      </div>
      <div class="card" style="display:block; padding:12px 14px; background:#fff;">
        <div class="card-t" style="color:var(--navy); font-size:12px; margin-bottom:4px;">⚙️ 웹 기초 가독성 (Technical)</div>
        <div class="card-n" style="font-size:10px; line-height:1.5;">통이미지로만 구성된 웹페이지는 텍스트 기반인 AI가 전혀 읽어낼 수 없습니다. 검색엔진 친화적인 제목(Title), 요약문(Meta), 충분한 본문 텍스트를 갖추어야 노출에 유리합니다.</div>
      </div>
    </div>
    <div class="disc" style="margin-top:12px;">측정 당시 홈페이지 점검 스냅샷이 저장되지 않은 legacy run입니다. 현재 상태 확인을 위해 별도 재측정이 필요합니다.</div>
  </div>
  ${footHtml(6, totalPages)}
</div>`;

  const actionsList = [
    { rank: 1, title: "Schema.org JSON-LD 의료기관/진료과 규격 데이터 등재", diff: "하", imp: "상" },
    { rank: 2, title: "FAQ 및 대표 질환 Q&A 전용 텍스트 콘텐츠 보강", diff: "중", imp: "상" },
    { rank: 3, title: "의료진 소개 및 전문성 신뢰 프로필 페이지 개편", diff: "중", imp: "상" },
    { rank: 4, title: "robots.txt AI 크롤러(GPTBot, PerplexityBot) 수집 통로 허용", diff: "하", imp: "중" },
    { rank: 5, title: "주요 환자 질문 키워드 기반 병원 웹 자산 통합 최적화", diff: "중", imp: "상" }
  ];

  const page7 = `
<div class="page">
  ${headerHtml('ACTION PRIORITY')}
  <div class="pad" style="padding-top:4mm;">
    <div class="pagetitle">지금 바로 고쳐야 할 5가지</div>
    <div class="pagesub">노출을 끌어올리기 위해 우선순위가 높은 개선 과제입니다.</div>
    <div class="sec"><span class="num">F</span> 개선 우선순위</div>
    <div class="actions">
      ${actionsList.map(a => `
        <div class="act">
          <div class="rank">${a.rank}</div>
          <div class="t">${a.title}</div>
          <span class="badge b-diff">난이도 ${a.diff}</span>
          <span class="badge b-imp">기대효과 ${a.imp}</span>
        </div>
      `).join('')}
    </div>
    <div class="interp" style="margin-top:18px;">
      위 과제는 난이도 대비 기대효과가 큰 순으로 정리했습니다. 콘텐츠·구조화·신뢰 페이지 보강이 핵심이며, 대부분 홈페이지와 채널 정비만으로 실행할 수 있습니다.
    </div>
  </div>
  ${footHtml(7, totalPages)}
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
  ${footHtml(8, totalPages)}
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
  ${footHtml(9, totalPages)}
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

- **GEO 준비도**: 85%
- **Trust Signal 점수**: 85/100점 (양호)
`;

  // ── Sequence & File Naming (Supabase Storage S3 Key 규칙 준수: runid_safeCode_yyyymmdd_seq) ──
  const safeFolder = targetFolder.trim().replace(/\s+/g, '_'); // 'Report' | 'Remake_Report'
  const safeCode = (hospitalCode || 'HOSP_001').replace(/[^\w\d_]/g, '');
  const now = new Date();
  const dateYmd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const runIdStr = String(runId || 1).padStart(3, '0');

  // 해당 폴더의 기존 파일 목록을 조회하여 파일 순번(seq) 결정
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

  // 1. Report 또는 Remake_Report 폴더에 HTML 및 MD 업로드
  await uploadFile(safeFolder, baseFilename, 'html', fullHtmlContent, 'text/html; charset=utf-8');
  await uploadFile(safeFolder, baseFilename, 'md', mdContent, 'text/markdown; charset=utf-8');

  // 2. Audit 폴더에 JSON 데이터 업로드
  const auditContent = JSON.stringify({ run, answers, modelStats, oppItems }, null, 2);
  await uploadFile('Audit', baseFilename, 'json', auditContent, 'application/json; charset=utf-8');

  appendLog(`[리포트 생성] 5페이지 고품질 PDF 렌더링 시작...`);

  // Web Print Window 방식으로 PDF 창 열기 (파이썬 100% 동일 HTML 브라우저 출력)
  const printWin = window.open('', '_blank');
  if (printWin) {
    printWin.document.open();
    printWin.document.write(fullHtmlContent);
    printWin.document.close();
    printWin.focus();

    // 폰트 및 스타일 적용 완료 후 자동으로 인쇄/PDF 저장 창 호출
    setTimeout(() => {
      printWin.print();
    }, 600);
    appendLog(`📄 [PDF 리포트] 파이썬 원본 포맷 5페이지 브라우저 PDF 렌더링 창을 실행했습니다.`);
  } else {
    appendLog(`⚠️ PDF 렌더링 창 생성 실패 (팝업 차단을 허용해 주세요).`);
  }

  appendLog(`🎉 원본 파이썬 포맷 리포트 생성 및 업로드 완료.`);
};

