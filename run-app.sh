#!/usr/bin/env bash
# 로컬에서 지도를 연다: 정적 파일 + 버스 위치 중계(/api/bus)를 함께 여는 개발 서버(scripts/dev.js).
#   ./run-app.sh [포트=8000]       브라우저가 자동으로 열립니다(macOS). 열지 않으려면 NO_OPEN=1 ./run-app.sh
# 버스 위치는 .env.local 의 공공데이터포털 키(DATA_GO_KR_KEY_BUS_1… 또는 DATA_GO_KR_KEY)가 있어야 나옵니다. 없으면 노선 선만 보입니다. 키 이름은 env.example 참고.
# 시연: DATA_GO_KR_PROFILE=demo ./run-app.sh  (DATA_GO_KR_KEY_DEMO_<N> 키를 먼저 씁니다)
# python3 -m http.server 같은 정적 서버에는 /api/bus 가 없어 버스 위치가 나오지 않으니 이 스크립트로 여세요.
set -euo pipefail
cd "$(dirname "$0")"

PORT="${1:-8000}"
case "$PORT" in ''|*[!0-9]*) echo "포트는 숫자여야 합니다: $PORT" >&2; exit 2 ;; esac
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

URL="http://127.0.0.1:${PORT}/?region=incheon-gyeyang"
echo "지도: $URL   (끝내려면 Ctrl+C)"
if [ -z "${NO_OPEN:-}" ] && command -v open >/dev/null 2>&1; then
  ( sleep 1.2; open "$URL" ) >/dev/null 2>&1 &
fi
exec node scripts/dev.js "$PORT"
