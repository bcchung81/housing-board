import * as React from "react"

/* 이 앱의 모바일 경계는 900px 이하다(옛 레일의 @media (max-width:900px) 와 같다). shadcn 기본값은 768 이다. */
const MOBILE_QUERY = "(max-width: 900px)"

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY)
    const onChange = () => setIsMobile(mql.matches)
    mql.addEventListener("change", onChange)
    onChange()
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}
