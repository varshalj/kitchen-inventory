"use client"

import * as React from "react"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { VariantProps } from "class-variance-authority"

interface LoadingButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean
  asChild?: boolean
}

function LoadingButton({ isLoading, children, className, disabled, ...props }: LoadingButtonProps) {
  return (
    <Button
      {...props}
      disabled={isLoading || disabled}
      className={cn("relative overflow-hidden", className)}
    >
      {children}
      {isLoading && (
        <span className="pointer-events-none absolute bottom-0 left-0 right-0 h-0.5 overflow-hidden">
          <span className="absolute h-full w-2/5 bg-current/50 animate-[loading-bar_1s_ease-in-out_infinite]" />
        </span>
      )}
    </Button>
  )
}

export { LoadingButton }
