"use client"

import React, { createContext, useContext, useState } from "react"

interface EmailIngestionContextValue {
  pendingEmailIngestionCount: number
  setPendingEmailIngestionCount: (n: number | ((prev: number) => number)) => void
}

const EmailIngestionContext = createContext<EmailIngestionContextValue>({
  pendingEmailIngestionCount: 0,
  setPendingEmailIngestionCount: () => {},
})

export function useEmailIngestionCount() {
  return useContext(EmailIngestionContext)
}

export function EmailIngestionProvider({ children }: { children: React.ReactNode }) {
  const [pendingEmailIngestionCount, setPendingEmailIngestionCount] = useState(0)

  return (
    <EmailIngestionContext.Provider value={{ pendingEmailIngestionCount, setPendingEmailIngestionCount }}>
      {children}
    </EmailIngestionContext.Provider>
  )
}
