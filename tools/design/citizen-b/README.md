# 일반사용자 B안 '신문 1면' 시제품

`docs/design/일반사용자-B안-신문.html` 한 파일을 만드는 원본이다. 앱에 연결하지 않은 단독 HTML 이고 file:// 로 연다.

```sh
cd tools/design/citizen-b
python3 build.py            # data/board/*.json + notices.json → docs/design/일반사용자-B안-신문.html
python3 build.py --fetch    # 로컬 서버(127.0.0.1:8000)에서 경기 공고를 다시 받아 notices.json 을 바꾼 뒤 빌드
```

- 앞으로 들어올 집: `ledger-map.json` `bySgg` 의 단계 02~05 사업 호수 합, 구가 있는 시는 시 하나로 묶는다.
- 들어올 해: `project-detail.json` 의 MOVE_IN(actual·plan) → COMPLETION → '연도 미정'.
- 지도: `region-map.json` `sgg`, 보기 상자 `view["41"]`. 라벨점(면 안에서 가장자리와 가장 먼 점)은 build.py 가 계산한다.
- 공고: `notices.json` = `/api/v1/notices?sido=41` 응답 스냅숏 + 받은 시각(`fetchedAt`). 키 값은 들어 있지 않다.
- 글꼴은 `../../assets/fonts/noto-sans-kr/noto-sans-kr.css`(외부 요청 없음). 오늘 날짜는 브라우저 날짜를 쓴다.
