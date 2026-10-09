import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

/* 이 앱의 카드 네 가지(옛 dash.css 의 .panel .kpi .cardlink .src). shadcn 기본(ring·overflow-hidden·간격 변수)은 쓰지 않고
   옛 치수 그대로 고정했다(2026-10-09 전환: 화면이 픽셀 단위로 같아야 한다). 링크 카드는 <Link className={cardVariants({ variant: "link" })}> 로 쓴다. */
const cardVariants = cva("border border-border bg-card text-card-foreground", {
  variants: {
    variant: {
      panel: "mt-4 min-w-0 rounded-[14px] px-[18px] py-4",
      kpi: "flex flex-col gap-0.5 rounded-[12px] px-3.5 py-3",
      link: "flex flex-col gap-1 rounded-[12px] px-4 py-3.5 no-underline hover:border-line2 hover:bg-pn2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&_b]:text-[15px] [&_span]:text-[13px] [&_span]:text-muted-foreground [&_code]:text-[12px] [&_code]:text-primary",
      source: "mt-2.5 rounded-[12px] px-4 py-3.5",
    },
  },
  defaultVariants: { variant: "panel" },
})

function Card({ className, variant, ...props }: React.ComponentProps<"div"> & VariantProps<typeof cardVariants>) {
  return <div data-slot="card" className={cn(cardVariants({ variant }), className)} {...props} />
}

export { Card, cardVariants }
