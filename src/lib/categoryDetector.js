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

// Detect category from note text
export function detectCategory(note) {
  if (!note || !note.trim()) return null
  const lower = note.toLowerCase()
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) {
      return category
    }
  }
  return null
}