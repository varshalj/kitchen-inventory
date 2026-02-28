"use client"
import * as React from "react"

export const Form = ({ children }: { children: React.ReactNode }) => <>{children}</>
export const FormField = ({ render }: { render: (props: { field: any }) => React.ReactNode }) => <>{render({ field: {} })}</>
export const FormItem = ({ children }: { children: React.ReactNode }) => <div>{children}</div>
export const FormLabel = ({ children }: { children: React.ReactNode }) => <label>{children}</label>
export const FormControl = ({ children }: { children: React.ReactNode }) => <>{children}</>
export const FormDescription = ({ children }: { children: React.ReactNode }) => <p>{children}</p>
export const FormMessage = ({ children }: { children?: React.ReactNode }) => <p>{children}</p>
export const useFormField = () => ({ name: "", formItemId: "", formDescriptionId: "", formMessageId: "", error: undefined })
