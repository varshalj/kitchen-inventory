import { Skeleton } from "@/components/ui/skeleton"
import { MainLayout } from "@/components/main-layout"
import { LoadingTip } from "@/components/loading-tip"

export function InventoryLoading() {
  return (
    <MainLayout>
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-9 rounded-full" />
      </div>

      <div className="mb-6 flex gap-2">
        <Skeleton className="h-10 flex-1 rounded-xl" />
        <Skeleton className="h-10 w-32 rounded-xl" />
      </div>

      <div className="mb-4 flex gap-2">
        <Skeleton className="h-9 flex-1 rounded-xl" />
        <Skeleton className="h-9 w-9 rounded-xl" />
      </div>

      <div className="flex gap-2 mb-4">
        <Skeleton className="h-8 w-20 rounded-xl" />
        <Skeleton className="h-8 w-28 rounded-xl" />
        <Skeleton className="h-8 w-24 rounded-xl" />
      </div>

      <div className="grid grid-cols-1 gap-4">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-xl p-4 bg-card shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
            <div className="flex justify-between items-start">
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/4" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
            <div className="mt-3 pt-3 border-t">
              <Skeleton className="h-3 w-1/4" />
            </div>
          </div>
        ))}

        <LoadingTip />

        <div className="rounded-xl p-4 bg-card shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
          <div className="flex justify-between items-start">
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/4" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <div className="mt-3 pt-3 border-t">
            <Skeleton className="h-3 w-1/4" />
          </div>
        </div>
      </div>
    </MainLayout>
  )
}
