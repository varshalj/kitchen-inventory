"use client"

import * as React from "react"

export function Carousel({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>
}
export function CarouselContent({ children }: { children: React.ReactNode }) { return <div className="flex gap-2">{children}</div> }
export function CarouselItem({ children }: { children: React.ReactNode }) { return <div className="min-w-0">{children}</div> }
export function CarouselNext(props: React.ButtonHTMLAttributes<HTMLButtonElement>) { return <button type="button" {...props}>Next</button> }
export function CarouselPrevious(props: React.ButtonHTMLAttributes<HTMLButtonElement>) { return <button type="button" {...props}>Prev</button> }
