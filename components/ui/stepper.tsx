import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

/* 단계 표시(옛 .stepper). shadcn 에는 없는 부품이라 이 앱의 모양대로 만들었다. 단계 번호는 항목 안의 <b> 동그라미다.
   state: on = 지금 단계(주색 강조), done = 지나온 단계(글자만 밝게), 없음 = 앞으로 올 단계. */
function Stepper({ className, ...props }: React.ComponentProps<"ol">) {
  return <ol data-slot="stepper" className={cn("m-0 mt-3 flex list-none flex-wrap gap-1.5 p-0", className)} {...props} />
}

const stepperItemVariants = cva(
  "flex items-center gap-2 rounded-[10px] border px-3 py-2 text-[13px] [&_b]:flex [&_b]:size-[22px] [&_b]:items-center [&_b]:justify-center [&_b]:rounded-[50%] [&_b]:text-[12px]",
  {
    variants: {
      state: {
        todo: "border-border bg-muted text-muted-foreground [&_b]:bg-line2 [&_b]:text-foreground",
        done: "border-border bg-muted text-ink2 [&_b]:bg-line2 [&_b]:text-foreground",
        on: "border-primary bg-accent text-foreground [&_b]:bg-primary [&_b]:text-primary-foreground",
      },
    },
    defaultVariants: { state: "todo" },
  }
)

function StepperItem({ className, state, ...props }: React.ComponentProps<"li"> & VariantProps<typeof stepperItemVariants>) {
  return <li data-slot="stepper-item" className={cn(stepperItemVariants({ state }), className)} {...props} />
}

export { Stepper, StepperItem }
