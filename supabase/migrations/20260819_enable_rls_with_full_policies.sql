-- ==============================================================================
-- 1. 모든 테이블 RLS 활성화 (UNRESTRICTED 보안 경고 해제)
-- ==============================================================================
ALTER TABLE public.hospitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_config_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_verification_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_items ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- 2. 기존 정책 정리 (중복 방지)
-- ==============================================================================
DROP POLICY IF EXISTS "Allow full access to hospitals" ON public.hospitals;
DROP POLICY IF EXISTS "Allow public read access to hospitals" ON public.hospitals;
DROP POLICY IF EXISTS "Allow full access to hospital_config_versions" ON public.hospital_config_versions;
DROP POLICY IF EXISTS "Allow public read access to hospital_config_versions" ON public.hospital_config_versions;
DROP POLICY IF EXISTS "Allow full access to runs" ON public.runs;
DROP POLICY IF EXISTS "Allow public read/insert/update access to runs" ON public.runs;
DROP POLICY IF EXISTS "Allow full access to answers" ON public.answers;
DROP POLICY IF EXISTS "Allow public read/insert/update access to answers" ON public.answers;
DROP POLICY IF EXISTS "Allow full access to web_verifications" ON public.web_verifications;
DROP POLICY IF EXISTS "Allow public access to web_verifications" ON public.web_verifications;
DROP POLICY IF EXISTS "Allow full access to web_verification_answers" ON public.web_verification_answers;
DROP POLICY IF EXISTS "Allow public access to web_verification_answers" ON public.web_verification_answers;
DROP POLICY IF EXISTS "Allow full access to system_config" ON public.system_config;
DROP POLICY IF EXISTS "Allow full access to verification_items" ON public.verification_items;

-- ==============================================================================
-- 3. 웹 프론트엔드/관리 프로그램용 정식 CRUD 허용 정책 생성
-- (SELECT, INSERT, UPDATE, DELETE 전체 허용)
-- ==============================================================================
CREATE POLICY "Allow full access to hospitals" 
ON public.hospitals FOR ALL 
TO anon, authenticated 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Allow full access to hospital_config_versions" 
ON public.hospital_config_versions FOR ALL 
TO anon, authenticated 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Allow full access to runs" 
ON public.runs FOR ALL 
TO anon, authenticated 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Allow full access to answers" 
ON public.answers FOR ALL 
TO anon, authenticated 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Allow full access to web_verifications" 
ON public.web_verifications FOR ALL 
TO anon, authenticated 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Allow full access to web_verification_answers" 
ON public.web_verification_answers FOR ALL 
TO anon, authenticated 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Allow full access to system_config" 
ON public.system_config FOR ALL 
TO anon, authenticated 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Allow full access to verification_items" 
ON public.verification_items FOR ALL 
TO anon, authenticated 
USING (true) 
WITH CHECK (true);
