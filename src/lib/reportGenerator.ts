import { supabase } from './supabase';

declare global {
  interface Window {
    html2pdf: any;
  }
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
    // 1. Fetch latest run for the hospital
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

  // 2. Fetch answers for this run
  const { data: answers, error: ansError } = await supabase
    .from('answers')
    .select('*')
    .eq('run_id', runId);

  if (ansError) {
    appendLog(`❌ 답변 데이터를 불러오는데 실패했습니다.`);
    return;
  }

  const successRate = run.success_rate || 0;
  const mentionRate = run.overall_mention_rate || 0;

  appendLog(`[리포트 생성] HTML/MD 렌더링 중...`);

  // 3. Generate HTML Content (Simplified for now based on sales_pdf.py concepts)
  const dateStr = new Date().toISOString().split('T')[0];
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${hospitalName} AI 가시성 진단 리포트</title>
  <style>
    body { font-family: sans-serif; padding: 20px; color: #333; }
    h1 { color: #0f766e; }
    .card { border: 1px solid #e5e7eb; padding: 15px; border-radius: 8px; margin-bottom: 15px; }
    .metric { font-size: 24px; font-weight: bold; color: #2563eb; }
  </style>
</head>
<body>
  <h1>[영업용 리포트] ${hospitalName}</h1>
  <p><strong>진단 일시:</strong> ${dateStr} (Run ID: #${runId})</p>
  <div class="card">
    <h3>수집 성공률: <span class="metric">${successRate}%</span></h3>
    <h3>AI 종합 언급률: <span class="metric">${mentionRate}%</span></h3>
  </div>
  <h2>질문별 수집 및 언급 현황</h2>
  <ul>
    ${(answers || []).map(a => `<li>[${a.provider}] <strong>${a.query}</strong>: ${a.mentioned ? '✔ 노출' : '❌ 미노출'}</li>`).join('')}
  </ul>
</body>
</html>
  `;

  // 4. Generate Markdown Content
  const mdContent = `
# [영업용 리포트] ${hospitalName}
- **진단 일시**: ${dateStr}
- **Run ID**: #${runId}
- **수집 성공률**: ${successRate}%
- **종합 언급률**: ${mentionRate}%

---

## 세부 답변 목록
${(answers || []).map(a => `### [${a.provider}] Q: ${a.query}\n- 상태: ${a.ok ? '성공' : '실패'}\n- 요약: ${a.answer_text ? a.answer_text.substring(0, 100) : '없음'}\n`).join('\n')}
  `;

  // 5. Sequence Name Generation
  // List files in targetFolder to find next sequence
  const { data: existingFiles } = await supabase.storage.from('lua_visibility_file').list(targetFolder);
  let nextSeq = 1;
  if (existingFiles) {
    const seqs = existingFiles
      .map(f => parseInt(f.name.substring(0, 3)))
      .filter(n => !isNaN(n));
    if (seqs.length > 0) {
      nextSeq = Math.max(...seqs) + 1;
    }
  }
  const seqStr = String(nextSeq).padStart(3, '0');
  const filename = `${seqStr}_${hospitalName}_진단`;

  appendLog(`[리포트 업로드] 파일명: ${filename}`);

  // Helper to upload file to Supabase storage
  const uploadFile = async (path: string, content: string | Blob, contentType: string) => {
    const { error } = await supabase.storage
      .from('lua_visibility_file')
      .upload(path, content, { contentType, upsert: true });
    if (error) appendLog(`❌ 업로드 실패: ${path} - ${error.message}`);
    else appendLog(`✅ 업로드 완료: ${path}`);
  };

  // 6. Upload HTML and MD to targetFolder
  await uploadFile(`${targetFolder}/${filename}.html`, htmlContent, 'text/html');
  await uploadFile(`${targetFolder}/${filename}.md`, mdContent, 'text/markdown');

  // 7. Upload Audit Log to Audit/
  const auditContent = JSON.stringify({ run, answers }, null, 2);
  await uploadFile(`Audit/${filename}_audit.json`, auditContent, 'application/json');

  // 8. Generate and Upload PDF to targetFolder
  appendLog(`[리포트 생성] PDF 렌더링 시작...`);
  const element = document.createElement('div');
  element.style.position = 'absolute';
  element.style.left = '-9999px';
  element.style.top = '-9999px';
  element.style.width = '800px';
  element.innerHTML = htmlContent;
  document.body.appendChild(element);
  
  if (window.html2pdf) {
    try {
      const opt = {
        margin: 10,
        filename: `${filename}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };
      const pdfBlob = await window.html2pdf().set(opt).from(element).output('blob');
      await uploadFile(`${targetFolder}/${filename}.pdf`, pdfBlob, 'application/pdf');
    } catch (err: any) {
      appendLog(`❌ PDF 렌더링 실패: ${err.message}`);
    } finally {
      document.body.removeChild(element);
    }
  } else {
    document.body.removeChild(element);
    appendLog(`❌ html2pdf.js 라이브러리를 로드할 수 없습니다.`);
  }

  appendLog(`🎉 리포트 생성 및 저장 프로세스 완료.`);
};
