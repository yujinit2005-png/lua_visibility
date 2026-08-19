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

const corsProxyPlugin = () => {
  return {
    name: 'cors-proxy',
    configureServer(server: any) {
      server.middlewares.use('/api-proxy', async (req: any, res: any) => {
        const urlParam = new URL(req.url, `http://${req.headers.host}`).searchParams.get('url');
        if (!urlParam) {
          res.statusCode = 400;
          res.end('Missing url parameter');
          return;
        }
        try {
          const fetchRes = await fetch(urlParam, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
              'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
            },
            signal: AbortSignal.timeout(8000)
          });
          let text = await fetchRes.text();
          
          const isSuspicious = text.length < 2000 || text.includes('location.reload') || text.includes('location.href=');
          const setCookie = fetchRes.headers.get('set-cookie');
          
          if (isSuspicious && setCookie) {
             const secondRes = await fetch(urlParam, {
               headers: {
                 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                 'Cookie': setCookie
               }
             });
             text = await secondRes.text();
          }

          res.setHeader('Content-Type', 'text/html');
          res.end(text);
        } catch (e: any) {
          res.statusCode = 500;
          res.end('Error fetching: ' + e.message);
        }
      });
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), pythonServerPlugin(), corsProxyPlugin()],
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

