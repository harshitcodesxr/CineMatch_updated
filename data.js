/**
 * CineMatch - Movie Recommendation Tool
 * Predefined Movie Dataset & TMDB Integration Layer
 * 
 * B.Tech Semester III Computer Science Project
 * 
 * Features:
 * 1. 55 Curated offline movies with rich mood annotations, tags, cast, and directors.
 * 2. TMDB API Integration Configuration & Heuristic Mood Classifier.
 * 3. Fallback SVG Poster Generator for 100% resilient UI rendering.
 * 4. Filter definitions & 4-step Quiz Question flow.
 */

// TMDB API Configuration (Live Key provided for CineMatch)
const TMDB_CONFIG = {
  API_KEY: '686addb02f6f1a62adb87c65c61523e8',
  BASE_URL: 'https://api.themoviedb.org/3',
  IMAGE_BASE: 'https://image.tmdb.org/t/p/w500',
  BACKDROP_BASE: 'https://image.tmdb.org/t/p/w1280'
};

// TMDB Genre ID to Standard Genre Name Mapping
const TMDB_GENRE_MAP = {
  28: 'Action',
  12: 'Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  14: 'Fantasy',
  36: 'History',
  27: 'Horror',
  10402: 'Music',
  9648: 'Mystery',
  10749: 'Romance',
  878: 'Sci-Fi',
  53: 'Thriller',
  10752: 'War',
  37: 'Western'
};

// Genre Name to TMDB Genre ID Reverse Mapping
const GENRE_NAME_TO_TMDB_ID = {
  'Action': 28,
  'Adventure': 12,
  'Animation': 16,
  'Comedy': 35,
  'Crime': 80,
  'Drama': 18,
  'Fantasy': 14,
  'Horror': 27,
  'Mystery': 9648,
  'Romance': 10749,
  'Sci-Fi': 878,
  'Thriller': 53
};

// Heuristic keyword dictionary to map TMDB synopses into CineMatch mood archetypes
const MOOD_KEYWORD_RULES = [
  { mood: 'Mind-Bending', keywords: ['twist', 'reality', 'dream', 'memory', 'simulation', 'time travel', 'multiverse', 'puzzle', 'dimension', 'parallel', 'subconscious', 'illusion'] },
  { mood: 'Adrenaline', keywords: ['explosive', 'chase', 'assassin', 'heist', 'survival', 'mission', 'battle', 'warrior', 'racing', 'superhero', 'revenge', 'combat', 'martial arts'] },
  { mood: 'Cozy', keywords: ['warm', 'charming', 'heartwarming', 'friendship', 'village', 'gentle', 'baking', 'holiday', 'whimsical', 'nostalgic', 'pet', 'cottage', 'cozy'] },
  { mood: 'Dark & Gritty', keywords: ['noir', 'detective', 'serial killer', 'conspiracy', 'bleak', 'corruption', 'underworld', 'murder', 'brutal', 'dystopia', 'ruthless'] },
  { mood: 'Emotional', keywords: ['tearjerker', 'grief', 'tragedy', 'terminal', 'separation', 'loss', 'father', 'mother', 'daughter', 'son', 'redemption', 'poignant'] },
  { mood: 'Feel-Good', keywords: ['uplifting', 'inspirational', 'triumph', 'celebration', 'dance', 'musical', 'joy', 'optimistic', 'delightful', 'charming', 'miracle'] },
  { mood: 'Romantic', keywords: ['romance', 'love', 'affair', 'passion', 'couple', 'soulmate', 'wedding', 'dating', 'crush', 'lovers', 'sweetheart'] },
  { mood: 'Funny', keywords: ['hilarious', 'comedy', 'satire', 'spoof', 'slapstick', 'wit', 'silly', 'bizarre', 'chaotic', 'buddy', 'absurd', 'laugh'] },
  { mood: 'Inspirational', keywords: ['perseverance', 'mentor', 'champion', 'achievement', 'dream', 'courage', 'athlete', 'true story', 'genius', 'barrier', 'triumph'] },
  { mood: 'Suspenseful', keywords: ['hostage', 'trap', 'investigation', 'paranoia', 'stalker', 'secret', 'disappearance', 'countdown', 'deadly', 'claustrophobic'] },
  { mood: 'Relaxing', keywords: ['peaceful', 'nature', 'serene', 'slow', 'meditative', 'pastoral', 'gentle', 'ocean', 'ambient', 'quiet'] }
];

/**
 * Heuristic Mood Classifier for TMDB Movies
 * Infers 1 to 3 CineMatch Moods from TMDB Genres, Title, and Overview
 */
function classifyTMDBMovieToMoods(tmdbMovie, genres) {
  const text = ((tmdbMovie.title || '') + ' ' + (tmdbMovie.overview || '')).toLowerCase();
  const detected = new Set();

  // Genre-based baseline inferences
  if (genres.includes('Sci-Fi') || genres.includes('Mystery')) detected.add('Mind-Bending');
  if (genres.includes('Action') || genres.includes('War')) detected.add('Adrenaline');
  if (genres.includes('Animation') || genres.includes('Family')) detected.add('Feel-Good');
  if (genres.includes('Horror') || genres.includes('Crime')) detected.add('Dark & Gritty');
  if (genres.includes('Romance')) detected.add('Romantic');
  if (genres.includes('Comedy')) detected.add('Funny');
  if (genres.includes('Thriller')) detected.add('Suspenseful');
  if (genres.includes('Drama')) detected.add('Emotional');

  // Text keyword matches
  MOOD_KEYWORD_RULES.forEach(rule => {
    rule.keywords.forEach(keyword => {
      if (text.includes(keyword)) {
        detected.add(rule.mood);
      }
    });
  });

  const moodsArray = Array.from(detected);
  if (moodsArray.length === 0) {
    return ['Feel-Good', 'Suspenseful'];
  }
  return moodsArray.slice(0, 3);
}

/**
 * Normalizes a raw TMDB movie object to CineMatch standard movie schema
 */
function normalizeTMDBMovie(tmdbMovie) {
  const genres = (tmdbMovie.genre_ids || tmdbMovie.genres || []).map(g => {
    return typeof g === 'object' ? g.name : (TMDB_GENRE_MAP[g] || 'Drama');
  });

  const primaryGenre = genres[0] || 'Drama';
  const moods = classifyTMDBMovieToMoods(tmdbMovie, genres);
  const releaseYear = tmdbMovie.release_date ? parseInt(tmdbMovie.release_date.split('-')[0], 10) : 2024;
  
  // High quality poster fallback
  const posterUrl = tmdbMovie.poster_path 
    ? `${TMDB_CONFIG.IMAGE_BASE}${tmdbMovie.poster_path}`
    : generateSVGFallbackPoster(tmdbMovie.title || 'Unknown Film', primaryGenre, releaseYear);

  return {
    id: `tmdb-${tmdbMovie.id}`,
    tmdbId: tmdbMovie.id,
    title: tmdbMovie.title || tmdbMovie.name || 'Untitled Film',
    year: releaseYear,
    genre: primaryGenre,
    genres: genres.length ? genres : ['Drama'],
    rating: parseFloat((tmdbMovie.vote_average || 7.0).toFixed(1)),
    runtime: tmdbMovie.runtime || 115, // Default average runtime if not in lightweight listing
    moods: moods,
    vibe: `${moods[0]} • ${primaryGenre}`,
    description: tmdbMovie.overview || 'A captivating cinematic experience waiting to be discovered.',
    poster: posterUrl,
    backdrop: tmdbMovie.backdrop_path ? `${TMDB_CONFIG.BACKDROP_BASE}${tmdbMovie.backdrop_path}` : null,
    language: (tmdbMovie.original_language || 'en').toUpperCase(),
    popularity: Math.min(100, Math.round((tmdbMovie.popularity || 50) / 5) + 40),
    director: 'Acclaimed Visionary',
    cast: ['Leading Ensemble'],
    featured: (tmdbMovie.vote_average || 0) > 7.8,
    tags: genres.concat(moods).map(s => s.toLowerCase()),
    isLiveTMDB: true
  };
}

/**
 * Generates an elegant SVG Data URL poster when offline or image load fails
 */
function generateSVGFallbackPoster(title, genre, year) {
  const cleanTitle = (title || 'Movie').replace(/[<>&"]/g, '');
  const cleanGenre = (genre || 'Cinema').replace(/[<>&"]/g, '');
  const cleanYear = year || 2024;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 450" width="300" height="450">
    <defs>
      <linearGradient id="cinematchGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#14161D"/>
        <stop offset="50%" stop-color="#1B1E28"/>
        <stop offset="100%" stop-color="#0B0C10"/>
      </linearGradient>
      <radialGradient id="orangeGlow" cx="80%" cy="20%" r="60%">
        <stop offset="0%" stop-color="#FF6B00" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="#FF6B00" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="300" height="450" fill="url(#cinematchGrad)"/>
    <rect width="300" height="450" fill="url(#orangeGlow)"/>
    <rect x="15" y="15" width="270" height="420" rx="12" fill="none" stroke="rgba(255, 107, 0, 0.3)" stroke-width="1.5"/>
    <circle cx="150" cy="160" r="48" fill="rgba(255, 107, 0, 0.12)" stroke="#FF6B00" stroke-width="2"/>
    <path d="M142 144 L164 160 L142 176 Z" fill="#FF6B00"/>
    <text x="150" y="250" text-anchor="middle" fill="#FFFFFF" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="700" font-size="19">${cleanTitle.length > 20 ? cleanTitle.substring(0, 18) + '...' : cleanTitle}</text>
    <text x="150" y="278" text-anchor="middle" fill="#FFA048" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="600" font-size="13">${cleanGenre.toUpperCase()} • ${cleanYear}</text>
    <text x="150" y="306" text-anchor="middle" fill="#8E9AA8" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="11" letter-spacing="2">CINEMATCH ARCHIVE</text>
  </svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// 55 Curated Predefined Movies (Offline resilient dataset)
const MOVIES_DATASET = [
  {
    id: "cm-001",
    title: "Inception",
    year: 2010,
    genre: "Sci-Fi",
    genres: ["Sci-Fi", "Action", "Thriller"],
    rating: 8.8,
    runtime: 148,
    moods: ["Mind-Bending", "Suspenseful", "Adrenaline"],
    vibe: "Mind-Bending Dreamscape",
    description: "A skilled thief who steals corporate secrets through dream-sharing technology is given the inverse task of planting an idea into the mind of a CEO.",
    poster: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80",
    language: "English",
    popularity: 98,
    director: "Christopher Nolan",
    cast: ["Leonardo DiCaprio", "Joseph Gordon-Levitt", "Elliot Page"],
    featured: true,
    tags: ["dreams", "subconscious", "heist", "architecture", "nolan"]
  },
  {
    id: "cm-002",
    title: "The Dark Knight",
    year: 2008,
    genre: "Action",
    genres: ["Action", "Crime", "Drama", "Thriller"],
    rating: 9.0,
    runtime: 152,
    moods: ["Dark & Gritty", "Suspenseful", "Adrenaline"],
    vibe: "Psychological Chaos",
    description: "When the menace known as the Joker wreaks havoc and chaos on the people of Gotham, Batman must accept one of the greatest psychological and physical tests.",
    poster: "https://images.unsplash.com/photo-1509281373149-e957c6296406?w=600&auto=format&fit=crop&q=80",
    language: "English",
    popularity: 99,
    director: "Christopher Nolan",
    cast: ["Christian Bale", "Heath Ledger", "Aaron Eckhart"],
    featured: true,
    tags: ["batman", "joker", "gotham", "justice", "vigilante"]
  },
  {
    id: "cm-003",
    title: "Interstellar",
    year: 2014,
    genre: "Sci-Fi",
    genres: ["Sci-Fi", "Adventure", "Drama"],
    rating: 8.7,
    runtime: 169,
    moods: ["Mind-Bending", "Emotional", "Inspirational"],
    vibe: "Cosmic Wonder & Heartache",
    description: "When Earth becomes uninhabitable in the future, a farmer and ex-NASA pilot is tasked with piloting a spacecraft along with a team of researchers to find a new planet for humanity.",
    poster: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600&auto=format&fit=crop&q=80",
    language: "English",
    popularity: 97,
    director: "Christopher Nolan",
    cast: ["Matthew McConaughey", "Anne Hathaway", "Jessica Chastain"],
    featured: true,
    tags: ["space", "black hole", "time dilation", "father-daughter", "relativity"]
  },
  {
    id: "cm-004",
    title: "Spider-Man: Into the Spider-Verse",
    year: 2018,
    genre: "Animation",
    genres: ["Animation", "Action", "Adventure", "Sci-Fi"],
    rating: 8.4,
    runtime: 117,
    moods: ["Adrenaline", "Feel-Good", "Inspirational"],
    vibe: "Electrifying Multiverse",
    description: "Teen Miles Morales becomes the new Spider-Man and joins other Spider-Heroes from alternate dimensions to stop a threat to all reality.",
    poster: "https://images.unsplash.com/photo-1635805737707-575885ab0820?w=600&auto=format&fit=crop&q=80",
    language: "English",
    popularity: 94,
    director: "Bob Persichetti, Peter Ramsey",
    cast: ["Shameik Moore", "Jake Johnson", "Hailee Steinfeld"],
    featured: true,
    tags: ["superhero", "comic book", "multiverse", "coming of age", "animation"]
  },
  {
    id: "cm-005",
    title: "Whiplash",
    year: 2014,
    genre: "Drama",
    genres: ["Drama", "Music"],
    rating: 8.5,
    runtime: 106,
    moods: ["Adrenaline", "Dark & Gritty", "Suspenseful"],
    vibe: "Relentless Intensity",
    description: "A promising young drummer enrolls at a cut-throat music conservatory where his dreams of greatness are mentored by an instructor who will stop at nothing to realize a student's potential.",
    poster: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80",
    language: "English",
    popularity: 92,
    director: "Damien Chazelle",
    cast: ["Miles Teller", "J.K. Simmons", "Paul Reiser"],
    featured: false,
    tags: ["jazz", "drums", "obsession", "music", "perfection"]
  },
  {
    id: "cm-006",
    title: "Parasite",
    year: 2019,
    genre: "Thriller",
    genres: ["Thriller", "Drama", "Comedy"],
    rating: 8.5,
    runtime: 132,
    moods: ["Dark & Gritty", "Suspenseful", "Mind-Bending"],
    vibe: "Biting Class Warfare",
    description: "Greed and class discrimination threaten the newly formed symbiotic relationship between the wealthy Park family and the destitute Kim clan.",
    poster: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600&auto=format&fit=crop&q=80",
    language: "Korean",
    popularity: 96,
    director: "Bong Joon Ho",
    cast: ["Song Kang-ho", "Lee Sun-kyun", "Cho Yeo-jeong"],
    featured: true,
    tags: ["class", "korean", "satire", "social", "oscar winner"]
  },
  {
    id: "cm-007",
    title: "The Grand Budapest Hotel",
    year: 2014,
    genre: "Comedy",
    genres: ["Comedy", "Adventure", "Crime"],
    rating: 8.1,
    runtime: 99,
    moods: ["Cozy", "Funny", "Feel-Good"],
    vibe: "Pastel Whimsical Charm",
    description: "A writer encounters the owner of an aging high-class hotel, who tells him of his early years serving as a lobby boy in the hotel's glorious past under an exceptional concierge.",
    poster: "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=600&auto=format&fit=crop&q=80",
    language: "English",
    popularity: 90,
    director: "Wes Anderson",
    cast: ["Ralph Fiennes", "Tony Revolori", "Saoirse Ronan"],
    featured: true,
    tags: ["wes anderson", "hotel", "heist", "quirky", "aesthetic"]
  },
  {
    id: "cm-008",
    title: "La La Land",
    year: 2016,
    genre: "Romance",
    genres: ["Romance", "Comedy", "Drama", "Music"],
    rating: 8.0,
    runtime: 128,
    moods: ["Romantic", "Emotional", "Feel-Good"],
    vibe: "Bittersweet Symphony",
    description: "While navigating their careers in Los Angeles, a pianist and an actress fall in love while attempting to reconcile their aspirations for the future.",
    poster: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80",
    language: "English",
    popularity: 91,
    director: "Damien Chazelle",
    cast: ["Ryan Gosling", "Emma Stone", "John Legend"],
    featured: false,
    tags: ["jazz", "hollywood", "dreams", "love story", "musical"]
  },
  {
    id: "cm-009",
    title: "Amélie",
    year: 2001,
    genre: "Comedy",
    genres: ["Comedy", "Romance"],
    rating: 8.3,
    runtime: 122,
    moods: ["Cozy", "Feel-Good", "Romantic"],
    vibe: "Playful Paris Warmth",
    description: "Amélie is an innocent and naive girl in Paris with her own sense of justice. She decides to help those around her and, along the way, discovers love.",
    poster: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=600&auto=format&fit=crop&q=80",
    language: "French",
    popularity: 88,
    director: "Jean-Pierre Jeunet",
    cast: ["Audrey Tautou", "Mathieu Kassovitz", "Rufus"],
    featured: false,
    tags: ["paris", "kindness", "whimsical", "french", "destiny"]
  },
  {
    id: "cm-010",
    title: "Knives Out",
    year: 2019,
    genre: "Mystery",
    genres: ["Mystery", "Comedy", "Crime", "Drama"],
    rating: 7.9,
    runtime: 130,
    moods: ["Cozy", "Suspenseful", "Funny"],
    vibe: "Whodunit in an Autumn Mansion",
    description: "A detective investigates the death of the patriarch of an eccentric, combative family.",
    poster: "https://images.unsplash.com/photo-1513151233558-d860c5398176?w=600&auto=format&fit=crop&q=80",
    language: "English",
    popularity: 93,
    director: "Rian Johnson",
    cast: ["Daniel Craig", "Ana de Armas", "Chris Evans"],
    featured: true,
    tags: ["detective", "mansion", "inheritance", "murder", "clever"]
  },
  {
    id: "cm-011",
    title: "Mad Max: Fury Road",
    year: 2015,
    genre: "Action",
    genres: ["Action", "Adventure", "Sci-Fi", "Thriller"],
    rating: 8.1,
    runtime: 120,
    moods: ["Adrenaline", "Dark & Gritty"],
    vibe: "High-Octane Wasteland Chase",
    description: "In a post-apocalyptic wasteland, a woman rebels against a tyrannical ruler in search for her homeland with the aid of a group of female prisoners, a psychotic worshiper, and a drifter named Max.",
    poster: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600&auto=format&fit=crop&q=80",
    language: "English",
    popularity: 95,
    director: "George Miller",
    cast: ["Tom Hardy", "Charlize Theron", "Nicholas Hoult"],
    featured: false,
    tags: ["desert", "car chase", "dystopia", "survival", "apocalypse"]
  },
  {
    id: "cm-012",
    title: "Pulp Fiction",
    year: 1994,
    genre: "Crime",
    genres: ["Crime", "Drama"],
    rating: 8.9,
    runtime: 154,
    moods: ["Dark & Gritty", "Funny", "Suspenseful"],
    vibe: "Cool Non-Linear Crime Tapestry",
    description: "The lives of two mob hitmen, a boxer, a gangster and his wife, and a pair of diner bandits intertwine in four tales of violence and redemption.",
    poster: "https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=600&auto=format&fit=crop&q=80",
    language: "English",
    popularity: 98,
    director: "Quentin Tarantino",
    cast: ["John Travolta", "Uma Thurman", "Samuel L. Jackson"],
    featured: false,
    tags: ["tarantino", "hitmen", "dialogue", "cult classic", "90s"]
  },
  {
    id: "cm-013",
    title: "Spirited Away",
    year: 2001,
    genre: "Animation",
    genres: ["Animation", "Adventure", "Family", "Fantasy"],
    rating: 8.6,
    runtime: 125,
    moods: ["Cozy", "Mind-Bending", "Feel-Good"],
    vibe: "Enchanted Spirit Bathhouse",
    description: "During her family's move to the suburbs, a sullen 10-year-old girl wanders into a world ruled by gods, witches, and spirits, and where humans are changed into beasts.",
    poster: "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=600&auto=format&fit=crop&q=80",
    language: "Japanese",
    popularity: 94,
    director: "Hayao Miyazaki",
    cast: ["Rumi Hiiragi", "Miyu Irino", "Mari Natsuki"],
    featured: true,
    tags: ["ghibli", "spirits", "folklore", "magic", "miyazaki"]
  },
  {
    id: "cm-014",
    title: "Get Out",
    year: 2017,
    genre: "Horror",
    genres: ["Horror", "Mystery", "Thriller"],
    rating: 7.7,
    runtime: 104,
    moods: ["Suspenseful", "Mind-Bending", "Dark & Gritty"],
    vibe: "Psychological Paranoia",
    description: "A young African-American visits his white girlfriend's parents for the weekend, where his simmering uneasiness about their reception of him eventually reaches a boiling point.",
    poster: "https://images.unsplash.com/photo-1509114397022-ed747cca3f65?w=600&auto=format&fit=crop&q=80",
    language: "English",
    popularity: 92,
    director: "Jordan Peele",
    cast: ["Daniel Kaluuya", "Allison Williams", "Bradley Whitford"],
    featured: false,
    tags: ["sunken place", "social horror", "satire", "mystery", "suburban"]
  },
  {
    id: "cm-015",
    title: "Before Sunrise",
    year: 1995,
    genre: "Romance",
    genres: ["Romance", "Drama"],
    rating: 8.1,
    runtime: 101,
    moods: ["Romantic", "Cozy", "Relaxing"],
    vibe: "Nocturnal Vienna Conversation",
    description: "A young man and woman meet on a train in Europe, and wind up spending one evening together in Vienna. Unfortunately, both know that this will probably be their only night together.",
    poster: "https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=600&auto=format&fit=crop&q=80",
    language: "English",
    popularity: 85,
    director: "Richard Linklater",
    cast: ["Ethan Hawke", "Julie Delpy", "Andrea Eckert"],
    featured: false,
    tags: ["vienna", "travel", "dialogue", "connection", "philosophy"]
  },
  {
    id: "cm-016",
    title: "Everything Everywhere All at Once",
    year: 2022,
    genre: "Sci-Fi",
    genres: ["Sci-Fi", "Action", "Adventure", "Comedy", "Fantasy"],
    rating: 8.0,
    runtime: 139,
    moods: ["Mind-Bending", "Emotional", "Funny", "Adrenaline"],
    vibe: "Multiversal Laundromat Madness",
    description: "A middle-aged Chinese immigrant is swept up into an insane adventure in which she alone can save existence by exploring other universes and connecting with the lives she could have led.",
    poster: "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=600&auto=format&fit=crop&q=80",
    language: "English / Chinese",
    popularity: 97,
    director: "Daniel Kwan, Daniel Scheinert",
    cast: ["Michelle Yeoh", "Stephanie Hsu", "Ke Huy Quan"],
    featured: true,
    tags: ["multiverse", "family", "absurdism", "martial arts", "existential"]
  },
  {
    id: "cm-017",
    title: "Paddington 2",
    year: 2017,
    genre: "Comedy",
    genres: ["Comedy", "Adventure", "Family"],
    rating: 7.8,
    runtime: 103,
    moods: ["Feel-Good", "Cozy", "Funny"],
    vibe: "Pure Warmhearted Delight",
    description: "Paddington, now happily settled with the Brown family and a popular member of the local community, picks up a series of odd jobs to buy the perfect present for his Aunt Lucy's 100th birthday.",
    poster: "https://images.unsplash.com/photo-1559494007-9f5847c49d94?w=600&auto=format&fit=crop&q=80",
    language: "English",
    popularity: 87,
    director: "Paul King",
    cast: ["Ben Whishaw", "Hugh Grant", "Sally Hawkins"],
    featured: false,
    tags: ["marmalade", "london", "kindness", "gentle", "bear"]
  },
  {
    id: "cm-018",
    title: "Se7en",
    year: 1995,
    genre: "Thriller",
    genres: ["Thriller", "Crime", "Drama", "Mystery"],
    rating: 8.6,
    runtime: 127,
    moods: ["Dark & Gritty", "Suspenseful"],
    vibe: "Rain-Soaked Moral Descent",
    description: "Two detectives, a rookie and a veteran, hunt a serial killer who uses the seven deadly sins as his motives.",
    poster: "https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=600&auto=format&fit=crop&q=80",
    language: "English",
    popularity: 95,
    director: "David Fincher",
    cast: ["Brad Pitt", "Morgan Freeman", "Gwyneth Paltrow"],
    featured: false,
    tags: ["serial killer", "fincher", "noir", "investigation", "sins"]
  },
  {
    id: "cm-019",
    title: "Spider-Man 2",
    year: 2004,
    genre: "Action",
    genres: ["Action", "Adventure", "Sci-Fi"],
    rating: 7.4,
    runtime: 127,
    moods: ["Feel-Good", "Adrenaline", "Inspirational"],
    vibe: "Golden Age Heroic Struggle",
    description: "Peter Parker is beset with troubles in his failing personal life as he battles a brilliant scientist named Doctor Otto Octavius.",
    poster: "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=80",
    language: "English",
    popularity: 86,
    director: "Sam Raimi",
    cast: ["Tobey Maguire", "Kirsten Dunst", "Alfred Molina"],
    featured: false,
    tags: ["superhero", "doc ock", "sacrifice", "responsibility", "classic"]
  },
  {
    id: "cm-020",
    title: "The Shawshank Redemption",
    year: 1994,
    genre: "Drama",
    genres: ["Drama"],
    rating: 9.3,
    runtime: 142,
    moods: ["Inspirational", "Emotional", "Feel-Good"],
    vibe: "Unyielding Hope & Freedom",
    description: "Over the course of several years, two convicts form a friendship, seeking solace and eventual redemption through basic compassion.",
    poster: "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600&auto=format&fit=crop&q=80",
    language: "English",
    popularity: 100,
    director: "Frank Darabont",
    cast: ["Tim Robbins", "Morgan Freeman", "Bob Gunton"],
    featured: true,
    tags: ["prison", "hope", "friendship", "redemption", "classic"]
  },
  {
    id: "cm-021",
    title: "A Quiet Place",
    year: 2018,
    genre: "Horror",
    genres: ["Horror", "Drama", "Sci-Fi", "Thriller"],
    rating: 7.5,
    runtime: 90,
    moods: ["Suspenseful", "Adrenaline"],
    vibe: "Tense Breathless Silence",
    description: "In a post-apocalyptic world, a family is forced to live in silence while hiding from monsters with ultra-sensitive hearing.",
    poster: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80",
    language: "English / ASL",
    popularity: 89,
    director: "John Krasinski",
    cast: ["Emily Blunt", "John Krasinski", "Millicent Simmonds"],
    featured: false,
    tags: ["silence", "creatures", "family protection", "survival", "suspense"]
  },
  {
    id: "cm-022",
    title: "Superbad",
    year: 2007,
    genre: "Comedy",
    genres: ["Comedy"],
    rating: 7.6,
    runtime: 113,
    moods: ["Funny", "Feel-Good"],
    vibe: "Chaotic High-School Nostalgia",
    description: "Two co-dependent high school seniors are forced to deal with separation anxiety after their plan to stage a booze-soaked party goes awry.",
    poster: "https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=600&auto=format&fit=crop&q=80",
    language: "English",
    popularity: 88,
    director: "Greg Mottola",
    cast: ["Jonah Hill", "Michael Cera", "Christopher Mintz-Plasse"],
    featured: false,
    tags: ["mclovin", "teen", "party", "friendship", "laugh"]
  },
  {
    id: "cm-023",
    title: "Arrival",
    year: 2016,
    genre: "Sci-Fi",
    genres: ["Sci-Fi", "Drama", "Mystery"],
    rating: 7.9,
    runtime: 116,
    moods: ["Mind-Bending", "Emotional", "Suspenseful"],
    vibe: "Poetic Linguistic Sci-Fi",
    description: "A linguist works with the military to communicate with alien lifeforms after twelve mysterious spacecraft appear around the world.",
    poster: "https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?w=600&auto=format&fit=crop&q=80",
    language: "English",
    popularity: 91,
    director: "Denis Villeneuve",
    cast: ["Amy Adams", "Jeremy Renner", "Forest Whitaker"],
    featured: false,
    tags: ["aliens", "linguistics", "non-linear time", "first contact", "villeneuve"]
  },
  {
    id: "cm-024",
    title: "Coco",
    year: 2017,
    genre: "Animation",
    genres: ["Animation", "Adventure", "Comedy", "Family", "Fantasy", "Music"],
    rating: 8.4,
    runtime: 105,
    moods: ["Emotional", "Feel-Good", "Inspirational"],
    vibe: "Luminous Fiesta of Remembrance",
    description: "Aspiring musician Miguel, confronted with his family's ancestral ban on music, enters the Land of the Dead to find his great-great-grandfather.",
    poster: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80",
    language: "English / Spanish",
    popularity: 95,
    director: "Lee Unkrich, Adrian Molina",
    cast: ["Anthony Gonzalez", "Gael García Bernal", "Benjamin Bratt"],
    featured: true,
    tags: ["pixar", "mexico", "family", "day of the dead", "music"]
  },
  {
    id: "cm-025",
    title: "Zodiac",
    year: 2007,
    genre: "Mystery",
    genres: ["Mystery", "Crime", "Drama", "Thriller"],
    rating: 7.7,
    runtime: 157,
    moods: ["Dark & Gritty", "Suspenseful"],
    vibe: "Meticulous Obsessive Investigation",
    description: "Between 1968 and 1983, a San Francisco cartoonist becomes an amateur detective obsessed with tracking down the Zodiac Killer.",
    poster: "https://images.unsplash.com/photo-1533749047139-189de3cf06d3?w=600&auto=format&fit=crop&q=80",
    language: "English",
    popularity: 89,
    director: "David Fincher",
    cast: ["Jake Gyllenhaal", "Mark Ruffalo", "Robert Downey Jr."],
    featured: false,
    tags: ["cryptogram", "san francisco", "journalism", "unsolved", "fincher"]
  },
  {
    id: "cm-026",
    title: "1917",
    year: 2019,
    genre: "Action",
    genres: ["Action", "Drama", "War"],
    rating: 8.2,
    runtime: 119,
    moods: ["Adrenaline", "Suspenseful", "Emotional"],
    vibe: "Unbroken One-Shot Trench Odyssey",
    description: "April 6th, 1917. As an infantry battalion assembles to wage war deep in enemy territory, two soldiers are assigned to race against time and deliver a message.",
    poster: "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=600&auto=format&fit=crop&q=80",
    language: "English",
    popularity: 93,
    director: "Sam Mendes",
    cast: ["George MacKay", "Dean-Charles Chapman", "Mark Strong"],
    featured: false,
    tags: ["wwi", "one shot", "trench war", "cinematography", "urgency"]
  },
  {
    id: "cm-027",
    title: "Palm Springs",
    year: 2020,
    genre: "Comedy",
    genres: ["Comedy", "Fantasy", "Mystery", "Romance", "Sci-Fi"],
    rating: 7.4,
    runtime: 90,
    moods: ["Funny", "Romantic", "Mind-Bending"],
    vibe: "Sun-Drenched Existential Time Loop",
    description: "Stuck in a time loop at a destination wedding, two wedding guests develop a budding romance while living the same day over and over again.",
    poster: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&auto=format&fit=crop&q=80",
    language: "English",
    popularity: 86,
    director: "Max Barbakow",
    cast: ["Andy Samberg", "Cristin Milioti", "J.K. Simmons"],
    featured: false,
    tags: ["time loop", "wedding", "desert", "existential comedy", "rom-com"]
  },
  {
    id: "cm-028",
    title: "Shutter Island",
    year: 2010,
    genre: "Mystery",
    genres: ["Mystery", "Thriller"],
    rating: 8.2,
    runtime: 138,
    moods: ["Mind-Bending", "Dark & Gritty", "Suspenseful"],
    vibe: "Gothic Asylum Mystery",
    description: "In 1954, a U.S. Marshal investigates the disappearance of a murderer who escaped from a hospital for the criminally insane.",
    poster: "https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?w=600&auto=format&fit=crop&q=80",
    language: "English",
    popularity: 96,
    director: "Martin Scorsese",
    cast: ["Leonardo DiCaprio", "Mark Ruffalo", "Ben Kingsley"],
    featured: true,
    tags: ["asylum", "plot twist", "scorsese", "psychological", "island"]
  },
  {
    id: "cm-029",
    title: "My Neighbor Totoro",
    year: 1988,
    genre: "Animation",
    genres: ["Animation", "Family", "Fantasy"],
    rating: 8.1,
    runtime: 86,
    moods: ["Cozy", "Relaxing", "Feel-Good"],
    vibe: "Rural Pastoral Serenity",
    description: "When two girls move to the country to be near their ailing mother, they have adventures with the wondrous forest spirits who live nearby.",
    poster: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80",
    language: "Japanese",
    popularity: 89,
    director: "Hayao Miyazaki",
    cast: ["Hitoshi Takagi", "Noriko Hidaka", "Chika Sakamoto"],
    featured: false,
    tags: ["ghibli", "totoro", "forest", "rain", "nostalgia", "peaceful"]
  },
  {
    id: "cm-030",
    title: "Good Will Hunting",
    year: 1997,
    genre: "Drama",
    genres: ["Drama", "Romance"],
    rating: 8.3,
    runtime: 126,
    moods: ["Emotional", "Inspirational"],
    vibe: "Emotional Vulnerability & Genius",
    description: "Will Hunting, a janitor at M.I.T., has a gift for mathematics, but needs help from a psychologist to find direction in his life.",
    poster: "https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=600&auto=format&fit=crop&q=80",
    language: "English",
    popularity: 94,
    director: "Gus Van Sant",
    cast: ["Robin Williams", "Matt Damon", "Ben Affleck"],
    featured: false,
    tags: ["math", "therapy", "boston", "genius", "healing"]
  },
  {
    id: "cm-031",
    title: "John Wick",
    year: 2014,
    genre: "Action",
    genres: ["Action", "Crime", "Thriller"],
    rating: 7.4,
    runtime: 101,
    moods: ["Adrenaline", "Dark & Gritty"],
    vibe: "Sleek Gun-Fu Vengeance",
    description: "An ex-hit-man comes out of retirement to track down the gangsters that took everything from him.",
    poster: "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=600&auto=format&fit=crop&q=80",
    language: "English",
    popularity: 93,
    director: "Chad Stahelski",
    cast: ["Keanu Reeves", "Michael Nyqvist", "Alfie Allen"],
    featured: false,
    tags: ["assassin", "revenge", "martial arts", "underworld", "continental"]
  },
  {
    id: "cm-032",
    title: "The Truman Show",
    year: 1998,
    genre: "Drama",
    genres: ["Drama", "Comedy", "Sci-Fi"],
    rating: 8.2,
    runtime: 103,
    moods: ["Mind-Bending", "Inspirational", "Emotional"],
    vibe: "Surveillance Awakening",
    description: "An insurance salesman discovers his whole life is actually a reality TV show broadcast live around the clock.",
    poster: "https://images.unsplash.com/photo-1461151304267-38535e780c79?w=600&auto=format&fit=crop&q=80",
    language: "English",
    popularity: 93,
    director: "Peter Weir",
    cast: ["Jim Carrey", "Ed Harris", "Laura Linney"],
    featured: false,
    tags: ["reality tv", "freedom", "artificial world", "existential", "satire"]
  },
  {
    id: "cm-033",
    title: "Hereditary",
    year: 2018,
    genre: "Horror",
    genres: ["Horror", "Drama", "Mystery"],
    rating: 7.3,
    runtime: 127,
    moods: ["Dark & Gritty", "Suspenseful"],
    vibe: "Suffocating Grief & Dread",
    description: "A grieving family is haunted by tragic and disturbing occurrences after the death of their secretive grandmother.",
    poster: "https://images.unsplash.com/photo-1509114397022-ed747cca3f65?w=600&auto=format&fit=crop&q=80",
    language: "English",
    popularity: 88,
    director: "Ari Aster",
    cast: ["Toni Collette", "Alex Wolff", "Milly Shapiro"],
    featured: false,
    tags: ["occult", "trauma", "family dread", "miniatures", "aster"]
  },
  {
    id: "cm-034",
    title: "Midnight in Paris",
    year: 2011,
    genre: "Fantasy",
    genres: ["Fantasy", "Comedy", "Romance"],
    rating: 7.7,
    runtime: 94,
    moods: ["Cozy", "Romantic", "Relaxing"],
    vibe: "Golden Age Literary Nostalgia",
    description: "While on a trip to Paris with his fiancée's family, a nostalgic screenwriter finds himself mysteriously going back to the 1920s every day at midnight.",
    poster: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=600&auto=format&fit=crop&q=80",
    language: "English / French",
    popularity: 86,
    director: "Woody Allen",
    cast: ["Owen Wilson", "Rachel McAdams", "Marion Cotillard"],
    featured: false,
    tags: ["paris", "1920s", "hemingway", "writers", "nostalgia"]
  },
  {
    id: "cm-035",
    title: "The Silence of the Lambs",
    year: 1991,
    genre: "Thriller",
    genres: ["Thriller", "Crime", "Drama"],
    rating: 8.6,
    runtime: 118,
    moods: ["Dark & Gritty", "Suspenseful"],
    vibe: "Chilling Psychological Duels",
    description: "A young F.B.I. cadet must receive the help of an incarcerated and manipulative cannibal killer to help catch another serial killer.",
    poster: "https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=600&auto=format&fit=crop&q=80",
    language: "English",
    popularity: 97,
    director: "Jonathan Demme",
    cast: ["Jodie Foster", "Anthony Hopkins", "Scott Glenn"],
    featured: false,
    tags: ["hannibal lecter", "fbi", "serial killer", "clarice", "oscar winner"]
  },
  {
    id: "cm-036",
    title: "Fantastic Mr. Fox",
    year: 2009,
    genre: "Animation",
    genres: ["Animation", "Adventure", "Comedy", "Family"],
    rating: 7.9,
    runtime: 87,
    moods: ["Cozy", "Funny", "Feel-Good"],
    vibe: "Warm Corduroy Capers",
    description: "An urbane fox cannot resist returning to his farm-raiding ways and then must help his community survive the farmers' retaliation.",
    poster: "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=600&auto=format&fit=crop&q=80",
    language: "English",
    popularity: 89,
    director: "Wes Anderson",
    cast: ["George Clooney", "Meryl Streep", "Bill Murray"],
    featured: false,
    tags: ["stop motion", "wes anderson", "roald dahl", "cider", "whimsical"]
  },
  {
    id: "cm-037",
    title: "Fight Club",
    year: 1999,
    genre: "Drama",
    genres: ["Drama"],
    rating: 8.8,
    runtime: 139,
    moods: ["Dark & Gritty", "Mind-Bending", "Adrenaline"],
    vibe: "Subversive Anarchy",
    description: "An insomniac office worker and a devil-may-care soap maker form an underground fight club that evolves into much more.",
    poster: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600&auto=format&fit=crop&q=80",
    language: "English",
    popularity: 98,
    director: "David Fincher",
    cast: ["Brad Pitt", "Edward Norton", "Helena Bonham Carter"],
    featured: false,
    tags: ["insomnia", "soap", "anti-consumerism", "alter ego", "cult"]
  },
  {
    id: "cm-038",
    title: "Before Sunset",
    year: 2004,
    genre: "Romance",
    genres: ["Romance", "Drama"],
    rating: 8.1,
    runtime: 80,
    moods: ["Romantic", "Cozy", "Emotional"],
    vibe: "Real-Time Parisian Reunion",
    description: "Nine years after Jesse and Céline first met, they encounter each other again on the French leg of Jesse's book tour.",
    poster: "https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=600&auto=format&fit=crop&q=80",
    language: "English / French",
    popularity: 84,
    director: "Richard Linklater",
    cast: ["Ethan Hawke", "Julie Delpy", "Vernon Dobtcheff"],
    featured: false,
    tags: ["paris", "real time", "reunion", "conversation", "short runtime"]
  },
  {
    id: "cm-039",
    title: "Dune: Part One",
    year: 2021,
    genre: "Sci-Fi",
    genres: ["Sci-Fi", "Action", "Adventure", "Drama"],
    rating: 8.0,
    runtime: 155,
    moods: ["Mind-Bending", "Adrenaline", "Dark & Gritty"],
    vibe: "Epic Monolithic Desert Mysticism",
    description: "A noble family becomes embroiled in a war for control over the galaxy's most valuable asset while its heir becomes troubled by visions of a dark future.",
    poster: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600&auto=format&fit=crop&q=80",
    language: "English",
    popularity: 96,
    director: "Denis Villeneuve",
    cast: ["Timothée Chalamet", "Rebecca Ferguson", "Zendaya"],
    featured: true,
    tags: ["arrakis", "spice", "sandworms", "destiny", "villeneuve"]
  },
  {
    id: "cm-040",
    title: "Pride & Prejudice",
    year: 2005,
    genre: "Romance",
    genres: ["Romance", "Drama"],
    rating: 7.8,
    runtime: 129,
    moods: ["Romantic", "Cozy", "Relaxing"],
    vibe: "Mist-Veiled English Romance",
    description: "Sparks fly when spirited Elizabeth Bennet meets single, rich, and proud Mr. Darcy. But Mr. Darcy reluctantly finds himself falling in love with a woman beneath his class.",
    poster: "https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=600&auto=format&fit=crop&q=80",
    language: "English",
    popularity: 89,
    director: "Joe Wright",
    cast: ["Keira Knightley", "Matthew Macfadyen", "Brenda Blethyn"],
    featured: false,
    tags: ["jane austen", "darcy", "period drama", "piano", "england"]
  },
  {
    id: "cm-041",
    title: "Shaun of the Dead",
    year: 2004,
    genre: "Comedy",
    genres: ["Comedy", "Horror"],
    rating: 7.9,
    runtime: 99,
    moods: ["Funny", "Adrenaline", "Feel-Good"],
    vibe: "London Pub Zombie Rom-Com",
    description: "The uneventful, aimless lives of a London electronics salesman and his slacker roommate are disrupted by the zombie apocalypse.",
    poster: "https://images.unsplash.com/photo-1509114397022-ed747cca3f65?w=600&auto=format&fit=crop&q=80",
    language: "English",
    popularity: 90,
    director: "Edgar Wright",
    cast: ["Simon Pegg", "Nick Frost", "Kate Ashfield"],
    featured: false,
    tags: ["zombies", "edgar wright", "cornetto", "british humor", "pub"]
  },
  {
    id: "cm-042",
    title: "Prisoners",
    year: 2013,
    genre: "Thriller",
    genres: ["Thriller", "Crime", "Drama", "Mystery"],
    rating: 8.1,
    runtime: 153,
    moods: ["Dark & Gritty", "Suspenseful", "Emotional"],
    vibe: "Cold Chilling Moral Dilemma",
    description: "When Keller Dover's daughter and her friend go missing, he takes matters into his own hands as the police pursue multiple leads and the pressure mounts.",
    poster: "https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?w=600&auto=format&fit=crop&q=80",
    language: "English",
    popularity: 92,
    director: "Denis Villeneuve",
    cast: ["Hugh Jackman", "Jake Gyllenhaal", "Viola Davis"],
    featured: false,
    tags: ["abduction", "detective", "maze", "rain", "morality"]
  },
  {
    id: "cm-043",
    title: "Ratatouille",
    year: 2007,
    genre: "Animation",
    genres: ["Animation", "Comedy", "Family", "Fantasy"],
    rating: 8.1,
    runtime: 111,
    moods: ["Cozy", "Feel-Good", "Inspirational"],
    vibe: "Gastronomic Parisian Culinary Joy",
    description: "A rat who can cook makes an unusual alliance with a young kitchen worker at a famous Paris restaurant.",
    poster: "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=600&auto=format&fit=crop&q=80",
    language: "English",
    popularity: 93,
    director: "Brad Bird, Jan Pinkava",
    cast: ["Patton Oswalt", "Ian Holm", "Lou Romano"],
    featured: false,
    tags: ["cooking", "paris", "chef", "pixar", "food"]
  },
  {
    id: "cm-044",
    title: "The Matrix",
    year: 1999,
    genre: "Sci-Fi",
    genres: ["Sci-Fi", "Action"],
    rating: 8.7,
    runtime: 136,
    moods: ["Mind-Bending", "Adrenaline", "Dark & Gritty"],
    vibe: "Cyberpunk Digital Awakening",
    description: "When a beautiful stranger leads computer hacker Neo to a forbidding underworld, he discovers the shocking truth--the life he knows is the elaborate deception of an evil cyber-intelligence.",
    poster: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=600&auto=format&fit=crop&q=80",
    language: "English",
    popularity: 99,
    director: "Lana Wachowski, Lilly Wachowski",
    cast: ["Keanu Reeves", "Laurence Fishburne", "Carrie-Anne Moss"],
    featured: true,
    tags: ["red pill", "simulation", "cyberpunk", "kung fu", "bullet time"]
  },
  {
    id: "cm-045",
    title: "About Time",
    year: 2013,
    genre: "Romance",
    genres: ["Romance", "Comedy", "Drama", "Fantasy", "Sci-Fi"],
    rating: 7.8,
    runtime: 123,
    moods: ["Romantic", "Feel-Good", "Emotional"],
    vibe: "Heartfelt Temporal Appreciation",
    description: "At the age of 21, Tim discovers he can travel in time and change what happens and has happened in his own life. His decision to make his world a better place by getting a girlfriend turns out to have unexpected consequences.",
    poster: "https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=600&auto=format&fit=crop&q=80",
    language: "English",
    popularity: 88,
    director: "Richard Curtis",
    cast: ["Domhnall Gleeson", "Rachel McAdams", "Bill Nighy"],
    featured: false,
    tags: ["time travel", "family", "father-son", "london", "sweet"]
  },
  {
    id: "cm-046",
    title: "Memento",
    year: 2000,
    genre: "Mystery",
    genres: ["Mystery", "Thriller"],
    rating: 8.4,
    runtime: 113,
    moods: ["Mind-Bending", "Dark & Gritty", "Suspenseful"],
    vibe: "Reverse Chronological Amnesia",
    description: "A man with short-term memory loss attempts to track down his wife's murderer using photographs and tattoos.",
    poster: "https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?w=600&auto=format&fit=crop&q=80",
    language: "English",
    popularity: 92,
    director: "Christopher Nolan",
    cast: ["Guy Pearce", "Carrie-Anne Moss", "Joe Pantoliano"],
    featured: false,
    tags: ["amnesia", "polaroids", "tattoos", "nolan", "non linear"]
  },
  {
    id: "cm-047",
    title: "Little Miss Sunshine",
    year: 2006,
    genre: "Comedy",
    genres: ["Comedy", "Drama"],
    rating: 7.8,
    runtime: 101,
    moods: ["Feel-Good", "Funny", "Emotional"],
    vibe: "Yellow VW Van Dysfunctional Love",
    description: "A family determined to get their young daughter into the finals of a beauty pageant take a cross-country trip in their yellow VW bus.",
    poster: "https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=600&auto=format&fit=crop&q=80",
    language: "English",
    popularity: 87,
    director: "Jonathan Dayton, Valerie Faris",
    cast: ["Steve Carell", "Toni Collette", "Greg Kinnear"],
    featured: false,
    tags: ["road trip", "family", "pageant", "quirky", "heartwarming"]
  },
  {
    id: "cm-048",
    title: "Blade Runner 2049",
    year: 2017,
    genre: "Sci-Fi",
    genres: ["Sci-Fi", "Action", "Drama", "Mystery", "Thriller"],
    rating: 8.0,
    runtime: 164,
    moods: ["Mind-Bending", "Dark & Gritty", "Relaxing"],
    vibe: "Neon Cyber Dystopian Reverie",
    description: "Young Blade Runner K's discovery of a long-buried secret leads him to track down former Blade Runner Rick Deckard, who's been missing for thirty years.",
    poster: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600&auto=format&fit=crop&q=80",
    language: "English",
    popularity: 94,
    director: "Denis Villeneuve",
    cast: ["Ryan Gosling", "Harrison Ford", "Ana de Armas"],
    featured: false,
    tags: ["replicant", "cyberpunk", "hologram", "cinematography", "synthwave"]
  },
  {
    id: "cm-049",
    title: "A Monster Calls",
    year: 2016,
    genre: "Fantasy",
    genres: ["Fantasy", "Drama"],
    rating: 7.5,
    runtime: 108,
    moods: ["Emotional", "Inspirational", "Dark & Gritty"],
    vibe: "Ancient Yew Tree Healing",
    description: "A boy seeks the help of a tree monster to cope with his mother's terminal illness and his school bullies.",
    poster: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80",
    language: "English",
    popularity: 82,
    director: "J.A. Bayona",
    cast: ["Lewis MacDougall", "Sigourney Weaver", "Felicity Jones"],
    featured: false,
    tags: ["grief", "tales", "watercolor", "tree monster", "catharsis"]
  },
  {
    id: "cm-050",
    title: "Spider-Man: Across the Spider-Verse",
    year: 2023,
    genre: "Animation",
    genres: ["Animation", "Action", "Adventure", "Sci-Fi"],
    rating: 8.6,
    runtime: 140,
    moods: ["Adrenaline", "Mind-Bending", "Inspirational"],
    vibe: "Visual Masterpiece Explosion",
    description: "Miles Morales catapults across the Multiverse, where he encounters a team of Spider-People charged with protecting its very existence.",
    poster: "https://images.unsplash.com/photo-1635805737707-575885ab0820?w=600&auto=format&fit=crop&q=80",
    language: "English",
    popularity: 98,
    director: "Joaquim Dos Santos, Kemp Powers",
    cast: ["Shameik Moore", "Hailee Steinfeld", "Oscar Isaac"],
    featured: true,
    tags: ["spider-man", "canon", "multiverse", "artistic", "sequel"]
  },
  {
    id: "cm-051",
    title: "Kiki's Delivery Service",
    year: 1989,
    genre: "Animation",
    genres: ["Animation", "Family", "Fantasy"],
    rating: 7.8,
    runtime: 103,
    moods: ["Cozy", "Relaxing", "Feel-Good"],
    vibe: "Breezy Seaside Independence",
    description: "A young witch, on her mandatory year of independent life, finds fitting into a new community difficult while she supports herself by running an air courier service.",
    poster: "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=600&auto=format&fit=crop&q=80",
    language: "Japanese",
    popularity: 87,
    director: "Hayao Miyazaki",
    cast: ["Minami Takayama", "Rei Sakuma", "Kappei Yamaguchi"],
    featured: false,
    tags: ["ghibli", "witch", "bakery", "flying", "growing up"]
  },
  {
    id: "cm-052",
    title: "Nightcrawler",
    year: 2014,
    genre: "Crime",
    genres: ["Crime", "Drama", "Thriller"],
    rating: 7.8,
    runtime: 117,
    moods: ["Dark & Gritty", "Suspenseful", "Adrenaline"],
    vibe: "Nocturnal Predatory Ambition",
    description: "When Louis Bloom, a driven man desperate for work, muscles into the world of L.A. crime journalism, he blurs the line between observer and participant.",
    poster: "https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=600&auto=format&fit=crop&q=80",
    language: "English",
    popularity: 90,
    director: "Dan Gilroy",
    cast: ["Jake Gyllenhaal", "Rene Russo", "Bill Paxton"],
    featured: false,
    tags: ["journalism", "los angeles", "sociopath", "night", "cameraman"]
  },
  {
    id: "cm-053",
    title: "The Intouchables",
    year: 2011,
    genre: "Comedy",
    genres: ["Comedy", "Biography", "Drama"],
    rating: 8.5,
    runtime: 112,
    moods: ["Feel-Good", "Inspirational", "Funny", "Emotional"],
    vibe: "Joyous Unlikely Bond",
    description: "After he becomes a quadriplegic from a paragliding accident, an aristocrat hires a young man from the projects to be his caregiver.",
    poster: "https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=600&auto=format&fit=crop&q=80",
    language: "French",
    popularity: 92,
    director: "Olivier Nakache, Éric Toledano",
    cast: ["François Cluzet", "Omar Sy", "Anne Le Ny"],
    featured: true,
    tags: ["friendship", "caregiver", "humor", "true story", "french"]
  },
  {
    id: "cm-054",
    title: "Gone Girl",
    year: 2014,
    genre: "Mystery",
    genres: ["Mystery", "Drama", "Thriller"],
    rating: 8.1,
    runtime: 149,
    moods: ["Dark & Gritty", "Suspenseful", "Mind-Bending"],
    vibe: "Calculated Media Manipulation",
    description: "With his wife's disappearance having become the focus of an intense media circus, a man sees the spotlight turned on him when it's suspected that he may not be innocent.",
    poster: "https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?w=600&auto=format&fit=crop&q=80",
    language: "English",
    popularity: 95,
    director: "David Fincher",
    cast: ["Ben Affleck", "Rosamund Pike", "Neil Patrick Harris"],
    featured: false,
    tags: ["marriage", "media", "fincher", "psychological", "cool girl"]
  },
  {
    id: "cm-055",
    title: "Soul",
    year: 2020,
    genre: "Animation",
    genres: ["Animation", "Adventure", "Comedy", "Drama", "Family", "Fantasy", "Music"],
    rating: 8.0,
    runtime: 100,
    moods: ["Inspirational", "Cozy", "Emotional", "Feel-Good"],
    vibe: "Spark of Ordinary Life",
    description: "After landing the gig of a lifetime, a New York jazz pianist suddenly finds himself trapped in a strange land between Earth and the afterlife.",
    poster: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80",
    language: "English",
    popularity: 93,
    director: "Pete Docter, Kemp Powers",
    cast: ["Jamie Foxx", "Tina Fey", "Graham Norton"],
    featured: false,
    tags: ["jazz", "afterlife", "passion", "purpose", "pixar"]
  }
];

// Available Filter Definitions
const FILTER_OPTIONS = {
  moods: [
    { id: "Mind-Bending", label: "Mind-Bending", icon: "🧠", desc: "Twists, puzzles & alternate realities" },
    { id: "Adrenaline", label: "Adrenaline", icon: "⚡", desc: "Fast-paced, action-packed thrillers" },
    { id: "Cozy", label: "Cozy", icon: "☕", desc: "Warm, charming, comforting stories" },
    { id: "Dark & Gritty", label: "Dark & Gritty", icon: "🖤", desc: "Tense, atmospheric neo-noir" },
    { id: "Emotional", label: "Emotional", icon: "💧", desc: "Touching, cathartic tearjerkers" },
    { id: "Feel-Good", label: "Feel-Good", icon: "✨", desc: "Uplifting, optimistic happiness" },
    { id: "Romantic", label: "Romantic", icon: "❤️", desc: "Love stories, chemistry & passion" },
    { id: "Funny", label: "Funny", icon: "😂", desc: "Laugh-out-loud humor & wit" },
    { id: "Inspirational", label: "Inspirational", icon: "🚀", desc: "Triumph against odds & human spirit" },
    { id: "Suspenseful", label: "Suspenseful", icon: "🔍", desc: "Edge-of-your-seat tension & mystery" },
    { id: "Relaxing", label: "Relaxing", icon: "🌿", desc: "Gentle pacing, low stress & serene" }
  ],
  genres: [
    "Action", "Adventure", "Animation", "Comedy", "Crime", 
    "Drama", "Fantasy", "Horror", "Mystery", "Romance", 
    "Sci-Fi", "Thriller"
  ],
  ratings: [
    { value: 0, label: "Any Rating" },
    { value: 6.0, label: "6.0+ Good" },
    { value: 7.0, label: "7.0+ Great" },
    { value: 8.0, label: "8.0+ Masterpiece" },
    { value: 8.5, label: "8.5+ Legendary" }
  ],
  runtimes: [
    { value: 0, label: "Any Runtime" },
    { value: 90, label: "Under 90 min (Quick Watch)" },
    { value: 120, label: "Under 120 min (Standard Feature)" },
    { value: 150, label: "Under 150 min (Deep Dive)" }
  ],
  sorts: [
    { value: "relevance", label: "🎯 CineMatch Score" },
    { value: "rating-desc", label: "⭐ Highest Rating" },
    { value: "runtime-asc", label: "⏱️ Shortest Runtime" },
    { value: "runtime-desc", label: "⌛ Longest Runtime" },
    { value: "year-desc", label: "📅 Newest Release" },
    { value: "title-asc", label: "🔤 Title (A to Z)" }
  ]
};

// 4-Step Interactive Quiz Flow
const QUIZ_QUESTIONS = [
  {
    id: "q_mood",
    question: "How are you feeling, or what vibe do you want right now?",
    subtitle: "Select the primary sensation that matches your current headspace.",
    options: [
      { label: "Mind-Bending", icon: "🧠", value: "Mind-Bending", desc: "Blow my mind with twists and deep concepts" },
      { label: "Adrenaline", icon: "⚡", value: "Adrenaline", desc: "I want explosive energy and heart-pumping action" },
      { label: "Cozy & Warm", icon: "☕", value: "Cozy", desc: "A comforting cup of tea in movie form" },
      { label: "Dark & Gritty", icon: "🖤", value: "Dark & Gritty", desc: "Intense, raw, crime or psychological shadows" },
      { label: "Feel-Good", icon: "✨", value: "Feel-Good", desc: "Pure uplifting joy and smile-inducing warmth" },
      { label: "Emotional", icon: "💧", value: "Emotional", desc: "Ready to feel deeply and perhaps shed a tear" },
      { label: "Funny", icon: "😂", value: "Funny", desc: "Make me laugh and forget everyday stress" }
    ]
  },
  {
    id: "q_runtime",
    question: "How much time do you have tonight?",
    subtitle: "We will respect your clock so you don't stay up too late.",
    options: [
      { label: "Under 90 min", icon: "⚡", value: 90, desc: "Quick watch, tight pacing, no bloat" },
      { label: "90 - 120 min", icon: "⏱️", value: 120, desc: "Classic sweet spot for an evening movie" },
      { label: "120 - 150 min", icon: "🍿", value: 150, desc: "Rich storytelling with room to breathe" },
      { label: "Any Runtime", icon: "🌌", value: 0, desc: "I have all night — bring on the epic" }
    ]
  },
  {
    id: "q_genre",
    question: "What cinematic world do you want to enter?",
    subtitle: "Choose a favorite genre or keep it open.",
    options: [
      { label: "Sci-Fi & Speculative", icon: "🛸", value: "Sci-Fi", desc: "Space, technology, and futuristic ideas" },
      { label: "High Action & Thrills", icon: "💥", value: "Action", desc: "Chases, stunts, and high-stakes survival" },
      { label: "Mystery & Whodunit", icon: "🔍", value: "Mystery", desc: "Puzzles, detectives, and secrets to unravel" },
      { label: "Horror & Chills", icon: "👻", value: "Horror", desc: "Hauntings, monsters, and scary suspense" },
      { label: "Comedy & Wit", icon: "🎭", value: "Comedy", desc: "Clever humor and endearing characters" },
      { label: "Animation & Magic", icon: "🎨", value: "Animation", desc: "Stunning visual craftsmanship and wonder" },
      { label: "Romance & Connection", icon: "💌", value: "Romance", desc: "Love, spark, and heartfelt dialogues" },
      { label: "Deep Drama", icon: "📖", value: "Drama", desc: "Character studies and human stories" },
      { label: "Any Genre", icon: "🎲", value: "any", desc: "I'm open to anything that fits my mood!" }
    ]
  },
  {
    id: "q_rating",
    question: "What's your minimum quality bar?",
    subtitle: "How critical are you feeling right now?",
    options: [
      { label: "Masterpieces Only (8.0+)", icon: "🏆", value: 8.0, desc: "Certified all-time greats and critical darlings" },
      { label: "Great Cinema (7.5+)", icon: "⭐", value: 7.5, desc: "High quality, widely praised films" },
      { label: "Solid & Entertaining (6.5+)", icon: "👍", value: 6.5, desc: "Fun, engaging and thoroughly enjoyable" },
      { label: "No Preference", icon: "✨", value: 0, desc: "Judge purely by vibe and mood fit" }
    ]
  }
];

// If running in Node.js test environment, export modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MOVIES_DATASET,
    TMDB_CONFIG,
    TMDB_GENRE_MAP,
    FILTER_OPTIONS,
    QUIZ_QUESTIONS,
    classifyTMDBMovieToMoods,
    normalizeTMDBMovie,
    generateSVGFallbackPoster
  };
}
