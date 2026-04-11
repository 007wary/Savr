const CATEGORY_KEYWORDS = {
  'Food': [
    // Indian food apps
    'swiggy', 'zomato', 'blinkit', 'zepto', 'dunzo', 'bigbasket',
    // Fast food
    'mcdonalds', 'kfc', 'dominos', 'pizza', 'burger', 'subway',
    'starbucks', 'cafe coffee day', 'ccd', 'barista',
    // General
    'restaurant', 'cafe', 'hotel', 'dhaba', 'canteen', 'mess',
    'food', 'eat', 'lunch', 'dinner', 'breakfast', 'snack',
    'tea', 'coffee', 'juice', 'milk', 'grocery', 'vegetables',
    'fruits', 'chicken', 'mutton', 'fish', 'rice', 'dal',
    'biryani', 'idli', 'dosa', 'paratha', 'roti', 'bread',
  ],

  'Transport': [
    // Indian ride apps
    'uber', 'ola', 'rapido', 'namma yatri', 'auto', 'rickshaw',
    // Fuel
    'petrol', 'diesel', 'fuel', 'cng', 'hp', 'indian oil', 'bharat',
    // Public transport
    'metro', 'bus', 'train', 'local', 'ferry',
    // Travel booking
    'irctc', 'redbus', 'makemytrip', 'goibibo', 'abhibus',
    'indigo', 'spicejet', 'air india', 'vistara', 'flight',
    // General
    'taxi', 'cab', 'parking', 'toll', 'transport', 'travel',
    'bike', 'scooter', 'car', 'vehicle', 'service',
  ],

  'Shopping': [
    // Indian ecommerce
    'amazon', 'flipkart', 'meesho', 'myntra', 'ajio', 'nykaa',
    'snapdeal', 'jiomart', 'tata cliq', 'reliance',
    // General
    'mall', 'shop', 'store', 'market', 'bazaar', 'purchase',
    'cloth', 'clothes', 'shirt', 'pant', 'shoes', 'sandal',
    'dress', 'saree', 'kurta', 'jacket', 'bag', 'wallet',
    'watch', 'jewellery', 'accessories', 'cosmetics', 'beauty',
  ],

  'Bills': [
    // Utilities
    'electricity', 'electric', 'power', 'water', 'gas', 'lpg',
    'cylinder', 'indane', 'hp gas', 'bharatgas',
    // Internet & Mobile
    'wifi', 'internet', 'broadband', 'jio', 'airtel', 'vi',
    'vodafone', 'bsnl', 'idea', 'recharge', 'mobile', 'phone',
    'postpaid', 'prepaid', 'sim',
    // Streaming
    'netflix', 'prime', 'hotstar', 'disney', 'sonyliv', 'zee5',
    'spotify', 'youtube', 'subscription',
    // Housing
    'rent', 'maintenance', 'society', 'flat', 'house', 'pg',
    'hostel', 'emi', 'loan', 'insurance',
  ],

  'Health': [
    // Pharmacies
    'pharmacy', 'medicine', 'medical', 'chemist', 'drug',
    'apollo', 'netmeds', 'pharmeasy', '1mg', 'medplus',
    // Healthcare
    'doctor', 'hospital', 'clinic', 'lab', 'test', 'scan',
    'xray', 'blood', 'report', 'checkup', 'consultation',
    'dentist', 'eye', 'optician', 'spectacles', 'lens',
    // Fitness
    'gym', 'fitness', 'yoga', 'zumba', 'cult', 'sports',
    'protein', 'supplement', 'vitamin',
  ],

  'Entertainment': [
    // Movies
    'movie', 'cinema', 'pvr', 'inox', 'cinepolis', 'bookmyshow',
    // Games
    'game', 'gaming', 'steam', 'playstation', 'xbox', 'bgmi',
    'pubg', 'freefire',
    // Events
    'concert', 'event', 'show', 'ticket', 'park', 'zoo',
    'museum', 'exhibition',
    // General
    'entertainment', 'fun', 'outing', 'trip', 'picnic',
    'weekend', 'party', 'celebration',
  ],

  'Education': [
    // Online learning
    'udemy', 'coursera', 'unacademy', 'byjus', 'vedantu',
    'skillshare', 'linkedin learning',
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