/* 공급 6단계(기획서 1절). note 는 지금 확보한 데이터(신청 API·파일 기준). */
export const STAGES = [
  { code: '01', name: '정책', data: '없음(통계 목록 URL뿐)' },
  { code: '02', name: '사업화', data: '파일로 받은 SH 공공재개발·재건축 현황' },
  { code: '03', name: '인허가', data: '건축HUB 주택·건축인허가' },
  { code: '04', name: '건설', data: '건축HUB 착공·사용승인, 행복도시 준공계획, LH 준공예정 파일' },
  { code: '05', name: '공급', data: '마이홈 모집공고, LH 공급정보, 청약홈 2건' },
  { code: '06', name: '입주', data: '청약홈 입주예정월, LH 단지정보 파일' },
] as const;
export const stageName = (code: string) => STAGES.find((s) => s.code === code)?.name ?? code;
