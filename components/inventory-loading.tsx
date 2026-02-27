import { Skeleton } from "@/components/ui/skeleton"
import { MainLayout } from "@/components/main-layout"

export function InventoryLoading() {
  return (
    <MainLayout>
      <div className="flex items-center justify-between mb-6">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-10 rounded-md" />
          <Skeleton className="h-10 w-10 rounded-md" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {Array(5)
          .fill(0)
          .map((_, i) => (
            <div key={i} className="border rounded-lg p-4">
              <div className="flex justify-between items-start">
                <div>
                  <Skeleton className="h-5 w-32 mb-2" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
              <Skeleton className="h-4 w-40 mt-4" />
            </div>
          ))}
      </div>
    </MainLayout>
  )
}
