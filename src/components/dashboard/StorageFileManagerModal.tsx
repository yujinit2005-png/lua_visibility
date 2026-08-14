import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useHospitals } from '../../hooks/useHospitals';
import { 
  Folder, 
  FileText, 
  Download, 
  Eye, 
  RefreshCw, 
  Search, 
  HardDrive, 
  FileCode, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertCircle,
  ExternalLink,
  X
} from 'lucide-react';

interface StorageFileManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  hospitalName?: string;
}

interface StorageFileInfo {
  name: string;
  id?: string;
  folder: string;
  size: number;
  updated_at: string;
  created_at: string;
  extension: string;
  fullPath: string;
}

const FOLDERS = [
  { key: 'ALL', label: '전체 폴더', color: 'bg-slate-700' },
  { key: 'Report', label: 'Report (정규 리포트)', color: 'bg-blue-600' },
  { key: 'Remake_Report', label: 'Remake_Report (재실행 보완본)', color: 'bg-purple-600' },
  { key: 'Audit', label: 'Audit (진단 원본 JSON)', color: 'bg-emerald-600' },
];

export const StorageFileManagerModal: React.FC<StorageFileManagerModalProps> = ({
  isOpen,
  onClose,
  hospitalName = '',
}) => {
  const { hospitals } = useHospitals();
  const [selectedFolder, setSelectedFolder] = useState<string>('ALL');
  const [files, setFiles] = useState<StorageFileInfo[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [previewContent, setPreviewContent] = useState<{ title: string; content: string; ext: string } | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (type: 'success' | 'error', text: string) => {
    setActionMessage({ type, text });
    setTimeout(() => setActionMessage(null), 4000);
  };

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    const targetFolders = selectedFolder === 'ALL' 
      ? ['Report', 'Remake_Report', 'Audit'] 
      : [selectedFolder];

    const resultFiles: StorageFileInfo[] = [];

    try {
      for (const folder of targetFolders) {
        const { data, error } = await supabase.storage
          .from('lua_visibility_file')
          .list(folder, {
            limit: 100,
            offset: 0,
            sortBy: { column: 'created_at', order: 'desc' }
          });

        if (error) {
          console.warn(`Folder '${folder}' fetch warning:`, error.message);
          continue;
        }

        if (data) {
          data.forEach(item => {
            // 폴더 자체나 .emptyFolderPlaceholder 제외
            if (!item.name || item.name.startsWith('.')) return;
            const ext = item.name.split('.').pop()?.toLowerCase() || '';
            const fullPath = `${folder}/${item.name}`;

            resultFiles.push({
              name: item.name,
              id: item.id || undefined,
              folder,
              size: item.metadata?.size || 0,
              updated_at: item.updated_at || item.created_at || new Date().toISOString(),
              created_at: item.created_at || new Date().toISOString(),
              extension: ext,
              fullPath,
            });
          });
        }
      }

      // 최신 생성순 정렬
      resultFiles.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setFiles(resultFiles);
    } catch (e: any) {
      showToast('error', `파일 목록 조회 실패: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [selectedFolder]);

  useEffect(() => {
    if (isOpen) {
      fetchFiles();
      setSelectedFiles(new Set());
    }
  }, [isOpen, fetchFiles]);

  if (!isOpen) return null;

  // 병원 코드 -> 한글 병원명 치환 헬퍼 (예: 045_HOSP_001_20260814_01.html -> 045_청주필한방병원_20260814_01.html)
  const getDisplayName = useCallback((rawName: string) => {
    let result = rawName;
    hospitals.forEach(h => {
      if (h.hospital_code && h.name) {
        result = result.replace(new RegExp(h.hospital_code, 'g'), h.name);
      }
    });
    return result;
  }, [hospitals]);

  // 단일 파일 다운로드
  const handleDownloadFile = async (file: StorageFileInfo) => {
    const downloadName = getDisplayName(file.name);
    try {
      showToast('success', `📥 '${downloadName}' 다운로드 준비 중...`);
      const { data, error } = await supabase.storage
        .from('lua_visibility_file')
        .download(file.fullPath);

      if (error || !data) throw error || new Error('다운로드할 파일 데이터가 없습니다.');

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('success', `✅ '${downloadName}' 다운로드가 완료되었습니다.`);
    } catch (e: any) {
      showToast('error', `❌ 다운로드 실패: ${e.message}`);
    }
  };

  // 선택된 파일 일괄 다운로드
  const handleBulkDownload = async () => {
    if (selectedFiles.size === 0) return;
    const targetItems = files.filter(f => selectedFiles.has(f.fullPath));
    showToast('success', `📥 선택된 ${targetItems.length}개 파일 순차 다운로드를 시작합니다.`);
    
    for (const f of targetItems) {
      await handleDownloadFile(f);
      // 브라우저 팝업 차단 방지용 약간의 지연
      await new Promise(r => setTimeout(r, 400));
    }
  };

  // 파일 미리보기 (HTML, MD, JSON 등)
  const handlePreviewFile = async (file: StorageFileInfo) => {
    try {
      const { data, error } = await supabase.storage
        .from('lua_visibility_file')
        .download(file.fullPath);

      if (error || !data) throw error || new Error('미리보기 데이터를 불러올 수 없습니다.');

      if (file.extension === 'html') {
        const text = await data.text();
        const win = window.open('', '_blank');
        if (win) {
          win.document.open();
          win.document.write(text);
          win.document.close();
        } else {
          showToast('error', '팝업 차단이 설정되어 있어 새 창을 열 수 없습니다.');
        }
      } else {
        const text = await data.text();
        setPreviewContent({
          title: `${file.folder} / ${file.name}`,
          content: text,
          ext: file.extension
        });
      }
    } catch (e: any) {
      showToast('error', `미리보기 실패: ${e.message}`);
    }
  };

  // 파일 크기 포맷
  const formatSize = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 KB';
    const k = 1024;
    if (bytes < k) return `${bytes} B`;
    if (bytes < k * k) return `${(bytes / k).toFixed(1)} KB`;
    return `${(bytes / (k * k)).toFixed(1)} MB`;
  };

  // 날짜 포맷
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch {
      return dateStr;
    }
  };

  // 검색어 필터링
  const filteredFiles = files.filter(f => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return true;
    return f.name.toLowerCase().includes(term) || f.folder.toLowerCase().includes(term);
  });

  const isAllSelected = filteredFiles.length > 0 && filteredFiles.every(f => selectedFiles.has(f.fullPath));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(filteredFiles.map(f => f.fullPath)));
    }
  };

  const toggleSelectFile = (fullPath: string) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(fullPath)) next.delete(fullPath);
      else next.add(fullPath);
      return next;
    });
  };

  const getFileIcon = (ext: string) => {
    switch (ext) {
      case 'html': return <FileCode className="text-orange-500" size={16} />;
      case 'md': return <FileText className="text-blue-500" size={16} />;
      case 'json': return <FileSpreadsheet className="text-emerald-500" size={16} />;
      default: return <FileText className="text-gray-400" size={16} />;
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 font-sans">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[88vh] flex flex-col overflow-hidden border border-slate-700">
          
          {/* Header */}
          <div className="bg-slate-900 text-white px-6 py-3.5 flex justify-between items-center shadow-sm shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-orange-500/20 border border-orange-400/40 flex items-center justify-center text-orange-400">
                <HardDrive size={18} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold tracking-tight">Supabase 스토리지 파일 보관함</h2>
                  <span className="bg-orange-600/80 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                    lua_visibility_file
                  </span>
                  {hospitalName && (
                    <span className="text-xs text-slate-300 font-medium">
                      — [{hospitalName}]
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  진단 회차별 생성된 리포트(HTML/MD) 및 진단 원본 데이터(JSON)를 실시간으로 탐색하고 다운로드합니다.
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Toast Notification */}
          {actionMessage && (
            <div className={`px-6 py-2 text-xs font-bold flex items-center gap-2 transition-all ${
              actionMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-b border-emerald-200' : 'bg-red-50 text-red-800 border-b border-red-200'
            }`}>
              {actionMessage.type === 'success' ? <CheckCircle2 size={14} className="text-emerald-600" /> : <AlertCircle size={14} className="text-red-600" />}
              <span>{actionMessage.text}</span>
            </div>
          )}

          {/* Folder Tabs & Controls */}
          <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
            
            {/* Folder Tabs */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {FOLDERS.map(f => {
                const isActive = selectedFolder === f.key;
                return (
                  <button
                    key={f.key}
                    onClick={() => setSelectedFolder(f.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      isActive
                        ? 'bg-slate-800 text-white shadow-sm ring-2 ring-slate-400/40'
                        : 'bg-white text-slate-600 hover:bg-slate-200/70 border border-slate-200'
                    }`}
                  >
                    <Folder size={13} className={isActive ? 'text-orange-400' : 'text-slate-400'} />
                    <span>{f.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Right: Search & Action Buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-2 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="파일명 또는 폴더 검색..."
                  className="pl-8 pr-3 py-1 text-xs border border-slate-300 rounded-lg w-52 bg-white outline-none focus:border-orange-500 font-medium"
                />
              </div>

              <button
                onClick={fetchFiles}
                disabled={loading}
                className="flex items-center gap-1 px-3 py-1 text-xs font-bold bg-white text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors shadow-sm disabled:opacity-50"
                title="목록 새로고침"
              >
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                <span>새로고침</span>
              </button>

              {selectedFiles.size > 0 && (
                <button
                  onClick={handleBulkDownload}
                  className="flex items-center gap-1 px-3 py-1 text-xs font-bold bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all shadow-sm active:scale-95"
                >
                  <Download size={13} />
                  <span>선택 {selectedFiles.size}개 일괄 다운로드</span>
                </button>
              )}
            </div>
          </div>

          {/* Files Table Area */}
          <div className="flex-1 overflow-y-auto p-6 bg-slate-100/50">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-800 text-slate-200 font-bold border-b border-slate-700">
                  <tr>
                    <th className="py-2.5 px-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={isAllSelected}
                        onChange={toggleSelectAll}
                        className="rounded border-slate-300 cursor-pointer accent-orange-600"
                      />
                    </th>
                    <th className="py-2.5 px-3 w-36">폴더 (Category)</th>
                    <th className="py-2.5 px-3">파일명 (runid_병원명칭_yyyymmdd_seq)</th>
                    <th className="py-2.5 px-3 w-20 text-center">유형</th>
                    <th className="py-2.5 px-3 w-24 text-right">크기</th>
                    <th className="py-2.5 px-3 w-36 text-center">생성 일시</th>
                    <th className="py-2.5 px-3 w-36 text-center">관리 액션</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="text-center py-16 text-slate-400 font-semibold">
                        <RefreshCw className="animate-spin inline mr-2 text-orange-500" size={18} />
                        스토리지 파일 목록을 불러오는 중입니다...
                      </td>
                    </tr>
                  ) : filteredFiles.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-16 text-slate-400">
                        {searchTerm ? '검색어와 일치하는 파일이 없습니다.' : '보관함에 저장된 파일이 없습니다.'}
                      </td>
                    </tr>
                  ) : (
                    filteredFiles.map((file) => {
                      const isChecked = selectedFiles.has(file.fullPath);
                      return (
                        <tr
                          key={file.fullPath}
                          className={`hover:bg-orange-50/50 transition-colors ${isChecked ? 'bg-orange-50/80' : ''}`}
                        >
                          <td className="py-2 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleSelectFile(file.fullPath)}
                              className="rounded border-slate-300 cursor-pointer accent-orange-600"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md ${
                              file.folder === 'Report' ? 'bg-blue-100 text-blue-800' :
                              file.folder === 'Remake_Report' ? 'bg-purple-100 text-purple-800' :
                              'bg-emerald-100 text-emerald-800'
                            }`}>
                              <Folder size={11} />
                              {file.folder}
                            </span>
                          </td>
                          <td className="py-2 px-3 font-mono font-semibold text-slate-900 break-all">
                            <div className="flex items-center gap-1.5">
                              {getFileIcon(file.extension)}
                              <span>{getDisplayName(file.name)}</span>
                            </div>
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className="uppercase text-[10px] font-extrabold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                              {file.extension || 'FILE'}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-[11px] text-slate-600">
                            {formatSize(file.size)}
                          </td>
                          <td className="py-2 px-3 text-center font-mono text-[11px] text-slate-500">
                            {formatDate(file.created_at)}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => handlePreviewFile(file)}
                                className="flex items-center gap-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded text-[11px] font-bold border border-slate-200 transition-colors"
                                title={file.extension === 'html' ? '새 탭에서 리포트 열기' : '내용 미리보기'}
                              >
                                {file.extension === 'html' ? <ExternalLink size={12} className="text-orange-600" /> : <Eye size={12} />}
                                <span>{file.extension === 'html' ? '열기' : '보기'}</span>
                              </button>
                              <button
                                onClick={() => handleDownloadFile(file)}
                                className="flex items-center gap-0.5 bg-orange-50 hover:bg-orange-100 text-orange-700 px-2 py-1 rounded text-[11px] font-bold border border-orange-200 transition-colors"
                                title="내 컴퓨터로 다운로드"
                              >
                                <Download size={12} />
                                <span>다운로드</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex justify-between items-center shrink-0">
            <div className="text-xs text-slate-500 font-medium">
              총 <span className="font-bold text-slate-800">{files.length}</span>개 파일 (필터링: {filteredFiles.length}개)
            </div>
            <button
              onClick={onClose}
              className="bg-slate-800 hover:bg-slate-700 text-white px-5 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm"
            >
              닫기
            </button>
          </div>
        </div>
      </div>

      {/* Preview Modal for MD / JSON */}
      {previewContent && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-4 font-sans">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl h-[80vh] flex flex-col overflow-hidden border border-slate-400">
            <div className="bg-slate-900 text-white px-5 py-3 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-orange-400" />
                <span className="font-bold text-xs font-mono">{previewContent.title}</span>
              </div>
              <button
                onClick={() => setPreviewContent(null)}
                className="text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 p-4 overflow-y-auto bg-slate-50 font-mono text-xs text-slate-800 whitespace-pre-wrap leading-relaxed select-text">
              {previewContent.content}
            </div>
            <div className="bg-slate-100 px-5 py-2.5 border-t flex justify-end">
              <button
                onClick={() => setPreviewContent(null)}
                className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-1 rounded text-xs font-bold"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default StorageFileManagerModal;
