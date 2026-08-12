import React from 'react';
import { CheckCircle2, XCircle, ExternalLink } from 'lucide-react';

const mockData = [
  { id: 1, keyword: 'LASIK Surgery Seoul', platform: 'OpenAI', aiMatch: true, webMatch: true },
  { id: 2, keyword: 'Best Ophthalmologist', platform: 'Gemini', aiMatch: true, webMatch: false },
  { id: 3, keyword: 'Cataract treatment cost', platform: 'Perplexity', aiMatch: false, webMatch: false },
];

const ComparisonTable = () => {
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden shadow-sm">
      <div className="p-6 border-b border-border flex justify-between items-center bg-secondary/20">
        <h3 className="text-lg font-semibold text-foreground">Cross-Verification Results</h3>
        <span className="text-sm px-3 py-1 bg-primary/10 text-primary rounded-full font-medium">
          Total Score: 85%
        </span>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-muted-foreground uppercase bg-secondary/50">
            <tr>
              <th className="px-6 py-4 font-medium">Keyword / Question</th>
              <th className="px-6 py-4 font-medium">Platform</th>
              <th className="px-6 py-4 font-medium text-center">AI Mention</th>
              <th className="px-6 py-4 font-medium text-center">Web UI verification</th>
              <th className="px-6 py-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {mockData.map((item) => (
              <tr key={item.id} className="border-b border-border hover:bg-secondary/30 transition-colors">
                <td className="px-6 py-4 font-medium text-foreground">{item.keyword}</td>
                <td className="px-6 py-4 text-muted-foreground">{item.platform}</td>
                <td className="px-6 py-4 text-center">
                  {item.aiMatch ? (
                    <CheckCircle2 className="inline text-green-500" size={18} />
                  ) : (
                    <XCircle className="inline text-red-500" size={18} />
                  )}
                </td>
                <td className="px-6 py-4 text-center">
                  {item.webMatch ? (
                    <span className="inline-flex items-center px-2 py-1 rounded-md bg-green-500/10 text-green-500 font-medium text-xs">
                      Verified
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-1 rounded-md bg-red-500/10 text-red-500 font-medium text-xs">
                      Failed
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  <button className="text-primary hover:text-primary/80 transition-colors inline-flex items-center gap-1 text-xs font-medium">
                    View <ExternalLink size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ComparisonTable;
