import { Suspense } from "react"
import { AddItemForm } from "@/components/add-item-form"
import { AuthGate } from "@/components/auth-gate"

export default function AddItemPage() {
  return (
    <AuthGate>
      <Suspense>
        <AddItemForm />
      </Suspense>
    </AuthGate>
  )
}
