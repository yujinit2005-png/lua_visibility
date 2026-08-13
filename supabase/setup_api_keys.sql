-- 1. system_config 테이블에 접근할 수 있도록 RLS 정책 추가 (프론트엔드에서 읽기 위해 필요)
DROP POLICY IF EXISTS "Allow public read access to system_config" ON public.system_config;
CREATE POLICY "Allow public read access to system_config" ON public.system_config FOR SELECT USING (true);

-- 2. API 키 데이터 초기 삽입 (기존 값이 있으면 덮어쓰기)
INSERT INTO public.system_config (id, key, value)
VALUES (
    gen_random_uuid(),
    'api_keys',
    '{
        "openai": "sk-proj-wk8QljK9GCTLiFzrxn_jmD4YU7yOdaB6r1hshEc",
        "gemini": "AQ.Ab8RN6LOckocCPX8IooRmRAXDr33Mqkr1j1LGvPpl",
        "perplexity": "pplx-qM5O3aHGYOCQetQOdeazcerY85dcWcMloB2S7",
        "naverId": "i8ciwrvzln",
        "naverSecret": "9EXRQssZga4OCcnnn1hdM3V9KlSEYzKefwJMvK2x",
        "anthropic": ""
    }'::jsonb
)
ON CONFLICT (id) DO NOTHING; -- id는 자동생성이지만, 혹시 key 기반 upsert가 필요하다면 아래 사용

-- 만약 key를 UNIQUE로 설정하고 싶다면 아래를 먼저 실행하세요 (선택 사항)
-- ALTER TABLE public.system_config ADD CONSTRAINT system_config_key_unique UNIQUE (key);
-- INSERT INTO public.system_config (key, value) VALUES ('api_keys', '...') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
