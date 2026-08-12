export interface AIResponse {
  content: string;
  confidenceScore: number;
}

export interface AIProviderConfig {
  apiKey: string;
}

export class AIProviderService {
  constructor(private configs: Record<string, AIProviderConfig>) {}

  async callOpenAI(prompt: string): Promise<AIResponse> {
    // Stub for OpenAI API call
    console.log('Calling OpenAI with prompt:', prompt);
    return {
      content: "This is a simulated response from OpenAI.",
      confidenceScore: 0.95
    };
  }

  async callGemini(prompt: string): Promise<AIResponse> {
    // Stub for Gemini API call
    console.log('Calling Gemini with prompt:', prompt);
    return {
      content: "This is a simulated response from Gemini.",
      confidenceScore: 0.88
    };
  }

  async callPerplexity(prompt: string): Promise<AIResponse> {
    // Stub for Perplexity API call
    console.log('Calling Perplexity with prompt:', prompt);
    return {
      content: "This is a simulated response from Perplexity.",
      confidenceScore: 0.92
    };
  }
}

// Singleton instance
export const aiService = new AIProviderService({
  openai: { apiKey: import.meta.env.VITE_OPENAI_API_KEY || '' },
  gemini: { apiKey: import.meta.env.VITE_GEMINI_API_KEY || '' },
  perplexity: { apiKey: import.meta.env.VITE_PERPLEXITY_API_KEY || '' },
});
