import React from 'react';

interface IframeModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  title: string;
}

const IframeModal: React.FC<IframeModalProps> = ({ isOpen, onClose, url, title }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-8">
      <div className="bg-white w-full max-w-6xl h-full flex flex-col rounded-xl shadow-2xl overflow-hidden border border-gray-300">
        <div className="flex items-center justify-between p-4 border-b bg-gray-100">
          <div>
            <h2 className="font-bold text-lg text-slate-800">{title}</h2>
            <p className="text-xs text-gray-500 mt-1">{url}</p>
          </div>
          <button 
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-md font-medium transition-colors"
          >
            닫기
          </button>
        </div>
        <div className="flex-1 bg-gray-50 relative">
          {/* Iframe with sandbox attributes for security but allowing scripts */}
          <iframe 
            src={url} 
            className="w-full h-full border-none"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
            title="Internal Web View"
          />
          {/* Disclaimer if frame is blocked */}
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center -z-10 text-gray-400 p-8 text-center">
            <span className="text-4xl mb-4">🌐</span>
            <p>보안 정책(X-Frame-Options)으로 인해 표시되지 않는 사이트일 수 있습니다.</p>
            <p>이 경우 새 창으로 열기를 시도해 주세요.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IframeModal;
