-- hospital_config_versions 테이블에 네이버 전용 질문셋(naver_queries) 컬럼 추가
ALTER TABLE public.hospital_config_versions 
ADD COLUMN IF NOT EXISTS naver_queries text;
