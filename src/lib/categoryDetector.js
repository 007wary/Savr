const CATEGORY_KEYWORDS = {
  'Food': [
    // Food delivery apps
    'swiggy', 'zomato', 'doordash', 'ubereats', 'grubhub',
    'deliveroo', 'foodpanda', 'talabat', 'grab food',
    // Fast food
    'mcdonalds', 'kfc', 'dominos', 'pizza', 'burger', 'subway',
    'starbucks', 'dunkin', 'taco bell', 'wendys', 'chipotle',
    'popeyes', 'five guys', 'shake shack',
    // General
    'restaurant', 'cafe', 'canteen', 'diner', 'bistro',
    'food', 'eat', 'lunch', 'dinner', 'breakfast', 'snack',
    'tea', 'coffee', 'juice', 'milk', 'grocery', 'vegetables',
    'fruits', 'chicken', 'fish', 'rice', 'bread', 'supermarket',
  ],

  'Transport': [
    // Ride apps
    'uber', 'ola', 'lyft', 'grab', 'bolt', 'rapido',
    'careem', 'didi', 'gojek',
    // Fuel
    'petrol', 'diesel', 'fuel', 'gas station', 'shell',
    'bp', 'exxon', 'chevron', 'total', 'enoc',
    // Public transport
    'metro', 'bus', 'train', 'ferry', 'tram', 'subway',
    // Travel booking
    'makemytrip', 'expedia', 'booking.com', 'kayak',
    'indigo', 'emirates', 'etihad', 'lufthansa', 'flight',
    'airline', 'airways',
    // General
    'taxi', 'cab', 'parking', 'toll', 'transport', 'travel',
    'bike', 'scooter', 'car', 'vehicle', 'service',
  ],

  'Shopping': [
    // Ecommerce
    'amazon', 'flipkart', 'ebay', 'aliexpress', 'shein',
    'myntra', 'noon', 'temu', 'etsy', 'walmart',
    // General
    'mall', 'shop', 'store', 'market', 'purchase',
    'cloth', 'clothes', 'shirt', 'pants', 'shoes',
    'dress', 'jacket', 'bag', 'wallet',
    'watch', 'jewellery', 'accessories', 'cosmetics', 'beauty',
    'tesco', 'ikea', 'zara', 'h&m', 'uniqlo',
  ],

  'Bills': [
    // Utilities
    'electricity', 'electric', 'power', 'water', 'gas',
    'utility', 'utilities',
    // Internet & Mobile
    'wifi', 'internet', 'broadband', 'jio', 'airtel',
    'vodafone', 'tmobile', 'att', 'verizon', 'etisalat',
    'recharge', 'mobile', 'phone', 'postpaid', 'prepaid', 'sim',
    // Streaming
    'netflix', 'prime', 'disney', 'hulu', 'apple tv',
    'spotify', 'youtube', 'subscription', 'hotstar',
    // Housing
    'rent', 'maintenance', 'flat', 'house', 'emi', 'mortgage',
    'loan', 'insurance',
  ],

  'Health': [
    // Pharmacies
    'pharmacy', 'medicine', 'medical', 'chemist', 'drug',
    'apollo', 'cvs', 'walgreens', 'boots',
    // Healthcare
    'doctor', 'hospital', 'clinic', 'lab', 'test', 'scan',
    'xray', 'blood', 'report', 'checkup', 'consultation',
    'dentist', 'eye', 'optician', 'spectacles', 'lens',
    // Fitness
    'gym', 'fitness', 'yoga', 'pilates', 'crossfit', 'sports',
    'protein', 'supplement', 'vitamin',
  ],

  'Entertainment': [
    // Movies
    'movie', 'cinema', 'theater', 'theatre', 'imax',
    'ticketmaster', 'fandango', 'bookmyshow',
    // Games
    'game', 'gaming', 'steam', 'playstation', 'xbox',
    'nintendo', 'pubg', 'roblox', 'epic games',
    // Events
    'concert', 'event', 'show', 'ticket', 'park', 'zoo',
    'museum', 'exhibition',
    // General
    'entertainment', 'fun', 'outing', 'trip', 'picnic',
    'weekend', 'party', 'celebration',
  ],

  'Education': [
    // Online learning
    'udemy', 'coursera', 'skillshare', 'linkedin learning',
    'unacademy', 'khan academy', 'duolingo', 'masterclass',
    // General
    'book', 'books', 'notebook', 'stationery', 'pen', 'pencil',
    'course', 'class', 'tuition', 'coaching', 'school',
    'college', 'university', 'fees', 'exam', 'test',
    'education', 'study', 'learning',
  ],
}

// Category precedence, highest first. When a note matches keywords in more than
// one category (e.g. "amazon prime" hits both Shopping's "amazon" and Bills'
// "prime"), the earlier category here wins. Bills/Health/Transport are more
// specific intents than the broad "Shopping" bucket, so they rank above it.
const CATEGORY_PRIORITY = [
  'Bills', 'Health', 'Transport', 'Food',
  'Education', 'Entertainment', 'Shopping',
]

// We match in two passes so two different notions of "best" don't fight:
//
//   1. PHRASE keywords (multi-word, e.g. "gas station", "apple tv") are highly
//      specific intent signals. If any match, the LONGEST one wins — "gas
//      station" (Transport) beats the bare "gas" (Bills utility).
//   2. Only if no phrase matches do we fall back to SINGLE-WORD keywords, ranked
//      by CATEGORY_PRIORITY — so "amazon prime" (both single words) resolves to
//      Bills over Shopping by intent, not by which word happens to be longer.
//
// Both lists are precomputed once at module load.
const _allKeywords = Object.entries(CATEGORY_KEYWORDS)
  .flatMap(([category, keywords]) => keywords.map(keyword => ({ category, keyword })))

const PHRASE_KEYWORDS = _allKeywords
  .filter(k => /\s/.test(k.keyword))
  .sort((a, b) => {
    if (b.keyword.length !== a.keyword.length) return b.keyword.length - a.keyword.length
    return CATEGORY_PRIORITY.indexOf(a.category) - CATEGORY_PRIORITY.indexOf(b.category)
  })

const WORD_KEYWORDS = _allKeywords
  .filter(k => !/\s/.test(k.keyword))
  .sort((a, b) => CATEGORY_PRIORITY.indexOf(a.category) - CATEGORY_PRIORITY.indexOf(b.category))

// Split a note into lowercase word tokens (used both for learning lookups and
// for what we persist when the user corrects us).
export function tokenizeNote(note) {
  if (!note || typeof note !== 'string') return []
  return note.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length >= 3)
}

// Detect category from note text.
//
// `learned` is the optional per-user list from getLearnedCategories():
// [{ token, category, count }]. A user's own correction always beats the
// built-in keyword table — if any note token matches a learned mapping, the
// highest-count learned category wins. Falls back to the ranked keyword table.
export function detectCategory(note, learned = null) {
  return detectCategoryWithSource(note, learned).category
}

// Same detection, but also reports HOW it matched: 'learned' (the user's own
// past correction) or 'keyword' (the built-in table). Used for analytics so we
// can tell whether the per-user learning is actually contributing. Returns
// { category: string|null, source: 'learned'|'keyword'|null }.
export function detectCategoryWithSource(note, learned = null) {
  if (!note || !note.trim()) return { category: null, source: null }
  const lower = note.toLowerCase()

  if (learned && learned.length) {
    const tokens = new Set(tokenizeNote(note))
    let best = null
    for (const row of learned) {
      if (tokens.has(row.token) && (!best || row.count > best.count)) best = row
    }
    if (best) return { category: best.category, source: 'learned' }
  }

  // Pass 1: most-specific phrase match (longest wins).
  for (const { category, keyword } of PHRASE_KEYWORDS) {
    if (lower.includes(keyword)) return { category, source: 'keyword' }
  }
  // Pass 2: single-word match, highest-priority category wins.
  for (const { category, keyword } of WORD_KEYWORDS) {
    if (lower.includes(keyword)) return { category, source: 'keyword' }
  }
  return { category: null, source: null }
}