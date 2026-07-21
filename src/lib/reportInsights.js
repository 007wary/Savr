// Turns the numbers the Reports screen already computes into ranked,
// plain-language observations. Pure and synchronous — no new data, no queries.
// The screen paid the computational cost of the charts; this collects the
// payoff by saying what they mean.
//
// Each insight is { key, icon, text }. `icon` is an Ionicons name so the card
// can render it. Returned already ranked by usefulness and capped, so the UI
// just maps over them.

const DOW_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// Round a ratio like 2.34 to "2.3×"; drop the decimal when it's a whole-ish number.
function ratioLabel(r) {
  const oneDp = Math.round(r * 10) / 10
  return Number.isInteger(oneDp) ? `${oneDp}×` : `${oneDp}×`
}

// Mean spend per day-of-week, over days that actually had spending, so a
// category's cadence shows through instead of being diluted by quiet days.
function busiestWeekday(expenses) {
  const sums = Array(7).fill(0)
  const daysSeen = Array(7).fill(null).map(() => new Set())
  for (const e of expenses) {
    const d = new Date(e.date + 'T00:00:00')
    const dow = d.getDay()
    sums[dow] += parseFloat(e.amount) || 0
    daysSeen[dow].add(e.date)
  }
  let best = null
  for (let i = 0; i < 7; i++) {
    const activeDays = daysSeen[i].size
    if (activeDays === 0) continue
    const avg = sums[i] / activeDays
    if (!best || avg > best.avg) best = { dow: i, avg }
  }
  return best
}

// `input` bundles values the Reports screen already has in scope:
//   total, expenses (current month), categoryTotals (sorted desc, with .label
//   and .percentage), last6Months (with .amount), formatAmount (fn),
//   currencySymbol, currencyCode. Weekend/weekday split is derived internally.
export function buildReportInsights(input) {
  const {
    total = 0, expenses = [], categoryTotals = [], last6Months = [],
    formatAmount, currencySymbol, currencyCode,
  } = input || {}

  // Need a little data before interpretation is meaningful, not noise.
  if (!expenses.length || total <= 0 || expenses.length < 4) return []

  // Derive weekend/weekday totals here rather than relying on the caller, so the
  // function is self-contained and testable from expenses alone.
  let weekendTotal = 0
  let weekdayTotal = 0
  for (const e of expenses) {
    const dow = new Date(e.date + 'T00:00:00').getDay()
    const amt = parseFloat(e.amount) || 0
    if (dow === 0 || dow === 6) weekendTotal += amt
    else weekdayTotal += amt
  }

  const money = (n) => (formatAmount ? formatAmount(n, currencySymbol, currencyCode) : String(Math.round(n)))
  const out = []

  // 1. Top category concentration — only interesting when it's actually dominant.
  const top = categoryTotals[0]
  if (top && top.percentage >= 35) {
    out.push({
      key: 'top-category',
      icon: 'pie-chart-outline',
      text: `${top.label} makes up ${Math.round(top.percentage)}% of your spending this month.`,
    })
  }

  // 2. Weekend vs weekday intensity, compared on a per-day basis (2 weekend days
  //    vs 5 weekday days) so the comparison is fair.
  if (weekendTotal > 0 && weekdayTotal > 0) {
    const weekendPerDay = weekendTotal / 2
    const weekdayPerDay = weekdayTotal / 5
    if (weekendPerDay >= weekdayPerDay * 1.5) {
      out.push({
        key: 'weekend',
        icon: 'sunny-outline',
        text: `You spend ${ratioLabel(weekendPerDay / weekdayPerDay)} more per day on weekends than weekdays.`,
      })
    } else if (weekdayPerDay >= weekendPerDay * 1.5) {
      out.push({
        key: 'weekday',
        icon: 'briefcase-outline',
        text: `Your weekday spending runs ${ratioLabel(weekdayPerDay / weekendPerDay)} higher per day than weekends.`,
      })
    }
  }

  // 3. Priciest day of the week.
  const busy = busiestWeekday(expenses)
  if (busy && busy.avg > 0) {
    out.push({
      key: 'busiest-day',
      icon: 'calendar-outline',
      text: `${DOW_LABELS[busy.dow]}s are your priciest day, averaging ${money(busy.avg)}.`,
    })
  }

  // 4. Month-over-month trend vs the average of the prior months shown.
  if (last6Months.length >= 3) {
    const thisMonth = last6Months[last6Months.length - 1]?.amount || 0
    const prior = last6Months.slice(0, -1).filter(m => m.amount > 0)
    if (thisMonth > 0 && prior.length >= 2) {
      const priorAvg = prior.reduce((s, m) => s + m.amount, 0) / prior.length
      if (priorAvg > 0) {
        const change = (thisMonth - priorAvg) / priorAvg
        if (change >= 0.2) {
          out.push({
            key: 'trend-up',
            icon: 'trending-up-outline',
            text: `This month is ${Math.round(change * 100)}% above your recent average.`,
          })
        } else if (change <= -0.2) {
          out.push({
            key: 'trend-down',
            icon: 'trending-down-outline',
            text: `Nice — this month is ${Math.round(-change * 100)}% below your recent average.`,
          })
        }
      }
    }
  }

  // Cap so the card stays a glance, not a wall. Order above is the ranking.
  return out.slice(0, 4)
}
