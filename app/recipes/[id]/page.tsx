import { RecipeDetail } from "@/components/recipe-detail"

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <RecipeDetail id={id} />
}
