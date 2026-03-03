import { SearchAndFilter } from "@/components/search-and-filter"
import { AuthGate } from "@/components/auth-gate"

export default function SearchPage() {
  return (
    <AuthGate>
      <SearchAndFilter />
    </AuthGate>
  )
}
