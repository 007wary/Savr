// Shared date/expense helpers. These were previously copy-pasted across
// dashboard/history/reports/recurring; consolidating them removes drift risk
// (e.g. one screen's month-key formatting diverging from another's).

// Local "YYYY-MM-DD" for a Date, built from local getters (never toISOString,
// which is UTC and can land on the wrong calendar day in non-UTC timezones).
export function localDateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Local "YYYY-MM" month key for a Date.
export function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Newest-first ordering used by every expense list: primary key the date string,
// tie-break by created_at so same-day rows keep insertion order stable.
export function sortExpenses(data) {
  return [...data].sort((a, b) => {
    if (b.date !== a.date) return b.date.localeCompare(a.date)
    return new Date(b.created_at || 0) - new Date(a.created_at || 0)
  })
}
