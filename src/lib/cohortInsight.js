// Cross-user comparison framing for the dashboard — "you spent less than most
// Savr users on Dining this month". The comparison itself (percentile framing
// beats a raw number for engagement) is the point; the data comes from the
// get_category_cohort_averages RPC (see supabase/migrations), cached client-
// side for a day since it's a slow-moving aggregate.
import { supabase } from './supabase'
import { saveCache, loadCache } from './cache'

export async function loadCohortAverages(month) {
  const cacheKey = `savr_cache_cohort_${month}`
  const cached = await loadCache(cacheKey)
  if (cached) return cached

  const { data, error } = await supabase.rpc('get_category_cohort_averages', { p_month: month })
  if (error || !data) return null

  const byCategory = {}
  for (const row of data) byCategory[row.category] = { avg: parseFloat(row.avg_amount), userCount: row.user_count }
  await saveCache(cacheKey, byCategory)
  return byCategory
}

// Pick the single most useful cohort comparison to surface: the user's
// biggest category this month, compared against the cohort average for that
// same category. Returns null if there's no cohort data for it (e.g. too few
// users, or a category unique to this user).
export function buildCohortInsight(topCategory, topCategoryTotal, cohortAverages) {
  if (!topCategory || !cohortAverages) return null
  const cohort = cohortAverages[topCategory]
  if (!cohort) return null

  const diffPct = Math.round(Math.abs(topCategoryTotal - cohort.avg) / cohort.avg * 100)
  if (diffPct < 5) return { category: topCategory, direction: 'even', diffPct: 0 }
  return {
    category: topCategory,
    direction: topCategoryTotal < cohort.avg ? 'below' : 'above',
    diffPct,
  }
}
