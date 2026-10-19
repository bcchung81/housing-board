import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

/* 알약 표지(옛 .pill). 기본은 회색 테두리, warn(샘플·잠정)과 ok(실데이터)는 색 테두리.
   solid 는 종합상황판의 칩(옛 .tag): 테두리 없이 색을 채우고 위아래 여백이 없으며, 색은 쓰는 곳에서 className 으로 준다. */
const badgeVariants = cva(
  "inline-block rounded-full border px-2 py-0.5 text-xs leading-body font-bold whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-line2 text-muted-foreground",
        warn: "border-warn text-warn",
        ok: "border-ok text-ok",
        solid: "border-0 px-2 py-0",
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
