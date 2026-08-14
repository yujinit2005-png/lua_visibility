import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { spawn } from 'child_process'
import path from 'path'

const pythonServerPlugin = () => {
  return {
    name: 'python-server',
    configureServer(server: any) {
      console.log('[LUA AI] Vite 플러그인: 파이썬 API 서버 자동 구동...');
      const pyProcess = spawn('python', [path.resolve(__dirname, 'src/services/api_server.py')], {
        stdio: 'inherit',
      });
      
      server.httpServer?.on('close', () => {
        console.log('[LUA AI] Vite 종료 감지: 파이썬 API 서버를 안전하게 종료합니다.');
        pyProcess.kill();
      });
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), pythonServerPlugin()],
  envPrefix: ['VITE_', 'OPENAI_', 'GEMINI_', 'PERPLEXITY_', 'ANTHROPIC_', 'NAVER_', 'NCP_'],
  server: {
    proxy: {
      '/api-openai': {
        target: 'https://api.openai.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-openai/, ''),
        secure: true,
      },
      '/api-perplexity': {
        target: 'https://api.perplexity.ai',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-perplexity/, ''),
        secure: true,
      },
      '/api-anthropic': {
        target: 'https://api.anthropic.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-anthropic/, ''),
        secure: true,
      },
      '/api-naver': {
        target: 'https://naverapihub.apigw.ntruss.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-naver/, ''),
        secure: true,
      },
    },
  },
})

