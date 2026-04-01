/** Dispatched on `window` after a recipe is removed from the server (detail → list sync). */
export const KITCHEN_RECIPES_CHANGED = "kitchen-recipes-changed"

export type KitchenRecipesChangedDetail = { removedId: string }
