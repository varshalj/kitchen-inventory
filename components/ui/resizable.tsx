"use client"
import * as React from "react"

export const ResizablePanelGroup = ({ children }: { children: React.ReactNode }) => <div>{children}</div>
export const ResizablePanel = ({ children }: { children: React.ReactNode }) => <div>{children}</div>
export const ResizableHandle = () => <div className="h-px bg-border my-2" />
