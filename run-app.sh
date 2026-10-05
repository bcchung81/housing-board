#!/usr/bin/env bash
# 로컬에서 지도를 연다: 정적 파일 + 버스 위치 중계(/api/bus) + 표준코드 해석(/api/v1/resolve) + 건물·인허가 요청 시 조회를 함께 여는 개발 서버(scripts/dev.js).
#   ./run-app.sh [포트=8000] [코드]       브라우저가 자동으로 열립니다(macOS). 열지 않으려면 NO_OPEN=1 ./run-app.sh
# 첫 화면은 표준코드로 엽니다(코드가 없으면 START_CODE, 그것도 없으면 41450 경기도 하남시):
#   시군구 5자리 → ?sgg=   법정동 8·10자리 → ?bjd=   필지(PNU) 19자리 → ?pnu=
#   지역 번들 주소로 열려면 region:<slug>  예) ./run-app.sh 8000 region:incheon-gyeyang
#   예) ./run-app.sh 8000 4145011100        하남시 미사동(법정동)
#       START_CODE=28245 ./run-app.sh       인천 계양구(번들 있음)
# 코드 해석에는 .env.local 의 공공데이터포털 키(DATA_GO_KR_KEY_RESOLVE_1… 또는 DATA_GO_KR_KEY)와 V-World 키가 필요합니다.
# 없으면 코드로 열 수 없어 계양 번들(?region=incheon-gyeyang)로 엽니다. 키 이름은 env.example 참고.
# 버스 위치는 .env.local 의 공공데이터포털 키(DATA_GO_KR_KEY_BUS_1… 또는 DATA_GO_KR_KEY)가 있어야 나옵니다. 없으면 노선 선만 보입니다.
# 시연: DATA_GO_KR_PROFILE=demo ./run-app.sh  (DATA_GO_KR_KEY_DEMO_<N> 키를 먼저 씁니다)
# python3 -m http.server 같은 정적 서버에는 /api 가 없어 코드로 열 수 없고 버스 위치도 나오지 않으니 이 스크립트로 여세요.
# 시험용: DRY_RUN=1 이면 열 주소만 출력하고 끝냅니다.
set -euo pipefail
cd "$(dirname "$0")"

PORT="${1:-8000}"
CODE="${2:-${START_CODE:-41450}}"
case "$PORT" in ''|*[!0-9]*) echo "포트는 숫자여야 합니다: $PORT" >&2; exit 2 ;; esac

# 열 주소의 질의: region:<slug> → ?region=, 숫자 코드는 자릿수로 종류를 정한다
case "$CODE" in
  region:?*) QUERY="region=${CODE#region:}" ;;
  *[!0-9]*|'') echo "코드는 숫자(시군구 5 · 법정동 8·10 · 필지 19자리)이거나 region:<slug> 여야 합니다: $CODE" >&2; exit 2 ;;
  *) case "${#CODE}" in
       5) QUERY="sgg=$CODE" ;;
       8|10) QUERY="bjd=$CODE" ;;
       19) QUERY="pnu=$CODE" ;;
       *) echo "코드 자릿수가 맞지 않습니다(시군구 5 · 법정동 8 또는 10 · 필지 19): ${#CODE}자리" >&2; exit 2 ;;
     esac ;;
esac

# 코드 해석 키가 없으면 코드로는 열 수 없다 → 계양 번들로 대신 연다
case "$QUERY" in
  region=*) ;;
  *) if ! { [ -f .env.local ] && grep -Eq '^DATA_GO_KR_KEY(_RESOLVE_[0-9]+)?=.' .env.local; }; then
       echo "주의: .env.local 에 DATA_GO_KR_KEY(또는 DATA_GO_KR_KEY_RESOLVE_1)가 없어 코드($CODE)를 해석할 수 없습니다. 계양 번들(?region=incheon-gyeyang)로 엽니다." >&2
       QUERY="region=incheon-gyeyang"
     fi ;;
esac
URL="http://127.0.0.1:${PORT}/?${QUERY}"
if [ -n "${DRY_RUN:-}" ]; then echo "$URL"; exit 0; fi

command -v node >/dev/null 2>&1 || { echo "node 가 필요합니다(https://nodejs.org)." >&2; exit 1; }

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "포트 $PORT 가 이미 쓰이고 있습니다:" >&2
  lsof -nP -iTCP:"$PORT" -sTCP:LISTEN | awk 'NR>1 {print "  PID " $2 "  " $1}' | sort -u >&2
  echo "그 프로세스를 끄거나(kill <PID>) 다른 포트로 여세요: ./run-app.sh 8001" >&2
  exit 1
fi

if ! { [ -f .env.local ] && grep -Eq '^DATA_GO_KR_KEY(_[A-Z0-9]+_[0-9]+)?=.' .env.local; }; then
  echo "주의: .env.local 에 DATA_GO_KR_KEY(또는 DATA_GO_KR_KEY_BUS_1)가 없어 버스 위치 없이(노선 선만) 열립니다." >&2
fi

echo "지도: $URL   (끝내려면 Ctrl+C)"
if [ -z "${NO_OPEN:-}" ] && command -v open >/dev/null 2>&1; then
  ( sleep 1.2; open "$URL" ) >/dev/null 2>&1 &
fi
exec node scripts/dev.js "$PORT"
