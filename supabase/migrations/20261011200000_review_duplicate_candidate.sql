-- 검토 목록 유형에 DUPLICATE_CANDIDATE(중복 사업 후보)를 더한다 — 공고 ↔ 사업 연결 확장(tools/ledger/notice-link.js, convert.js addNational).
-- 같은 공고의 같은 블록에 자동 연결된 두 사업(대개 LH 후보·발급 사업과 건축HUB 대용량 후보)은 병합하지 않고 이 유형으로 검토 목록에 싣는다.
-- schemas/ledger/review_required.schema.json 의 review_type enum 과 같은 목록이다(tests/js/supabase-ddl.test.cjs). 앞 마이그레이션은 고치지 않는다.
alter table ledger.review_required drop constraint review_required_review_type_check;
alter table ledger.review_required add constraint review_required_review_type_check
  check (review_type in ('SGG_UNRESOLVED','PUBLIC_SCOPE_UNKNOWN','DATE_CONFLICT','LINK_CANDIDATE','DUPLICATE_CANDIDATE'));
