import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

/* 알약 표지(옛 .pill). 기본은 회색 테두리, warn(샘플·잠정)과 ok(실데이터)는 색 테두리. */
const badgeVariants = cva(
  "inline-block rounded-full border px-[9px] text-[11px] leading-[19px] font-bold whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-line2 text-muted-foreground",
        warn: "border-warn text-warn",
        ok: "border-ok text-ok",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

function Badge({ className, variant = "default", render, ...props }: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">({ className: cn(badgeVariants({ variant }), className) }, props),
    render,
    state: { slot: "badge", variant },
  })
}

export { Badge, badgeVariants }
