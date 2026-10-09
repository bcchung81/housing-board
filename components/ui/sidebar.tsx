"use client"

import * as React from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cn } from "cn"

import { useIsMobile } from "@/hooks/use-mobile"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"

/* 사이드바(옛 .rail). shadcn Sidebar 의 골격(Provider·데스크톱 고정 레일/모바일 서랍 분기·접힘 data 속성)을 따르고,
   이 앱에서 쓰는 것만 남겼다: 아이콘으로 접히는 레일(220↔56px), 900px 이하의 서랍(240px), 메뉴 단추, 햄버거.
   접힘 상태는 쿠키가 아니라 쓰는 쪽이 `open`·`onOpenChange` 로 쥔다(이 브라우저의 localStorage). */
const SIDEBAR_WIDTH = "220px"
const SIDEBAR_WIDTH_ICON = "56px"
const SIDEBAR_WIDTH_MOBILE = "240px"

/* 레일 안의 글씨는 본문(15px/1.55)과 따로 14px/1.4 다 */
const railFont = "font-sans text-[14px] leading-[1.4] text-sidebar-foreground"

type SidebarContextProps = {
  state: "expanded" | "collapsed"
  open: boolean
  setOpen: (open: boolean) => void
  openMobile: boolean
  setOpenMobile: (open: boolean) => void
  isMobile: boolean
  toggleSidebar: () => void
}

const SidebarContext = React.createContext<SidebarContextProps | null>(null)

function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.")
  }
  return context
}

function SidebarProvider({
  open,
  onOpenChange,
  className,
  style,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const isMobile = useIsMobile()
  const [openMobile, setOpenMobile] = React.useState(false)

  const toggleSidebar = React.useCallback(() => {
    return isMobile ? setOpenMobile((v) => !v) : onOpenChange(!open)
  }, [isMobile, onOpenChange, open])

  const state = open ? "expanded" : "collapsed"
  const contextValue = React.useMemo<SidebarContextProps>(
    () => ({ state, open, setOpen: onOpenChange, isMobile, openMobile, setOpenMobile, toggleSidebar }),
    [state, open, onOpenChange, isMobile, openMobile, toggleSidebar]
  )

  return (
    <SidebarContext.Provider value={contextValue}>
      <div
        data-slot="sidebar-wrapper"
        style={{ "--sidebar-width": SIDEBAR_WIDTH, "--sidebar-width-icon": SIDEBAR_WIDTH_ICON, ...style } as React.CSSProperties}
        className={cn("group/sidebar-wrapper flex min-h-screen w-full", className)}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  )
}

function Sidebar({ className, children, ...props }: React.ComponentProps<"div">) {
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar()

  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile}>
        <SheetContent
          id="rail"
          data-sidebar="sidebar"
          data-slot="sidebar"
          data-mobile="true"
          className={cn("w-(--sidebar-width) border-r border-sidebar-border bg-sidebar", railFont)}
          style={{ "--sidebar-width": SIDEBAR_WIDTH_MOBILE } as React.CSSProperties}
        >
          <SheetTitle className="sr-only">주 메뉴</SheetTitle>
          <SheetDescription className="sr-only">사이드바 메뉴를 보여 줍니다.</SheetDescription>
          {children}
        </SheetContent>
      </Sheet>
    )
  }

  /* 넓은 화면: 흐름 안에서 화면 위에 붙어 있는(sticky) 한 요소. shadcn 기본은 빈 칸(gap)+fixed 두 겹이지만, 그렇게 하면 본문의 둥근 모서리가
     다르게 그려져(2026-10-09 실험: 기준선과 69px 차이, sticky 로 두면 0px) 옛 레일과 같은 구조로 단순하게 두었다. 접히면 56px. */
  return (
    <div
      id="rail"
      data-slot="sidebar"
      data-state={state}
      data-collapsible={state === "collapsed" ? "icon" : ""}
      className={cn(
        "group sticky top-0 z-30 hidden h-screen w-(--sidebar-width) flex-none flex-col border-r border-sidebar-border bg-sidebar data-[collapsible=icon]:w-(--sidebar-width-icon) min-[901px]:flex",
        railFont,
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

/* 900px 이하에서 서랍을 여는 햄버거. 넓은 화면에서는 숨는다. */
function SidebarTrigger({ className, onClick, ...props }: React.ComponentProps<"button">) {
  const { openMobile, toggleSidebar } = useSidebar()
  return (
    <button
      type="button"
      data-slot="sidebar-trigger"
      aria-expanded={openMobile}
      aria-controls="rail"
      aria-label="메뉴 열기"
      className={cn(
        "fixed top-3 left-2 z-50 hidden size-11 cursor-pointer rounded-[10px] border border-sidebar-border bg-[rgba(12,20,56,.94)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-primary max-[900px]:block",
        className
      )}
      onClick={(event) => {
        onClick?.(event)
        toggleSidebar()
      }}
      {...props}
    >
      <i aria-hidden="true" className="absolute top-[21px] left-3 block h-0.5 w-5 rounded-[1px] bg-sidebar-foreground before:absolute before:top-[-6px] before:left-0 before:block before:h-0.5 before:w-5 before:rounded-[1px] before:bg-sidebar-foreground before:content-[''] after:absolute after:top-[6px] after:left-0 after:block after:h-0.5 after:w-5 after:rounded-[1px] after:bg-sidebar-foreground after:content-['']" />
    </button>
  )
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-header" data-sidebar="header" className={cn("flex flex-none flex-col", className)} {...props} />
}

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-footer" data-sidebar="footer" className={cn("flex flex-col", className)} {...props} />
}

function SidebarContent({ className, render, ...props }: useRender.ComponentProps<"div">) {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">({ className: cn("flex min-h-0 flex-1 flex-col overflow-y-auto", className) }, props),
    render,
    state: { slot: "sidebar-content", sidebar: "content" },
  })
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return <ul data-slot="sidebar-menu" data-sidebar="menu" className={cn("m-0 flex w-full min-w-0 list-none flex-col gap-0.5 p-0", className)} {...props} />
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  return <li data-slot="sidebar-menu-item" data-sidebar="menu-item" className={cn("relative", className)} {...props} />
}

/* 메뉴 한 줄(링크). 지금 화면은 isActive: 배경이 밝아지고 왼쪽 끝에 주색 막대가 붙는다. 접히면(아이콘만) 글씨와 배지가 숨고 가운데 정렬. */
const sidebarMenuButtonClass = [
  "relative flex min-h-11 w-full items-center gap-3 rounded-[10px] px-3 whitespace-nowrap text-muted-foreground no-underline",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-primary",
  "hover:text-sidebar-foreground not-data-active:hover:bg-pn2",
  "data-active:bg-sidebar-accent data-active:text-sidebar-foreground",
  "data-active:before:absolute data-active:before:inset-y-2.5 data-active:before:-left-2 data-active:before:w-[3px] data-active:before:rounded-r-[3px] data-active:before:bg-sidebar-primary data-active:before:content-['']",
  "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:[&>em]:hidden group-data-[collapsible=icon]:[&>span]:hidden",
  "[&_svg]:size-[22px] [&_svg]:shrink-0 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:[stroke-width:1.7] [&_svg]:[stroke-linecap:round] [&_svg]:[stroke-linejoin:round]",
].join(" ")

function SidebarMenuButton({ render, isActive = false, className, ...props }: useRender.ComponentProps<"a"> & { isActive?: boolean }) {
  return useRender({
    defaultTagName: "a",
    props: mergeProps<"a">({ className: cn(sidebarMenuButtonClass, className) }, props),
    render,
    state: { slot: "sidebar-menu-button", sidebar: "menu-button", active: isActive },
  })
}

export { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar }
