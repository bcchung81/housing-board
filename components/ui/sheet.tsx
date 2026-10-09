"use client"

import * as React from "react"
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog"
import { cn } from "cn"

/* 왼쪽에서 나오는 서랍. 이 앱에서는 900px 이하의 사이드바 드로어로만 쓰므로 왼쪽 전용이고 닫기 단추는 없다(바깥을 누르거나 Esc).
   가림막 색과 나오는 속도(.18s)는 옛 레일의 스크림·드로어와 같다. */
function Sheet({ ...props }: SheetPrimitive.Root.Props) {
  return <SheetPrimitive.Root {...props} />
}

function SheetContent({ className, children, ...props }: SheetPrimitive.Popup.Props) {
  return (
    <SheetPrimitive.Portal data-slot="sheet-portal">
      <SheetPrimitive.Backdrop
        data-slot="sheet-overlay"
        className="fixed inset-0 z-55 bg-[rgba(5,8,28,.55)] transition-opacity duration-[180ms] data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none"
      />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        className={cn(
          "fixed inset-y-0 left-0 z-60 flex h-full flex-col transition-transform duration-[180ms] ease-[ease] data-ending-style:-translate-x-[102%] data-starting-style:-translate-x-[102%] motion-reduce:transition-none",
          className
        )}
        {...props}
      >
        {children}
      </SheetPrimitive.Popup>
    </SheetPrimitive.Portal>
  )
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return <SheetPrimitive.Title data-slot="sheet-title" className={className} {...props} />
}

function SheetDescription({ className, ...props }: SheetPrimitive.Description.Props) {
  return <SheetPrimitive.Description data-slot="sheet-description" className={className} {...props} />
}

export { Sheet, SheetContent, SheetTitle, SheetDescription }
