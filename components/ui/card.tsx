import type * as React from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

/* 이 앱의 카드 등급(2026-10-18 2라운드 1단계, DESIGN.md Components). 모양은 globals.css 의 부품 클래스(.ui-card·.ui-tile·.ui-tile-compact·.ui-row)
   하나라서 정적 /citizen 과 같은 값이다. shadcn 기본(ring·overflow-hidden·간격 변수)은 쓰지 않는다. 화면에서는 배치(flex·gap·격자)만 덧붙인다.
   - section(기본): 구역 카드 — 반경 14 · 여백 20(900px 이하 16) · 카드 그림자
   - tile: 타일(KPI 칸 등) — 반경 10 · 여백 12/16 · 카드 그림자
   - compact: 촘촘 타일 — 반경 10 · 여백 8/10 · 그림자 없음
   - inset: 안쪽 카드(테두리형) — 카드 안의 묶음(바깥 카드와 같은 1px 테두리·카드색 · 반경 10 · 여백 8/10 · 그림자 없음). 2단까지, 안쪽 카드 안에 또 카드 금지
   - row: 줄 — 테두리 없이 아래 구분선 · 위아래 8 */
const cardVariants = cva("", {
  variants: {
    variant: {
      section: "ui-card card-soft",
      tile: "ui-tile card-soft",
      compact: "ui-tile-compact",
      inset: "ui-inset",
      row: "ui-row",
    },
  },
  defaultVariants: { variant: "section" },
})

function Card({ className, variant, render, ...props }: useRender.ComponentProps<"div"> & VariantProps<typeof cardVariants>) {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">({ className: cn(cardVariants({ variant }), className) }, props),
    render,
    state: { slot: "card", variant },
  })
}

/* 카드 제목(h2 역할 20/700)·설명(보조 글 역할). 제목은 줄 길이를 고르게(globals 의 [data-slot=card-title]) */
function CardTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return <h2 data-slot="card-title" className={cn("ui-h2", className)} {...props} />
}

function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="card-description" className={cn("ui-meta m-0", className)} {...props} />
}

export { Card, CardTitle, CardDescription, cardVariants }
