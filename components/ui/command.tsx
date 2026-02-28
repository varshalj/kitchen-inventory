"use client"

import * as React from "react"

export const Command = ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>
export const CommandDialog = Command
export const CommandInput = (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />
export const CommandList = ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>
export const CommandEmpty = ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>
export const CommandGroup = ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>
export const CommandSeparator = (props: React.HTMLAttributes<HTMLHRElement>) => <hr {...props} />
export const CommandItem = ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>
export const CommandShortcut = ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) => <span {...props}>{children}</span>
