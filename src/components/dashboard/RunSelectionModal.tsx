import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

interface RunItem {
  id: number;
  hospital_code: string;
  config_version: string;
  started_at: string;
  status: string;
  total_tasks: number;
  completed_tasks: number;
}

interface RunSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  hospitalCode: string;
  title: string;
  onSelectRun: (runId: number) => void;
}

export const RunSelectionModal: React.FC<RunSelectionModalProps> = ({
  isOpen,
  onClose,
  hospitalCode,
  title,
  onSelectRun,
}) => {
  const [runs, setRuns] = useState<RunItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && hospitalCode) {
      fetchRuns();
    }
  }, [isOpen, hospitalCode]);

  const fetchRuns = async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: err } = await supabase
        .from('runs')
        .select('*')
        .eq('hospital_code', hospitalCode)
        .order('id', { ascending: false });

      if (err) throw err;
      setRuns(data || []);
    } catch (e: any) {
      setError(e.message || '진단 기록을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gray-100 border-b flex justify-between items-center">
          <h3 className="text-lg font-bold text-gray-800">
            📋 진단 기록 선택 ({title})
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-xl font-bold"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="text-center py-8 text-gray-500">진단 기록 불러오는 중...</div>
          ) : error ? (
            <div className="text-center py-8 text-red-500">{error}</div>
          ) : runs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              해당 병원의 진단 기록이 존재하지 않습니다. 먼저 [AI 가시성 진단 실행]을 진행하세요.
            </div>
          ) : (
            <table className="min-w-full text-sm divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Run ID</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">버전</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">시작 일시</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">상태</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">완료/전체</th>
                  <th className="px-4 py-2 text-center font-medium text-gray-500">선택</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {runs.map((run) => (
                  <tr key={run.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-semibold text-gray-900">#{run.id}</td>
                    <td className="px-4 py-3 text-gray-600">{run.config_version || '-'}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {new Date(run.started_at).toLocaleString('ko-KR')}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          run.status === 'SUCCESS'
                            ? 'bg-green-100 text-green-800'
                            : run.status === 'RUNNING'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        {run.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {run.completed_tasks || 0} / {run.total_tasks || 0}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => {
                          onSelectRun(run.id);
                          onClose();
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-xs font-semibold transition-colors"
                      >
                        선택
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-gray-50 border-t flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-800 text-sm rounded transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};

export default RunSelectionModal;
