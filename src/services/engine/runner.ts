import { aiService } from '../ai/providers';
import { Analyzer } from '../../utils/analyzer';

export interface RunOptions {
  hospitalKeywords: string[];
  questions: string[];
  platforms: ('openai' | 'gemini' | 'perplexity')[];
}

export class DiagnosticRunner {
  static async execute(options: RunOptions, onProgress?: (progress: number) => void) {
    const { hospitalKeywords, questions, platforms } = options;
    const totalTasks = questions.length * platforms.length;
    let completedTasks = 0;
    
    const results = [];

    // Process each question
    for (const question of questions) {
      // Process each platform in parallel
      const platformPromises = platforms.map(async (platform) => {
        let aiResponse;
        
        switch (platform) {
          case 'openai':
            aiResponse = await aiService.callOpenAI(question);
            break;
          case 'gemini':
            aiResponse = await aiService.callGemini(question);
            break;
          case 'perplexity':
            aiResponse = await aiService.callPerplexity(question);
            break;
        }

        const analysis = Analyzer.analyzeAnswer(aiResponse!.content, hospitalKeywords);
        
        completedTasks++;
        if (onProgress) {
          onProgress(Math.round((completedTasks / totalTasks) * 100));
        }

        return {
          question,
          platform,
          response: aiResponse,
          analysis
        };
      });

      const questionResults = await Promise.all(platformPromises);
      results.push(...questionResults);
    }

    return results;
  }
}
