export interface AnalyzerResult {
  isMentioned: boolean;
  score: number;
}

export class Analyzer {
  static analyzeAnswer(answer: string, hospitalKeywords: string[]): AnalyzerResult {
    const lowerAnswer = answer.toLowerCase();
    
    // Check if any hospital keyword is mentioned in the answer
    const isMentioned = hospitalKeywords.some(keyword => 
      lowerAnswer.includes(keyword.toLowerCase())
    );

    // Basic scoring logic: if mentioned, score is 100, else 0
    // Real implementation would have more nuanced NLP scoring
    const score = isMentioned ? 100 : 0;

    return {
      isMentioned,
      score
    };
  }

  static calculateOverallScore(results: AnalyzerResult[]): number {
    if (results.length === 0) return 0;
    const total = results.reduce((acc, curr) => acc + curr.score, 0);
    return Math.round(total / results.length);
  }
}
