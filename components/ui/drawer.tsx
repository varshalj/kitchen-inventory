"use client"
import * as React from "react"

export const Drawer = ({ children }: { children: React.ReactNode }) => <>{children}</>
export const DrawerTrigger = ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>
export const DrawerPortal = ({ children }: { children: React.ReactNode }) => <>{children}</>
export const DrawerClose = ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>
export const DrawerOverlay = (props: React.HTMLAttributes<HTMLDivElement>) => <div {...props} />
export const DrawerContent = ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>
export const DrawerHeader = ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>
export const DrawerFooter = ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>
export const DrawerTitle = ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => <h2 {...props}>{children}</h2>
export const DrawerDescription = ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => <p {...props}>{children}</p>
