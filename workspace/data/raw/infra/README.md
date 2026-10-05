# raw/infra — 입주 전 기반시설 점검 원본

`tools/regiontools/build_infra.py` 가 읽는 원본입니다. 용량이 커서 저장소에는 올리지 않고(`.gitignore`) 공공데이터포털에서 다시 내려받습니다.
공공데이터포털 파일데이터는 로그인 없이도 받을 수 있지만, 받기 버튼을 누르면 안내창("…에 변경된 데이터입니다")이 먼저 뜹니다.

| 파일(이름에 아래 낱말이 있으면 됨) | 데이터셋 | 갱신 | 이용허락 |
|---|---|---|---|
| `*초등학교통학구역*.zip` | [한국교육시설안전원 초등학교통학구역 15159265](https://www.data.go.kr/data/15159265/fileData.do) (SHP, EPSG:5186) | 3월·9월 | 제한 없음 |
| `*학교학구도연계정보*.csv` | [학교학구도연계정보 15159266](https://www.data.go.kr/data/15159266/fileData.do) | 3월·9월 | 제한 없음 |
| `*초중등학교위치*.csv` | [초중등학교위치 15159184](https://www.data.go.kr/data/15159184/fileData.do) | 3월·9월 | 제한 없음 |
| `*버스정류장 위치정보*.csv` | [국토교통부 전국 버스정류장 위치정보 15067528](https://www.data.go.kr/data/15067528/fileData.do) | 연 1회(10월) | 제한 없음 |

도구가 만들어 두는 것: `elem_zone/`(zip 을 영문 이름으로 푼 SHP), `교육재정알리미_신설예정학교_<날짜>.json`(그날 받은 신설예정학교 전체 목록 원문).

만들기: `.venv/bin/python tools/regiontools/build_infra.py incheon-gyeyang` (키: `.env.local`의 V-World·data.go.kr, 캐시는 저장소 밖 `--cache-dir`).
