# 주택파동 공통규격 v1.4 제출본 (3번 · 주택파동)

종합상황판·지도 화면이 읽는 자료를 팀 공통규격 v1.4 의 CSV 8종으로 바꾼 결과다. 대상은 서울·경기·인천의 공공주택이고, DEMO 는 뺐다.

## 파일

| 파일 | 내용 |
|---|---|
| `정책_policies.csv` · `프로그램_programs.csv` · `정책사업연결_links.csv` | 헤더만(원천 없음) |
| `사업_projects.csv` | 공공주택 사업(LH 블록 + 계양 단지) |
| `사업식별자_identifiers.csv` | 지구·블록명, 로컬 사업번호, 번들 id, PNU, 법정동 코드, LH 지구·블록 코드 |
| `공급물량_units.csv` | 준공예정 유형별 물량, 공고 물량, 블록 전체 세대수 |
| `진행이력_events.csv` | 착공·공정·준공(예정)·모집공고·입주예정 |
| `원천_sources.csv` | 원천 10건 |
| `review_required.csv` | 공공 여부 불명, 이름 대조 연결, 날짜 충돌 등 검토 항목 |
| `conversion_report.md` | 원천별 변환·제외 건수, 검토 항목 수, 검증 결과(실행할 때마다 다시 쓴다) |
| `field_mapping.md` | 기존 필드 ↔ 규격 필드 대응, 판정 규칙, 제안 허용값, 규격 보완 제안 |

CSV 는 모두 UTF-8 BOM 이라 Excel 에서 한글이 그대로 보인다. 모르는 값은 빈 칸이다.

## 다시 만들기

저장소 루트에서 실행한다. Python 3 표준 라이브러리만 쓰고, 외부 호출은 하지 않는다.

```sh
python3 tools/common_v1_4/convert.py                       # 이 폴더의 CSV·검토 목록·보고서를 다시 쓴다
python3 tools/common_v1_4/validate.py exports/housing_wave_common_v1_4 \
        --spec-zip "공통규격 양식.zip"                      # 검증만(ZIP 을 주면 헤더도 대조)
```

- 시험 변환: `python3 tools/common_v1_4/convert.py --out <다른 폴더> --only "인천계양 테크노밸리 A2 블록,오산세교2(06택3) A-11"`. 로컬 ID 나 사업명을 쉼표로 넘긴다.
- 같은 입력이면 같은 파일이 나온다. 정렬이 고정돼 있고 실행 시각을 쓰지 않는다.
- 임시 ID(`WAVE-LHC-…`)는 원천 키(지구·블록)의 해시라, 원천에 다른 블록이 늘어도 바뀌지 않는다.
- 이 폴더의 `README.md`·`field_mapping.md` 는 직접 쓴 문서라 변환기가 덮어쓰지 않는다.

## 읽는 입력 (수정하지 않음)

`data/board/lh-completion.json`, `data/board/sources.json`, `registry/projects.json`, `regions/index.json`, `regions/incheon-gyeyang/projects.json`·`region.json`, `data/raw/lh/cwstt/lh_공사현황_인천계양_공정율_이력_20261003.csv`, `data/raw/lh/public/LH_건설공사현황_20260701_인천계양_추출.csv`, 그리고 제외 건수를 세려고 `regions/gwangju-gwangsan`·`regions/jeonnam-naju` 의 `projects.json`.

## 검증 항목

- UTF-8 BOM 과 헤더 일치
- 필수 칸, 허용값
- 날짜(`YYYY-MM-DD`·`YYYY-MM`, 실제 있는 날짜인지)와 숫자(양의 정수 세대수, 0~100 공정률)
- NULL 대용 글자(`null`·`None`·`-` 등)
- 로컬 사업 ID 중복
- 참조 무결성(사업·원천·정책·프로그램)
- DEMO 행, 같은 행 중복, 같은 기준 물량 중복
- 인증키처럼 보이는 값
