import { useState } from 'react';
import { Play, RotateCw } from 'lucide-react';

const Controller = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [platforms, setPlatforms] = useState({
    openai: true,
    gemini: true,
    perplexity: true,
    claude: false
  });

  const handleStart = () => {
    setIsRunning(true);
    setProgress(0);
    
    // Mock progress simulation
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsRunning(false);
          return 100;
        }
        return prev + 5;
      });
    }, 500);
  };

  return (
    <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
      <h3 className="text-lg font-semibold mb-6 flex items-center gap-2 text-foreground">
        <RotateCw className="text-primary" size={20} />
        Diagnostic Control Panel
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-3">AI Platforms</h4>
          <div className="space-y-3">
            {Object.entries(platforms).map(([key, value]) => (
              <label key={key} className="flex items-center space-x-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={value}
                  onChange={() => setPlatforms(p => ({ ...p, [key]: !p[key as keyof typeof p] }))}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary focus:ring-offset-background bg-input transition-all"
                />
                <span className="text-sm font-medium capitalize text-foreground group-hover:text-primary transition-colors">
                  {key === 'openai' ? 'OpenAI (GPT-4o)' : key}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-col justify-end space-y-6">
          {isRunning ? (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Running analysis...</span>
                <span className="font-medium text-primary">{progress}%</span>
              </div>
              <div className="w-full bg-secondary rounded-full h-2.5 overflow-hidden">
                <div 
                  className="bg-primary h-2.5 rounded-full transition-all duration-300 ease-out relative"
                  style={{ width: `${progress}%` }}
                >
                  <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                </div>
              </div>
            </div>
          ) : (
            <button 
              onClick={handleStart}
              className="w-full py-3 px-4 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-semibold flex items-center justify-center space-x-2 transition-all shadow-md hover:shadow-lg active:scale-[0.98]"
            >
              <Play size={18} fill="currentColor" />
              <span>Start Diagnosis</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Controller;
