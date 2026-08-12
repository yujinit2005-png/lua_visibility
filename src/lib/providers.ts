// src/lib/providers.ts

export interface ProviderConfig {
  apiKey: string;
}

export const callOpenAI = async (prompt: string, config: ProviderConfig) => {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1
    })
  });
  
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI Error: ${response.status} ${err}`);
  }
  
  const data = await response.json();
  return { text: data.choices[0].message.content };
};

export const callGemini = async (prompt: string, config: ProviderConfig) => {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${config.apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1 }
    })
  });
  
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini Error: ${response.status} ${err}`);
  }
  
  const data = await response.json();
  return { text: data.candidates[0].content.parts[0].text };
};

export const callPerplexity = async (prompt: string, config: ProviderConfig) => {
  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: 'sonar-pro',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1
    })
  });
  
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Perplexity Error: ${response.status} ${err}`);
  }
  
  const data = await response.json();
  return { text: data.choices[0].message.content };
};

export const callAnthropic = async (prompt: string, config: ProviderConfig) => {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true' // Required for client-side fetch
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20240620',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1
    })
  });
  
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic Error: ${response.status} ${err}`);
  }
  
  const data = await response.json();
  return { text: data.content[0].text };
};
