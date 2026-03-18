"use client"

import React, { createContext, useContext, useState } from "react"

interface RecipeImportContextValue {
  pendingRecipeImportCount: number
  setPendingRecipeImportCount: (n: number | ((prev: number) => number)) => void
}

const RecipeImportContext = createContext<RecipeImportContextValue>({
  pendingRecipeImportCount: 0,
  setPendingRecipeImportCount: () => {},
})

export function useRecipeImportCount() {
  return useContext(RecipeImportContext)
}

export function RecipeImportProvider({ children }: { children: React.ReactNode }) {
  const [pendingRecipeImportCount, setPendingRecipeImportCount] = useState(0)

  return (
    <RecipeImportContext.Provider value={{ pendingRecipeImportCount, setPendingRecipeImportCount }}>
      {children}
    </RecipeImportContext.Provider>
  )
}
