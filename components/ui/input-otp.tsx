"use client"
import * as React from "react"

export const InputOTP = ({ children }: { children: React.ReactNode }) => <div>{children}</div>
export const InputOTPGroup = ({ children }: { children: React.ReactNode }) => <div className="flex gap-2">{children}</div>
export const InputOTPSlot = ({ index }: { index: number }) => <input aria-label={`otp-${index}`} maxLength={1} className="w-8 text-center border" />
export const InputOTPSeparator = () => <span>-</span>
