import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/adminAuth";
import { opsEnabled, listProductRecipes, listItemsWithStock } from "@/lib/opsStore";
import { OpsShell, DbNotice } from "../OpsChrome";
import RecipesPanel from "./RecipesPanel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function OpsRecipesPage() {
  if (!(await isAdminSession())) redirect("/admin/login");

  if (!opsEnabled) {
    return (
      <OpsShell active="/admin/ops/recipes" title="Recipes">
        <DbNotice />
      </OpsShell>
    );
  }

  const [recipes, items] = await Promise.all([listProductRecipes(), listItemsWithStock()]);
  const withRecipe = recipes.filter((r) => r.recipeId).length;

  return (
    <OpsShell active="/admin/ops/recipes" title="Recipes" subtitle={`${withRecipe}/${recipes.length} products have a recipe`}>
      <RecipesPanel recipes={recipes} items={items} />
    </OpsShell>
  );
}
