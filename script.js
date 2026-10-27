/**
 * CineMatch - Movie Recommendation Tool
 * Core Application Engine & Recommendation Pipeline
 * 
 * B.Tech Semester III Computer Science Project
 * 
 * Features:
 * - Real-Time Live Movie Discovery & Search API Engine
 * - Deterministic, Explainable Weighted Recommendation Pipeline (No Black-Box ML)
 * - Semantic Natural-Language Query Parser
 * - 4-Step Interactive CineMatch Quiz Wizard
 * - Browser LocalStorage Watchlist Persistence & Analytics
 * - Resilient Offline Fallback Layer
 */

// Recommendation Weights Configuration (Normalized to 100%)
const WEIGHTS = {
  mood: 40,
  genre: 25,
  rating: 15,
  runtime: 10,
  attributes: 10
};

// Application State
const state = {
  allMovies: [],
  filteredMovies: [],
  watchlist: [],
  favorites: [],
  preferences: {
    mood: 'all',
    genre: 'all',
    minRating: 0,
    maxRuntime: 0,
    searchQuery: '',
    sortBy: 'relevance'
  },
  quizStep: 0,
  quizAnswers: {},
  activeMovieForModal: null,
  isLiveConnected: true,
  isDatabaseConnected: false,
  searchDebounceTimer: null
};

// LocalStorage Keys
const STORAGE_KEYS = {
  WATCHLIST: 'cinematch_watchlist_v1',
  FAVORITES: 'cinematch_favorites_v1',
  THEME: 'cinematch_theme_v1',
  LAYOUT: 'cinematch_layout_v1'
};

const WATCHLIST_API = '/api/watchlist';

/* ==========================================================================
   1. INITIALIZATION & LIVE CATALOG ENGINE
   ========================================================================== */

/**
 * Initializes the CineMatch Application
 */
async function initApp() {
  // 1. Load saved Watchlist from the SQLite database (with local fallback)
  await loadWatchlist();
  loadFavorites();
  loadAppearancePreferences();

  // 2. Render Filter UI controls (Mood pills, genres, ratings, runtimes)
  renderFilterControls();

  // 3. Setup UI Event Listeners
  setupEventListeners();

  // 4. Update Watchlist UI indicators
  updateWatchlistCountBadge();
  updateFavoritesCountBadge();

  // 5. Fetch initial live recommendations
  await fetchLiveCatalog();
}

/**
 * Fetches movies from the live database according to current filters & search queries
 */
async function fetchLiveCatalog() {
  showLoadingGrid();

  try {
    let url = '';
    const prefs = state.preferences;

    if (prefs.searchQuery && prefs.searchQuery.trim() !== '') {
      // 1. Keyword / Title Search Query
      url = `${TMDB_CONFIG.BASE_URL}/search/movie?api_key=${TMDB_CONFIG.API_KEY}&query=${encodeURIComponent(prefs.searchQuery.trim())}&include_adult=false&page=1`;
    } else if (prefs.genre !== 'all' || prefs.minRating > 0 || prefs.maxRuntime > 0) {
      // 2. Filter Discovery Query
      const params = new URLSearchParams({
        api_key: TMDB_CONFIG.API_KEY,
        include_adult: 'false',
        page: '1',
        sort_by: 'popularity.desc'
      });

      if (prefs.genre !== 'all' && GENRE_NAME_TO_TMDB_ID[prefs.genre]) {
        params.append('with_genres', GENRE_NAME_TO_TMDB_ID[prefs.genre]);
      }
      if (prefs.minRating > 0) {
        params.append('vote_average.gte', String(prefs.minRating));
      }
      if (prefs.maxRuntime > 0) {
        params.append('with_runtime.lte', String(prefs.maxRuntime));
      }

      url = `${TMDB_CONFIG.BASE_URL}/discover/movie?${params.toString()}`;
    } else {
      // 3. General Top Highlights & Trending Stream
      const topUrl = `${TMDB_CONFIG.BASE_URL}/movie/top_rated?api_key=${TMDB_CONFIG.API_KEY}&page=1`;
      const trendUrl = `${TMDB_CONFIG.BASE_URL}/trending/movie/week?api_key=${TMDB_CONFIG.API_KEY}`;
      
      const [topRes, trendRes] = await Promise.all([fetch(topUrl), fetch(trendUrl)]);
      const [topData, trendData] = await Promise.all([topRes.json(), trendRes.json()]);

      const merged = [...(topData.results || []), ...(trendData.results || [])];
      const seen = new Set();
      const unique = [];
      merged.forEach(m => {
        if (m.id && !seen.has(m.id)) {
          seen.add(m.id);
          unique.push(m);
        }
      });

      state.allMovies = unique.map(normalizeTMDBMovie);
      applyFiltersAndRecommend(false);
      return;
    }

    // Execute query
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (data.results && data.results.length > 0) {
      state.allMovies = data.results.map(normalizeTMDBMovie);
      state.isLiveConnected = true;
    } else {
      // No live items returned for specific query
      state.allMovies = [];
    }

    applyFiltersAndRecommend(false);
  } catch (err) {
    console.warn('Network catalog query failed, activating offline curated library fallback:', err);
    state.isLiveConnected = false;
    state.allMovies = [...MOVIES_DATASET];
    applyFiltersAndRecommend(false);
  }
}

function showLoadingGrid() {
  const gridContainer = document.getElementById('movies-grid');
  if (gridContainer) {
    gridContainer.innerHTML = `
      <div class="loading-state">
        <div class="spinner"></div>
        <p>Curating real-time movie recommendations...</p>
      </div>
    `;
  }
}

/* ==========================================================================
   2. RECOMMENDATION ENGINE & WEIGHTED SCORING PIPELINE
   ========================================================================== */

/**
 * Executes the recommendation pipeline:
 * Filters Candidates -> Multi-Factor Scoring -> Dynamic Explanations -> Sorting -> Display
 */
function applyFiltersAndRecommend(triggerFetch = true) {
  if (triggerFetch) {
    fetchLiveCatalog();
    return;
  }

  // Step 1: Constraint Filter
  let { filtered, relaxedFilters } = filterMovies(state.allMovies, state.preferences);

  // Step 2: Calculate recommendation score for each movie
  const scoredMovies = filtered.map(movie => {
    const scoreResult = calculateMatchScore(movie, state.preferences);
    return {
      ...movie,
      matchScore: scoreResult.totalScore,
      scoreBreakdown: scoreResult.breakdown,
      recommendationReasons: generateReasons(movie, state.preferences, scoreResult.breakdown)
    };
  });

  // Step 3: Sort movies by chosen sort order (relevance preserves matchScore)
  const sortedMovies = sortMovies(scoredMovies, state.preferences.sortBy);

  state.filteredMovies = sortedMovies;

  // Step 4: Render to UI with dynamic explanation cards
  displayMovies(sortedMovies, relaxedFilters);
}

/**
 * Step 1 of Pipeline: Hard Constraint Filtering
 */
function filterMovies(movieList, preferences) {
  let relaxed = false;

  let filtered = movieList.filter(movie => {
    // 1. Genre filter
    if (preferences.genre && preferences.genre !== 'all') {
      const matchPrimary = movie.genre.toLowerCase() === preferences.genre.toLowerCase();
      const matchAny = (movie.genres || []).some(g => g.toLowerCase() === preferences.genre.toLowerCase());
      if (!matchPrimary && !matchAny) return false;
    }

    // 2. Minimum rating filter
    if (preferences.minRating && preferences.minRating > 0) {
      if (movie.rating < preferences.minRating) return false;
    }

    // 3. Maximum runtime filter
    if (preferences.maxRuntime && preferences.maxRuntime > 0) {
      if (movie.runtime > preferences.maxRuntime) return false;
    }

    return true;
  });

  // Smart relaxation: if strict filters yielded 0 results, relax runtime and rating
  if (filtered.length === 0 && movieList.length > 0) {
    relaxed = true;
    filtered = movieList.filter(movie => {
      if (preferences.genre && preferences.genre !== 'all') {
        const matchPrimary = movie.genre.toLowerCase() === preferences.genre.toLowerCase();
        const matchAny = (movie.genres || []).some(g => g.toLowerCase() === preferences.genre.toLowerCase());
        if (!matchPrimary && !matchAny) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      filtered = [...movieList];
    }
  }

  return { filtered, relaxedFilters: relaxed };
}

/**
 * Step 2 of Pipeline: Multi-Factor Weighted Scoring
 * Calculates normalized 0-100 match score based on:
 * - Mood/Vibe match (40%)
 * - Genre match (25%)
 * - Rating score (15%)
 * - Runtime fit (10%)
 * - Attributes / Popularity (10%)
 */
function calculateMatchScore(movie, preferences) {
  const moodFactor = calculateMoodScore(movie, preferences.mood);
  const genreFactor = calculateGenreScore(movie, preferences.genre);
  const ratingFactor = calculateRatingScore(movie, preferences.minRating);
  const runtimeFactor = calculateRuntimeScore(movie, preferences.maxRuntime);
  const attrFactor = calculateAttributeScore(movie, preferences);

  // Compute weighted sum
  const weightedTotal = 
    (moodFactor * WEIGHTS.mood) +
    (genreFactor * WEIGHTS.genre) +
    (ratingFactor * WEIGHTS.rating) +
    (runtimeFactor * WEIGHTS.runtime) +
    (attrFactor * WEIGHTS.attributes);

  // Normalize final score to integer percentage
  const totalScore = Math.min(99, Math.max(30, Math.round(weightedTotal)));

  return {
    totalScore,
    breakdown: {
      mood: { factor: moodFactor, points: Math.round(moodFactor * WEIGHTS.mood), max: WEIGHTS.mood },
      genre: { factor: genreFactor, points: Math.round(genreFactor * WEIGHTS.genre), max: WEIGHTS.genre },
      rating: { factor: ratingFactor, points: Math.round(ratingFactor * WEIGHTS.rating), max: WEIGHTS.rating },
      runtime: { factor: runtimeFactor, points: Math.round(runtimeFactor * WEIGHTS.runtime), max: WEIGHTS.runtime },
      attributes: { factor: attrFactor, points: Math.round(attrFactor * WEIGHTS.attributes), max: WEIGHTS.attributes }
    }
  };
}

/**
 * Calculates Mood Score Factor (0.0 to 1.0)
 * Weight: 40%
 */
function calculateMoodScore(movie, targetMood) {
  if (!targetMood || targetMood === 'all') {
    return 0.85; // Neutral baseline
  }

  const movieMoods = (movie.moods || []).map(m => m.toLowerCase());
  const targetLower = targetMood.toLowerCase();

  // 1. Direct mood array match
  if (movieMoods.includes(targetLower)) {
    return 1.0;
  }

  // 2. Vibe tagline match
  if (movie.vibe && movie.vibe.toLowerCase().includes(targetLower)) {
    return 0.95;
  }

  // 3. Synergistic mood associations
  const MOOD_SYNERGIES = {
    'mind-bending': ['suspenseful', 'dark & gritty'],
    'adrenaline': ['suspenseful', 'feel-good'],
    'cozy': ['relaxing', 'feel-good', 'romantic'],
    'dark & gritty': ['suspenseful', 'adrenaline', 'mind-bending'],
    'emotional': ['inspirational', 'romantic'],
    'feel-good': ['funny', 'cozy', 'inspirational'],
    'romantic': ['emotional', 'cozy', 'feel-good'],
    'funny': ['feel-good', 'cozy'],
    'inspirational': ['emotional', 'feel-good', 'adrenaline'],
    'suspenseful': ['dark & gritty', 'mind-bending', 'adrenaline'],
    'relaxing': ['cozy', 'feel-good', 'romantic']
  };

  const synergies = MOOD_SYNERGIES[targetLower] || [];
  for (const syn of synergies) {
    if (movieMoods.includes(syn)) {
      return 0.65;
    }
  }

  return 0.25;
}

/**
 * Calculates Genre Score Factor (0.0 to 1.0)
 * Weight: 25%
 */
function calculateGenreScore(movie, targetGenre) {
  if (!targetGenre || targetGenre === 'all') {
    return 0.85;
  }

  const target = targetGenre.toLowerCase();
  const primary = (movie.genre || '').toLowerCase();
  const allGenres = (movie.genres || []).map(g => g.toLowerCase());

  if (primary === target) {
    return 1.0;
  }
  if (allGenres.includes(target)) {
    return 0.85;
  }
  return 0.15;
}

/**
 * Calculates Rating Score Factor (0.0 to 1.0)
 * Weight: 15%
 */
function calculateRatingScore(movie, minRating) {
  const rating = movie.rating || 7.0;

  if (!minRating || minRating === 0) {
    return Math.min(1.0, Math.max(0.4, rating / 10.0 + 0.05));
  }

  if (rating >= minRating) {
    const surplus = rating - minRating;
    return Math.min(1.0, 0.85 + (surplus * 0.1));
  }

  const deficit = minRating - rating;
  return Math.max(0.1, 0.7 - (deficit * 0.25));
}

/**
 * Calculates Runtime Score Factor (0.0 to 1.0)
 * Weight: 10%
 */
function calculateRuntimeScore(movie, maxRuntime) {
  const runtime = movie.runtime || 110;

  if (!maxRuntime || maxRuntime === 0) {
    return 0.9;
  }

  if (runtime <= maxRuntime) {
    return 1.0;
  }

  const overtime = runtime - maxRuntime;
  return Math.max(0.2, 1.0 - (overtime / 60));
}

/**
 * Calculates Attribute & Popularity Score Factor (0.0 to 1.0)
 * Weight: 10%
 */
function calculateAttributeScore(movie, preferences) {
  let score = 0.5;

  if (movie.popularity) {
    score += (movie.popularity / 100) * 0.25;
  }

  if (movie.featured) {
    score += 0.15;
  }

  if (preferences.searchQuery) {
    const q = preferences.searchQuery.toLowerCase();
    const inTags = (movie.tags || []).some(t => t.toLowerCase().includes(q));
    const inDesc = (movie.description || '').toLowerCase().includes(q);
    if (inTags || inDesc) score += 0.15;
  }

  return Math.min(1.0, score);
}

/* ==========================================================================
   3. EXPLAINABLE RECOMMENDATIONS GENERATOR
   ========================================================================== */

/**
 * Generates honest, dynamic explanations based on verified matching criteria.
 */
function generateReasons(movie, preferences, breakdown) {
  const reasons = [];

  // 1. Mood reason
  if (preferences.mood && preferences.mood !== 'all') {
    const movieMoods = (movie.moods || []).map(m => m.toLowerCase());
    if (movieMoods.includes(preferences.mood.toLowerCase())) {
      reasons.push(`✓ Matches your <strong>${preferences.mood}</strong> mood`);
    } else if (breakdown.mood.factor >= 0.6) {
      reasons.push(`✓ Captures the vibe of your <strong>${preferences.mood}</strong> preference`);
    }
  } else if (movie.moods && movie.moods.length > 0) {
    reasons.push(`✓ Features strong <strong>${movie.moods.slice(0, 2).join(' & ')}</strong> vibes`);
  }

  // 2. Genre reason
  if (preferences.genre && preferences.genre !== 'all') {
    if (movie.genre.toLowerCase() === preferences.genre.toLowerCase()) {
      reasons.push(`✓ Exact fit for your <strong>${preferences.genre}</strong> genre selection`);
    } else if ((movie.genres || []).some(g => g.toLowerCase() === preferences.genre.toLowerCase())) {
      reasons.push(`✓ Strong <strong>${preferences.genre}</strong> narrative elements`);
    }
  } else {
    reasons.push(`✓ Standout film in the <strong>${movie.genre}</strong> category`);
  }

  // 3. Rating reason
  if (preferences.minRating && preferences.minRating > 0) {
    if (movie.rating >= preferences.minRating) {
      reasons.push(`✓ Rating (<strong>${movie.rating}/10</strong>) surpasses your minimum threshold of ${preferences.minRating}`);
    }
  } else if (movie.rating >= 8.5) {
    reasons.push(`✓ Masterpiece with an exceptional <strong>${movie.rating}/10</strong> critical rating`);
  } else if (movie.rating >= 8.0) {
    reasons.push(`✓ Widely acclaimed with a strong <strong>${movie.rating}/10</strong> score`);
  }

  // 4. Runtime reason
  if (preferences.maxRuntime && preferences.maxRuntime > 0) {
    if (movie.runtime <= preferences.maxRuntime) {
      reasons.push(`✓ Runtime of <strong>${movie.runtime} min</strong> fits within your ${preferences.maxRuntime} min window`);
    }
  } else if (movie.runtime < 100) {
    reasons.push(`✓ Tight, crisp pacing at just <strong>${movie.runtime} minutes</strong>`);
  } else if (movie.runtime > 140) {
    reasons.push(`✓ Immersive long-form storytelling spanning <strong>${movie.runtime} minutes</strong>`);
  }

  // 5. Director / Atmosphere nuance
  if (movie.director && movie.director !== 'Acclaimed Visionary') {
    reasons.push(`✓ Visionary direction by <strong>${movie.director}</strong>`);
  } else if (movie.vibe) {
    reasons.push(`✓ Atmosphere: <em>"${movie.vibe}"</em>`);
  }

  return reasons.slice(0, 4);
}

/* ==========================================================================
   4. NATURAL-LANGUAGE SEARCH PARSER
   ========================================================================== */

/**
 * Parses natural language input into structured CineMatch parameters.
 */
function parseNaturalLanguage(rawQuery) {
  if (!rawQuery || typeof rawQuery !== 'string') {
    return null;
  }

  const query = rawQuery.toLowerCase().trim();
  const detected = {
    mood: null,
    genre: null,
    maxRuntime: null,
    minRating: null,
    tokens: []
  };

  // 1. Mood Extraction
  const MOOD_PATTERNS = [
    { mood: 'Mind-Bending', regex: /\b(mind[- ]?bending|twist|confusing|complex|trippy|puzzle|matrix|inception)\b/i },
    { mood: 'Adrenaline', regex: /\b(adrenaline|action[- ]?packed|intense|explosive|fast[- ]?paced|thrilling|rush|combat|fight)\b/i },
    { mood: 'Cozy', regex: /\b(cozy|cosy|comforting|wholesome|rainy day|warm|gentle|charming)\b/i },
    { mood: 'Dark & Gritty', regex: /\b(dark( and| &)? gritty|gritty|bleak|noir|crime|sinister|brutal|dark)\b/i },
    { mood: 'Emotional', regex: /\b(emotional|sad|cry|tearjerker|touching|heartbreaking|poignant|moving)\b/i },
    { mood: 'Feel-Good', regex: /\b(feel[- ]?good|uplifting|cheerful|joy|happy|sweet|lighthearted)\b/i },
    { mood: 'Romantic', regex: /\b(romantic|romance|love story|date night|crush|couple)\b/i },
    { mood: 'Funny', regex: /\b(funny|comedy|laugh|hilarious|humorous|humor|silly|fun)\b/i },
    { mood: 'Inspirational', regex: /\b(inspirational|inspiring|motivation|motivational|triumph|perseverance)\b/i },
    { mood: 'Suspenseful', regex: /\b(suspenseful|suspense|edge of seat|tense|creepy|spooky|mystery)\b/i },
    { mood: 'Relaxing', regex: /\b(relaxing|relax|chill|calm|peaceful|serene|slow burn)\b/i }
  ];

  for (const item of MOOD_PATTERNS) {
    if (item.regex.test(query)) {
      detected.mood = item.mood;
      detected.tokens.push(`Mood: ${item.mood}`);
      break;
    }
  }

  // 2. Genre Extraction
  const GENRE_PATTERNS = [
    { genre: 'Sci-Fi', regex: /\b(sci[- ]?fi|science fiction|space|futuristic|alien)\b/i },
    { genre: 'Action', regex: /\b(action|martial arts|shootout)\b/i },
    { genre: 'Animation', regex: /\b(animation|animated|cartoon|pixar|ghibli|anime)\b/i },
    { genre: 'Comedy', regex: /\b(comedy|comedies|parody)\b/i },
    { genre: 'Crime', regex: /\b(crime|gangster|mob|heist|mafia)\b/i },
    { genre: 'Drama', regex: /\b(drama|dramatic)\b/i },
    { genre: 'Fantasy', regex: /\b(fantasy|magic|wizard|dragons)\b/i },
    { genre: 'Horror', regex: /\b(horror|scary|terrifying|monsters|ghost)\b/i },
    { genre: 'Mystery', regex: /\b(mystery|detective|whodunit|investigation)\b/i },
    { genre: 'Romance', regex: /\b(romance|romantic)\b/i },
    { genre: 'Thriller', regex: /\b(thriller|psychological thriller)\b/i }
  ];

  for (const item of GENRE_PATTERNS) {
    if (item.regex.test(query)) {
      detected.genre = item.genre;
      detected.tokens.push(`Genre: ${item.genre}`);
      break;
    }
  }

  // 3. Runtime Extraction
  if (/\b(under 90|less than 90|short|quick|under an hour and a half)\b/i.test(query)) {
    detected.maxRuntime = 90;
    detected.tokens.push('Max Runtime: 90 min');
  } else if (/\b(under 2 hours?|under 120|less than 2 hours?|around 2 hours?)\b/i.test(query)) {
    detected.maxRuntime = 120;
    detected.tokens.push('Max Runtime: 120 min');
  } else if (/\b(under 2\.5 hours?|under 150|less than 2\.5 hours?|deep dive)\b/i.test(query)) {
    detected.maxRuntime = 150;
    detected.tokens.push('Max Runtime: 150 min');
  }

  // 4. Rating Extraction
  if (/\b(masterpiece|legendary|critically acclaimed|top rated|best of all time|highest rated|9\+)\b/i.test(query)) {
    detected.minRating = 8.5;
    detected.tokens.push('Min Rating: 8.5+');
  } else if (/\b(high rated|high rating|highly rated|great rating|top rating|above 8|8\+|over 8)\b/i.test(query)) {
    detected.minRating = 8.0;
    detected.tokens.push('Min Rating: 8.0+');
  } else if (/\b(good rating|solid|7\+|above 7)\b/i.test(query)) {
    detected.minRating = 7.0;
    detected.tokens.push('Min Rating: 7.0+');
  }

  return detected;
}

/**
 * Handles submission of Natural-Language Search
 */
async function handleNaturalLanguageSearch(query) {
  const result = parseNaturalLanguage(query);
  const feedbackContainer = document.getElementById('nlp-detected-banner');

  if (!result || result.tokens.length === 0) {
    state.preferences.searchQuery = query;
    await fetchLiveCatalog();
    if (feedbackContainer) {
      feedbackContainer.innerHTML = `
        <div class="nlp-badge-row">
          <span class="nlp-chip text-search">🔍 Text Search: "${escapeHTML(query)}"</span>
        </div>
      `;
      feedbackContainer.classList.add('visible');
    }
    return;
  }

  // Apply parsed attributes to preference state
  if (result.mood) state.preferences.mood = result.mood;
  if (result.genre) state.preferences.genre = result.genre;
  if (result.maxRuntime) state.preferences.maxRuntime = result.maxRuntime;
  if (result.minRating) state.preferences.minRating = result.minRating;

  // Clear plain text search if structured criteria were parsed
  state.preferences.searchQuery = '';

  // Sync UI controls with new preferences
  syncUIControlsWithPreferences();

  // Display Detected Preferences Banner
  if (feedbackContainer) {
    feedbackContainer.innerHTML = `
      <div class="nlp-detected-content">
        <span class="nlp-label">⚡ CineMatch Parsed:</span>
        <div class="nlp-chips-list">
          ${result.tokens.map(t => `<span class="nlp-chip">${escapeHTML(t)}</span>`).join('')}
        </div>
        <button class="nlp-clear-btn" id="nlp-clear-btn" title="Clear parsed query">&times; Reset</button>
      </div>
    `;
    feedbackContainer.classList.add('visible');

    document.getElementById('nlp-clear-btn')?.addEventListener('click', () => {
      clearFilters();
      feedbackContainer.classList.remove('visible');
      const input = document.getElementById('nlp-input');
      if (input) input.value = '';
    });
  }

  // Execute live query and recommend
  await fetchLiveCatalog();
  scrollToResults();
}

/* ==========================================================================
   5. INTERACTIVE CINEMATCH QUIZ WIZARD
   ========================================================================== */

function renderQuiz() {
  const container = document.getElementById('quiz-container');
  if (!container) return;

  const currentQ = QUIZ_QUESTIONS[state.quizStep];
  if (!currentQ) return;

  const totalSteps = QUIZ_QUESTIONS.length;
  const progressPercent = Math.round(((state.quizStep + 1) / totalSteps) * 100);

  container.innerHTML = `
    <div class="quiz-header">
      <div class="quiz-progress-bar-wrap">
        <div class="quiz-progress-fill" style="width: ${progressPercent}%"></div>
      </div>
      <div class="quiz-step-meta">
        <span class="quiz-step-tag">QUESTION ${state.quizStep + 1} OF ${totalSteps}</span>
        <span class="quiz-step-pct">${progressPercent}% Completed</span>
      </div>
      <h3 class="quiz-title">${escapeHTML(currentQ.question)}</h3>
      <p class="quiz-subtitle">${escapeHTML(currentQ.subtitle)}</p>
    </div>

    <div class="quiz-options-grid">
      ${currentQ.options.map((opt) => {
        const isSelected = state.quizAnswers[currentQ.id] === opt.value;
        return `
          <div class="quiz-option-card ${isSelected ? 'selected' : ''}" data-value="${escapeHTML(String(opt.value))}">
            <div class="quiz-option-icon">${opt.icon || '🎬'}</div>
            <div class="quiz-option-info">
              <h4 class="quiz-option-label">${escapeHTML(opt.label)}</h4>
              <p class="quiz-option-desc">${escapeHTML(opt.desc)}</p>
            </div>
          </div>
        `;
      }).join('')}
    </div>

    <div class="quiz-actions-bar">
      ${state.quizStep > 0 ? `<button class="btn btn-secondary" id="quiz-back-btn">← Back</button>` : `<div></div>`}
      <button class="btn btn-primary" id="quiz-next-btn" ${state.quizAnswers[currentQ.id] === undefined ? 'disabled' : ''}>
        ${state.quizStep === totalSteps - 1 ? 'Show My Recommendations 🚀' : 'Next Step →'}
      </button>
    </div>
  `;

  // Option selection
  container.querySelectorAll('.quiz-option-card').forEach(card => {
    card.addEventListener('click', () => {
      container.querySelectorAll('.quiz-option-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');

      const rawVal = card.getAttribute('data-value');
      let parsedVal = rawVal;
      if (rawVal === '90' || rawVal === '120' || rawVal === '150') parsedVal = parseInt(rawVal, 10);
      else if (rawVal === '6.5' || rawVal === '7.5' || rawVal === '8.0') parsedVal = parseFloat(rawVal);
      else if (rawVal === '0') parsedVal = 0;

      state.quizAnswers[currentQ.id] = parsedVal;
      
      const nextBtn = document.getElementById('quiz-next-btn');
      if (nextBtn) nextBtn.removeAttribute('disabled');
    });
  });

  // Actions
  document.getElementById('quiz-back-btn')?.addEventListener('click', () => {
    if (state.quizStep > 0) {
      state.quizStep--;
      renderQuiz();
    }
  });

  document.getElementById('quiz-next-btn')?.addEventListener('click', () => {
    if (state.quizStep < totalSteps - 1) {
      state.quizStep++;
      renderQuiz();
    } else {
      finishQuiz();
    }
  });
}

async function finishQuiz() {
  const answers = state.quizAnswers;

  if (answers.q_mood) state.preferences.mood = answers.q_mood;
  if (answers.q_genre && answers.q_genre !== 'any') state.preferences.genre = answers.q_genre;
  else state.preferences.genre = 'all';
  if (answers.q_runtime !== undefined) state.preferences.maxRuntime = answers.q_runtime;
  if (answers.q_rating !== undefined) state.preferences.minRating = answers.q_rating;

  closeQuizModal();
  syncUIControlsWithPreferences();

  await fetchLiveCatalog();

  showToast('Quiz preferences applied! Showing your personalized movie matches.', 'success');
  scrollToResults();
}

function openQuizModal() {
  state.quizStep = 0;
  state.quizAnswers = {};
  const modal = document.getElementById('quiz-modal');
  if (modal) {
    modal.classList.add('active');
    document.body.classList.add('modal-open');
    renderQuiz();
  }
}

function closeQuizModal() {
  const modal = document.getElementById('quiz-modal');
  if (modal) {
    modal.classList.remove('active');
    document.body.classList.remove('modal-open');
  }
}

/* ========================================================================== 
   6. WATCHLIST (SQLITE DATABASE WITH LOCAL FALLBACK)
   ========================================================================== */

async function loadWatchlist() {
  try {
    const response = await fetch(WATCHLIST_API);
    if (!response.ok) throw new Error(`Database request failed: ${response.status}`);
    state.watchlist = await response.json();
    state.isDatabaseConnected = true;
    saveWatchlist(); // keeps a last-known copy if the server is later unavailable
  } catch (err) {
    console.warn('Watchlist database is unavailable; using local backup.', err);
    state.isDatabaseConnected = false;
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.WATCHLIST);
      state.watchlist = raw ? JSON.parse(raw) : [];
    } catch (storageError) {
      console.error('Error reading local watchlist backup:', storageError);
      state.watchlist = [];
    }
  }
}

function saveWatchlist() {
  try {
    localStorage.setItem(STORAGE_KEYS.WATCHLIST, JSON.stringify(state.watchlist));
  } catch (err) {
    console.error('Error saving local watchlist backup:', err);
  }
}

async function syncWatchlistChange(method, movieId, movie) {
  if (!state.isDatabaseConnected) return;
  try {
    const response = await fetch(movieId ? `${WATCHLIST_API}/${encodeURIComponent(movieId)}` : WATCHLIST_API, {
      method,
      headers: movie ? { 'Content-Type': 'application/json' } : undefined,
      body: movie ? JSON.stringify(movie) : undefined
    });
    if (!response.ok) throw new Error(`Database request failed: ${response.status}`);
  } catch (err) {
    console.warn('Could not sync watchlist change to database; local backup retained.', err);
    state.isDatabaseConnected = false;
    showToast('Saved locally — database connection is unavailable.', 'info');
  }
}

function createWatchlistRecord(movie) {
  return {
    id: movie.id,
    tmdbId: movie.tmdbId || null,
    title: movie.title,
    year: movie.year,
    genre: movie.genre,
    rating: movie.rating,
    runtime: movie.runtime,
    poster: movie.poster,
    vibe: movie.vibe || 'Curated Classic',
    director: movie.director || null,
    cast: movie.cast || [],
    budget: movie.budget || null,
    revenue: movie.revenue || null,
    ottProviders: movie.ottProviders || [],
    addedAt: new Date().toISOString()
  };
}

async function addToWatchlist(movie) {
  if (isInWatchlist(movie.id)) {
    await removeFromWatchlist(movie.id);
    return;
  }

  const record = createWatchlistRecord(movie);
  state.watchlist.unshift(record);

  saveWatchlist();
  await syncWatchlistChange('POST', null, record);
  updateWatchlistCountBadge();
  updateMovieCardWatchlistState(movie.id, true);
  showToast(`Added "${movie.title}" to your Watchlist`, 'success');
}

async function removeFromWatchlist(movieId) {
  const index = state.watchlist.findIndex(m => m.id === movieId);
  if (index !== -1) {
    const title = state.watchlist[index].title;
    state.watchlist.splice(index, 1);
    saveWatchlist();
    await syncWatchlistChange('DELETE', movieId);
    updateWatchlistCountBadge();
    updateMovieCardWatchlistState(movieId, false);
    renderWatchlistView();
    showToast(`Removed "${title}" from Watchlist`, 'info');
  }
}

function isInWatchlist(movieId) {
  return state.watchlist.some(m => m.id === movieId);
}

/* Favorites are deliberately separate from the watchlist: a favorite is a film
   you love, while a watchlist entry is something you still plan to watch. */
function loadFavorites() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.FAVORITES);
    state.favorites = raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.warn('Could not load favorites:', err);
    state.favorites = [];
  }
}

function saveFavorites() {
  try {
    localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(state.favorites));
  } catch (err) {
    console.warn('Could not save favorites:', err);
  }
}

function isFavorite(movieId) {
  return state.favorites.some(m => m.id === movieId);
}

function toggleFavorite(movie) {
  const index = state.favorites.findIndex(m => m.id === movie.id);
  if (index >= 0) {
    state.favorites.splice(index, 1);
    showToast(`Removed "${movie.title}" from favorites`, 'info');
  } else {
    state.favorites.unshift({ ...createWatchlistRecord(movie), favoritedAt: new Date().toISOString() });
    showToast(`♥ "${movie.title}" added to favorites`, 'success');
  }
  saveFavorites();
  updateFavoritesCountBadge();
  updateMovieCardFavoriteState(movie.id, isFavorite(movie.id));
  if (document.getElementById('favorites-modal')?.classList.contains('active')) renderFavoritesView();
}

function updateFavoritesCountBadge() {
  document.querySelectorAll('.favorites-count-badge').forEach(badge => {
    badge.textContent = state.favorites.length;
    badge.classList.toggle('visible', state.favorites.length > 0);
  });
}

function updateMovieCardFavoriteState(movieId, favorited) {
  document.querySelectorAll(`.favorite-btn[data-movie-id="${movieId}"]`).forEach(btn => {
    btn.classList.toggle('is-favorite', favorited);
    btn.setAttribute('aria-pressed', String(favorited));
    btn.setAttribute('title', favorited ? 'Remove from Favorites' : 'Add to Favorites');
    btn.innerHTML = favorited ? '<span aria-hidden="true">♥</span> Favorited' : '<span aria-hidden="true">♡</span> Favorite';
  });
}

function renderFavoritesView() {
  const container = document.getElementById('favorites-content');
  if (!container) return;
  if (!state.favorites.length) {
    container.innerHTML = `
      <div class="empty-watchlist-state">
        <div class="empty-icon">♡</div>
        <h3>No Favorites Yet</h3>
        <p>Tap the heart on any movie card to build a personal collection of films you love.</p>
        <button class="btn btn-primary" id="favorites-discover-btn">Explore Movies</button>
      </div>`;
    document.getElementById('favorites-discover-btn')?.addEventListener('click', () => {
      closeFavoritesModal();
      scrollToResults();
    });
    return;
  }
  container.innerHTML = `
    <div class="watchlist-stats-bar favorites-stats-bar">
      <div class="stat-pill"><span class="stat-num">${state.favorites.length}</span><span class="stat-lbl">Favorites Saved</span></div>
      <p>Keep the films that define your taste close at hand.</p>
    </div>
    <div class="watchlist-grid">
      ${state.favorites.map(movie => `
        <div class="watchlist-item-card">
          <img src="${escapeHTML(movie.poster)}" alt="${escapeHTML(movie.title)} poster" class="watchlist-item-poster" onerror="this.onerror=null; this.src=generateSVGFallbackPoster('${escapeHTML(movie.title)}', '${escapeHTML(movie.genre)}', ${movie.year});" />
          <div class="watchlist-item-details">
            <h4 class="watchlist-item-title">${escapeHTML(movie.title)}</h4>
            <div class="watchlist-item-meta"><span>⭐ ${movie.rating}</span><span>•</span><span>${movie.year}</span></div>
            <span class="watchlist-item-genre">${escapeHTML(movie.genre)}</span>
            <div class="watchlist-item-actions">
              <button class="btn btn-sm btn-secondary favorite-info-btn" data-movie-id="${movie.id}">Info</button>
              <button class="btn btn-sm btn-danger favorite-remove-btn" data-movie-id="${movie.id}">Remove</button>
            </div>
          </div>
        </div>`).join('')}
    </div>`;
  container.querySelectorAll('.favorite-info-btn').forEach(btn => btn.addEventListener('click', () => {
    closeFavoritesModal();
    openWhyModal(btn.getAttribute('data-movie-id'));
  }));
  container.querySelectorAll('.favorite-remove-btn').forEach(btn => btn.addEventListener('click', () => {
    const movie = state.favorites.find(item => item.id === btn.getAttribute('data-movie-id'));
    if (movie) toggleFavorite(movie);
  }));
}

function openFavoritesModal() {
  closeSidebar();
  document.getElementById('favorites-modal')?.classList.add('active');
  document.body.classList.add('modal-open');
  renderFavoritesView();
}

function closeFavoritesModal() {
  document.getElementById('favorites-modal')?.classList.remove('active');
  document.body.classList.remove('modal-open');
}

function updateWatchlistCountBadge() {
  const badges = document.querySelectorAll('.watchlist-count-badge');
  badges.forEach(b => {
    b.textContent = state.watchlist.length;
    if (state.watchlist.length > 0) b.classList.add('visible');
    else b.classList.remove('visible');
  });
}

function updateMovieCardWatchlistState(movieId, inWatchlist) {
  const btn = document.querySelector(`.watchlist-btn[data-movie-id="${movieId}"]`);
  if (btn) {
    if (inWatchlist) {
      btn.classList.add('in-watchlist');
      btn.innerHTML = `<span class="icon">✓</span> Saved`;
      btn.setAttribute('title', 'Remove from Watchlist');
    } else {
      btn.classList.remove('in-watchlist');
      btn.innerHTML = `<span class="icon">+</span> Watchlist`;
      btn.setAttribute('title', 'Add to Watchlist');
    }
  }
}

function renderWatchlistView() {
  const container = document.getElementById('watchlist-content');
  if (!container) return;

  if (state.watchlist.length === 0) {
    container.innerHTML = `
      <div class="empty-watchlist-state">
        <div class="empty-icon">🍿</div>
        <h3>Your Watchlist is Empty</h3>
        <p>Save movies that catch your eye while browsing or taking the mood quiz to watch later tonight.</p>
        <button class="btn btn-primary" onclick="closeWatchlistModal(); scrollToResults();">
          Discover Movies Now
        </button>
      </div>
    `;
    return;
  }

  const totalMinutes = state.watchlist.reduce((sum, m) => sum + (m.runtime || 110), 0);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const avgRating = (state.watchlist.reduce((sum, m) => sum + (m.rating || 7), 0) / state.watchlist.length).toFixed(1);

  container.innerHTML = `
    <div class="watchlist-stats-bar">
      <div class="stat-pill">
        <span class="stat-num">${state.watchlist.length}</span>
        <span class="stat-lbl">Movies Saved</span>
      </div>
      <div class="stat-pill">
        <span class="stat-num">${hours}h ${mins}m</span>
        <span class="stat-lbl">Total Watch Time</span>
      </div>
      <div class="stat-pill">
        <span class="stat-num">${avgRating} ★</span>
        <span class="stat-lbl">Average Rating</span>
      </div>
      <button class="btn btn-sm btn-outline-danger" id="clear-watchlist-btn">Clear All</button>
    </div>

    <div class="watchlist-grid">
      ${state.watchlist.map(m => `
        <div class="watchlist-item-card">
          <img 
            src="${escapeHTML(m.poster)}" 
            alt="${escapeHTML(m.title)} Poster" 
            class="watchlist-item-poster"
            onerror="this.onerror=null; this.src=generateSVGFallbackPoster('${escapeHTML(m.title)}', '${escapeHTML(m.genre)}', ${m.year});"
          />
          <div class="watchlist-item-details">
            <h4 class="watchlist-item-title">${escapeHTML(m.title)}</h4>
            <div class="watchlist-item-meta">
              <span>⭐ ${m.rating}</span>
              <span>•</span>
              <span>⏱️ ${m.runtime}m</span>
              <span>•</span>
              <span>${m.year}</span>
            </div>
            <span class="watchlist-item-genre">${escapeHTML(m.genre)}</span>
            <div class="watchlist-item-actions">
              <button class="btn btn-sm btn-secondary why-btn" data-movie-id="${m.id}">Why Match?</button>
              <button class="btn btn-sm btn-danger remove-btn" data-remove-id="${m.id}">Remove</button>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  // Attach delete handlers
  container.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-remove-id');
      removeFromWatchlist(id);
    });
  });

  // Attach Why handlers inside watchlist
  container.querySelectorAll('.why-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-movie-id');
      openWhyModal(id);
    });
  });

  // Clear all
  document.getElementById('clear-watchlist-btn')?.addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear your entire watchlist?')) {
      state.watchlist = [];
      saveWatchlist();
      await syncWatchlistChange('DELETE');
      updateWatchlistCountBadge();
      renderWatchlistView();
      applyFiltersAndRecommend(false);
      showToast('Watchlist cleared', 'info');
    }
  });
}

function openWatchlistModal() {
  const modal = document.getElementById('watchlist-modal');
  if (modal) {
    modal.classList.add('active');
    document.body.classList.add('modal-open');
    renderWatchlistView();
  }
}

function closeWatchlistModal() {
  const modal = document.getElementById('watchlist-modal');
  if (modal) {
    modal.classList.remove('active');
    document.body.classList.remove('modal-open');
  }
}

/* ==========================================================================
   7. SORTING & LOCAL SEARCH
   ========================================================================== */

function sortMovies(movies, sortCriteria) {
  const cloned = [...movies];
  switch (sortCriteria) {
    case 'relevance':
      return cloned.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
    case 'rating-desc':
      return cloned.sort((a, b) => b.rating - a.rating);
    case 'runtime-asc':
      return cloned.sort((a, b) => a.runtime - b.runtime);
    case 'runtime-desc':
      return cloned.sort((a, b) => b.runtime - a.runtime);
    case 'year-desc':
      return cloned.sort((a, b) => b.year - a.year);
    case 'title-asc':
      return cloned.sort((a, b) => a.title.localeCompare(b.title));
    default:
      return cloned.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
  }
}

/* ========================================================================== 
   8. "WHY THIS MOVIE?" EXPLANATION MODAL & TRAILER
   ========================================================================== */

function formatCurrency(amount) {
  if (!amount || Number(amount) <= 0) return 'Not publicly reported';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: Number(amount) >= 1_000_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1
  }).format(Number(amount));
}

async function getJsonIfAvailable(url) {
  try {
    const response = await fetch(url);
    return response.ok ? response.json() : null;
  } catch {
    return null;
  }
}

async function hydrateMovieDetails(movie) {
  let tmdbId = movie.tmdbId;
  if (!tmdbId) {
    const search = await getJsonIfAvailable(
      `${TMDB_CONFIG.BASE_URL}/search/movie?api_key=${TMDB_CONFIG.API_KEY}&query=${encodeURIComponent(movie.title)}&year=${movie.year}`
    );
    tmdbId = search?.results?.[0]?.id || null;
  }

  if (!tmdbId) return movie;

  const base = `${TMDB_CONFIG.BASE_URL}/movie/${tmdbId}`;
  const [details, credits, providerData] = await Promise.all([
    getJsonIfAvailable(`${base}?api_key=${TMDB_CONFIG.API_KEY}`),
    getJsonIfAvailable(`${base}/credits?api_key=${TMDB_CONFIG.API_KEY}`),
    getJsonIfAvailable(`${base}/watch/providers?api_key=${TMDB_CONFIG.API_KEY}`)
  ]);

  const director = credits?.crew
    ?.filter(person => person.job === 'Director')
    .map(person => person.name)
    .join(', ') || movie.director;
  const cast = credits?.cast?.slice(0, 6).map(person => person.name) || movie.cast || [];
  const regions = providerData?.results || {};
  const providerRegion = regions.IN || regions.US || Object.values(regions)[0] || {};
  const providerMap = new Map();
  ['flatrate', 'free', 'ads', 'rent', 'buy'].forEach(type => {
    (providerRegion[type] || []).forEach(provider => providerMap.set(provider.provider_id, {
      name: provider.provider_name,
      type,
      logo: provider.logo_path ? `${TMDB_CONFIG.IMAGE_BASE}${provider.logo_path}` : null
    }));
  });

  return {
    ...movie,
    tmdbId,
    runtime: details?.runtime || movie.runtime,
    budget: details?.budget || movie.budget || null,
    revenue: details?.revenue || movie.revenue || null,
    director,
    cast,
    ottProviders: Array.from(providerMap.values()),
    ottLink: providerRegion.link || null
  };
}

function renderOttProviders(movie) {
  if (!movie.ottProviders?.length) return '<span class="fact-unavailable">Availability not listed for your region</span>';
  return movie.ottProviders.slice(0, 6).map(provider => `
    <span class="ott-provider" title="${escapeHTML(provider.type)}">
      ${provider.logo ? `<img src="${escapeHTML(provider.logo)}" alt="" />` : ''}
      ${escapeHTML(provider.name)}
    </span>
  `).join('');
}

async function openWhyModal(movieId, autoStartTrailer = false) {
  let movie = state.allMovies.find(m => m.id === movieId) || state.watchlist.find(m => m.id === movieId) || state.favorites.find(m => m.id === movieId);
  if (!movie) return;

  const modal = document.getElementById('why-modal');
  const content = document.getElementById('why-modal-content');
  if (!modal || !content) return;

  modal.classList.add('active');
  document.body.classList.add('modal-open');
  content.innerHTML = '<div class="detail-loading"><div class="spinner"></div><p>Loading movie details, cast and streaming availability...</p></div>';

  movie = await hydrateMovieDetails(movie);
  state.activeMovieForModal = movie;
  const savedMovie = state.watchlist.find(saved => saved.id === movie.id);
  if (savedMovie) {
    Object.assign(savedMovie, createWatchlistRecord(movie), { addedAt: savedMovie.addedAt });
    saveWatchlist();
    syncWatchlistChange('POST', null, savedMovie);
  }

  const scoreResult = calculateMatchScore(movie, state.preferences);
  const reasons = generateReasons(movie, state.preferences, scoreResult.breakdown);

  content.innerHTML = `
    <div class="why-modal-hero">
      <img 
        src="${escapeHTML(movie.poster)}" 
        alt="${escapeHTML(movie.title)}" 
        class="why-modal-poster"
        onerror="this.onerror=null; this.src=generateSVGFallbackPoster('${escapeHTML(movie.title)}', '${escapeHTML(movie.genre)}', ${movie.year});"
      />
      <div class="why-modal-header-info">
        <div class="why-score-pill">
          <span class="why-score-num">${scoreResult.totalScore}%</span>
          <span class="why-score-text">CineMatch Compatibility</span>
        </div>
        <h2 class="why-movie-title">${escapeHTML(movie.title)} <span class="year">(${movie.year})</span></h2>
        <div class="why-meta-tags">
          <span class="tag-pill">⭐ ${movie.rating}/10</span>
          <span class="tag-pill">⏱️ ${movie.runtime} min</span>
          <span class="tag-pill genre">${escapeHTML(movie.genre)}</span>
          <span class="tag-pill lang">${escapeHTML(movie.language || 'EN')}</span>
        </div>
        <p class="why-vibe-tag"><strong>Vibe:</strong> ${escapeHTML(movie.vibe || 'Cinematic Marvel')}</p>
        <p class="why-plot">${escapeHTML(movie.description)}</p>
      </div>
    </div>

    <div class="why-section">
      <h3 class="why-section-title">Why CineMatch Recommends This Movie</h3>
      <div class="why-reasons-list">
        ${reasons.map(r => `
          <div class="why-reason-item">
            <span class="check-icon">✓</span>
            <div>${r}</div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="why-section">
      <h3 class="why-section-title">Recommendation Scoring Breakdown</h3>
      <p class="why-section-desc">Multi-factor formula: Mood (40%) + Genre (25%) + Rating (15%) + Runtime (10%) + Attributes (10%)</p>
      
      <div class="score-bars-container">
        <div class="score-bar-row">
          <div class="score-bar-labels">
            <span>Mood / Vibe Match (40%)</span>
            <span>${scoreResult.breakdown.mood.points} / ${scoreResult.breakdown.mood.max} pts</span>
          </div>
          <div class="score-bar-track">
            <div class="score-bar-fill mood" style="width: ${(scoreResult.breakdown.mood.points / scoreResult.breakdown.mood.max) * 100}%"></div>
          </div>
        </div>

        <div class="score-bar-row">
          <div class="score-bar-labels">
            <span>Genre Match (25%)</span>
            <span>${scoreResult.breakdown.genre.points} / ${scoreResult.breakdown.genre.max} pts</span>
          </div>
          <div class="score-bar-track">
            <div class="score-bar-fill genre" style="width: ${(scoreResult.breakdown.genre.points / scoreResult.breakdown.genre.max) * 100}%"></div>
          </div>
        </div>

        <div class="score-bar-row">
          <div class="score-bar-labels">
            <span>Rating Quality (15%)</span>
            <span>${scoreResult.breakdown.rating.points} / ${scoreResult.breakdown.rating.max} pts</span>
          </div>
          <div class="score-bar-track">
            <div class="score-bar-fill rating" style="width: ${(scoreResult.breakdown.rating.points / scoreResult.breakdown.rating.max) * 100}%"></div>
          </div>
        </div>

        <div class="score-bar-row">
          <div class="score-bar-labels">
            <span>Runtime Window (10%)</span>
            <span>${scoreResult.breakdown.runtime.points} / ${scoreResult.breakdown.runtime.max} pts</span>
          </div>
          <div class="score-bar-track">
            <div class="score-bar-fill runtime" style="width: ${(scoreResult.breakdown.runtime.points / scoreResult.breakdown.runtime.max) * 100}%"></div>
          </div>
        </div>

        <div class="score-bar-row">
          <div class="score-bar-labels">
            <span>Attributes & Acclaim (10%)</span>
            <span>${scoreResult.breakdown.attributes.points} / ${scoreResult.breakdown.attributes.max} pts</span>
          </div>
          <div class="score-bar-track">
            <div class="score-bar-fill attr" style="width: ${(scoreResult.breakdown.attributes.points / scoreResult.breakdown.attributes.max) * 100}%"></div>
          </div>
        </div>
      </div>
    </div>

    <div class="why-credits-row">
      <div><strong>Director:</strong> ${escapeHTML(movie.director || 'Visionary Director')}</div>
      <div><strong>Cast:</strong> ${escapeHTML((movie.cast || []).join(', ') || 'Ensemble Cast')}</div>
    </div>

    <div class="movie-facts-grid" aria-label="Movie information">
      <div class="movie-fact">
        <span class="movie-fact-label">Production budget</span>
        <strong>${formatCurrency(movie.budget)}</strong>
      </div>
      <div class="movie-fact">
        <span class="movie-fact-label">Worldwide box office</span>
        <strong>${formatCurrency(movie.revenue)}</strong>
      </div>
      <div class="movie-fact movie-fact-ott">
        <span class="movie-fact-label">OTT availability</span>
        <div class="ott-provider-list">${renderOttProviders(movie)}</div>
        ${movie.ottLink ? `<a class="ott-link" href="${escapeHTML(movie.ottLink)}" target="_blank" rel="noopener">See where to watch ↗</a>` : ''}
      </div>
    </div>

    <div class="why-modal-footer">
      <div id="trailer-embed-container"></div>
      <div class="why-footer-btns">
        <button class="btn btn-secondary" id="fetch-trailer-btn">🎬 Watch Live Trailer</button>
        <button class="btn btn-primary watchlist-toggle-modal-btn" id="modal-watchlist-toggle">
          ${isInWatchlist(movie.id) ? '✓ In Watchlist' : '+ Add to Watchlist'}
        </button>
        <button class="btn btn-outline favorite-toggle-modal-btn ${isFavorite(movie.id) ? 'is-favorite' : ''}" id="modal-favorite-toggle" aria-pressed="${isFavorite(movie.id)}">
          ${isFavorite(movie.id) ? '♥ Favorited' : '♡ Add to Favorites'}
        </button>
      </div>
    </div>
  `;

  // Modal Watchlist Toggle Button
  document.getElementById('modal-watchlist-toggle')?.addEventListener('click', () => {
    addToWatchlist(movie);
    const btn = document.getElementById('modal-watchlist-toggle');
    if (btn) btn.textContent = isInWatchlist(movie.id) ? '✓ In Watchlist' : '+ Add to Watchlist';
  });

  document.getElementById('modal-favorite-toggle')?.addEventListener('click', () => {
    toggleFavorite(movie);
  });

  // Trailer Fetch Button
  document.getElementById('fetch-trailer-btn')?.addEventListener('click', async () => {
    await fetchAndDisplayTrailer(movie);
  });

  if (autoStartTrailer) await fetchAndDisplayTrailer(movie);
}

function closeWhyModal() {
  const modal = document.getElementById('why-modal');
  if (modal) {
    modal.classList.remove('active');
    document.body.classList.remove('modal-open');
    const trailerContainer = document.getElementById('trailer-embed-container');
    if (trailerContainer) trailerContainer.innerHTML = '';
  }
}

/**
 * Fetches and embeds official video trailer
 */
async function fetchAndDisplayTrailer(movie) {
  const container = document.getElementById('trailer-embed-container');
  const btn = document.getElementById('fetch-trailer-btn');
  if (!container || !btn) return;

  btn.innerHTML = `<span class="spinner-sm"></span> Finding Trailer...`;
  btn.setAttribute('disabled', 'true');

  try {
    let rawMovieId = movie.tmdbId;

    if (!rawMovieId) {
      const searchUrl = `${TMDB_CONFIG.BASE_URL}/search/movie?api_key=${TMDB_CONFIG.API_KEY}&query=${encodeURIComponent(movie.title)}&year=${movie.year}`;
      const sRes = await fetch(searchUrl);
      if (sRes.ok) {
        const sData = await sRes.json();
        if (sData.results && sData.results.length > 0) {
          rawMovieId = sData.results[0].id;
        }
      }
    }

    if (rawMovieId) {
      const videoUrl = `${TMDB_CONFIG.BASE_URL}/movie/${rawMovieId}/videos?api_key=${TMDB_CONFIG.API_KEY}`;
      const vRes = await fetch(videoUrl);
      if (vRes.ok) {
        const vData = await vRes.json();
        const youtubeTrailer = (vData.results || []).find(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'));

        if (youtubeTrailer) {
          container.innerHTML = `
            <div class="video-responsive">
              <iframe 
                src="https://www.youtube-nocookie.com/embed/${youtubeTrailer.key}?autoplay=1" 
                title="${escapeHTML(movie.title)} Official Trailer" 
                frameborder="0" 
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                allowfullscreen>
              </iframe>
            </div>
          `;
          btn.style.display = 'none';
          return;
        }
      }
    }

    // Fallback: Link to search
    container.innerHTML = `
      <div class="trailer-fallback">
        <p>Direct video stream preview not found.</p>
        <a href="https://www.youtube.com/results?search_query=${encodeURIComponent(movie.title + ' official trailer ' + movie.year)}" target="_blank" rel="noopener" class="btn btn-outline">
          Open "${escapeHTML(movie.title)}" Trailer on YouTube ↗
        </a>
      </div>
    `;
    btn.style.display = 'none';
  } catch (err) {
    console.error('Trailer lookup error:', err);
    container.innerHTML = `<p class="text-muted">Trailer preview currently unavailable.</p>`;
    btn.removeAttribute('disabled');
    btn.textContent = '🎬 Try Again';
  }
}

/* ==========================================================================
   9. UI RENDERING & COMPONENT BUILDERS
   ========================================================================== */

function displayMovies(movies, relaxedFilters = false) {
  const gridContainer = document.getElementById('movies-grid');
  const countBadge = document.getElementById('results-count');
  const relaxedAlert = document.getElementById('relaxed-filters-alert');

  if (countBadge) {
    countBadge.textContent = `${movies.length} Movie${movies.length === 1 ? '' : 's'}`;
  }

  if (relaxedAlert) {
    if (relaxedFilters) {
      relaxedAlert.innerHTML = `
        <div class="alert-box">
          <span class="alert-icon">💡</span>
          <div>
            <strong>Smart Filter Relaxation Active:</strong> No exact matches met every strict constraint. We broadened the rating and runtime filters to bring you the closest mood matches!
          </div>
        </div>
      `;
      relaxedAlert.style.display = 'block';
    } else {
      relaxedAlert.style.display = 'none';
    }
  }

  if (!gridContainer) return;

  if (movies.length === 0) {
    gridContainer.innerHTML = `
      <div class="no-results-state">
        <div class="no-results-icon">🔍</div>
        <h3>No Movies Match Your Exact Filters</h3>
        <p>Try clearing or relaxing your runtime, genre, or rating constraints to discover more titles.</p>
        <div class="no-results-actions">
          <button class="btn btn-primary" onclick="clearFilters()">Reset All Filters</button>
          <button class="btn btn-secondary" onclick="openQuizModal()">Take Mood Quiz Instead</button>
        </div>
      </div>
    `;
    return;
  }

  gridContainer.innerHTML = movies.map(movie => {
    const isSaved = isInWatchlist(movie.id);
    const scoreColorClass = movie.matchScore >= 85 ? 'high' : movie.matchScore >= 70 ? 'medium' : 'normal';

    return `
      <article class="movie-card" data-id="${movie.id}">
        <div class="card-poster-wrapper">
          <img 
            src="${escapeHTML(movie.poster)}" 
            alt="${escapeHTML(movie.title)} Poster" 
            class="card-poster"
            loading="lazy"
            onerror="this.onerror=null; this.src=generateSVGFallbackPoster('${escapeHTML(movie.title)}', '${escapeHTML(movie.genre)}', ${movie.year});"
          />
          <div class="card-match-badge ${scoreColorClass}">
            <span class="match-score">${movie.matchScore}%</span>
            <span class="match-label">Match</span>
          </div>
          <button 
            class="watchlist-btn ${isSaved ? 'in-watchlist' : ''}" 
            data-movie-id="${movie.id}"
            title="${isSaved ? 'Remove from Watchlist' : 'Add to Watchlist'}"
            aria-label="${isSaved ? 'Remove from Watchlist' : 'Add to Watchlist'}"
          >
            <span class="icon">${isSaved ? '✓' : '+'}</span> ${isSaved ? 'Saved' : 'Watchlist'}
          </button>
          <button class="favorite-btn ${isFavorite(movie.id) ? 'is-favorite' : ''}" data-movie-id="${movie.id}" title="${isFavorite(movie.id) ? 'Remove from Favorites' : 'Add to Favorites'}" aria-label="${isFavorite(movie.id) ? 'Remove from Favorites' : 'Add to Favorites'}" aria-pressed="${isFavorite(movie.id)}">
            <span aria-hidden="true">${isFavorite(movie.id) ? '♥' : '♡'}</span> ${isFavorite(movie.id) ? 'Favorited' : 'Favorite'}
          </button>
        </div>

        <div class="card-body">
          <div class="card-meta-top">
            <span class="card-rating">★ ${movie.rating}</span>
            <span class="card-runtime">⏱️ ${movie.runtime}m</span>
            <span class="card-year">${movie.year}</span>
          </div>

          <h3 class="card-title" title="${escapeHTML(movie.title)}">${escapeHTML(movie.title)}</h3>
          
          <div class="card-tags">
            <span class="genre-tag">${escapeHTML(movie.genre)}</span>
            ${(movie.moods || []).slice(0, 2).map(m => `<span class="mood-tag">${escapeHTML(m)}</span>`).join('')}
          </div>

          <p class="card-description">${escapeHTML(movie.description)}</p>

          <div class="card-footer">
            <button class="btn btn-outline trailer-movie-btn" data-movie-id="${movie.id}">
              ▶ Trailer
            </button>
            <button class="btn btn-outline why-movie-btn" data-movie-id="${movie.id}">
              ⓘ Info
            </button>
          </div>
        </div>
      </article>
    `;
  }).join('');

  // Attach button event listeners
  gridContainer.querySelectorAll('.why-movie-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-movie-id');
      openWhyModal(id);
    });
  });

  gridContainer.querySelectorAll('.trailer-movie-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openWhyModal(btn.getAttribute('data-movie-id'), true);
    });
  });

  gridContainer.querySelectorAll('.watchlist-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-movie-id');
      const movie = state.allMovies.find(m => m.id === id);
      if (movie) addToWatchlist(movie);
    });
  });

  gridContainer.querySelectorAll('.favorite-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const movie = state.allMovies.find(item => item.id === btn.getAttribute('data-movie-id'));
      if (movie) toggleFavorite(movie);
    });
  });
}

function renderFilterControls() {
  // 1. Mood Filter Pills
  const moodContainer = document.getElementById('mood-pills-container');
  if (moodContainer) {
    moodContainer.innerHTML = `
      <button class="mood-pill active" data-mood="all">
        <span class="mood-icon">🎬</span>
        <span class="mood-name">All Moods</span>
      </button>
      ${FILTER_OPTIONS.moods.map(m => `
        <button class="mood-pill" data-mood="${m.id}" title="${m.desc}">
          <span class="mood-icon">${m.icon}</span>
          <span class="mood-name">${m.label}</span>
        </button>
      `).join('')}
    `;

    moodContainer.querySelectorAll('.mood-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        moodContainer.querySelectorAll('.mood-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        state.preferences.mood = pill.getAttribute('data-mood');
        applyFiltersAndRecommend(false);
      });
    });
  }

  // 2. Genre Dropdown
  const genreSelect = document.getElementById('filter-genre');
  if (genreSelect) {
    genreSelect.innerHTML = `
      <option value="all">All Genres</option>
      ${FILTER_OPTIONS.genres.map(g => `<option value="${g}">${g}</option>`).join('')}
    `;
    genreSelect.addEventListener('change', (e) => {
      state.preferences.genre = e.target.value;
      fetchLiveCatalog();
    });
  }

  // 3. Rating Dropdown
  const ratingSelect = document.getElementById('filter-rating');
  if (ratingSelect) {
    ratingSelect.innerHTML = FILTER_OPTIONS.ratings.map(r => `
      <option value="${r.value}">${r.label}</option>
    `).join('');
    ratingSelect.addEventListener('change', (e) => {
      state.preferences.minRating = parseFloat(e.target.value);
      fetchLiveCatalog();
    });
  }

  // 4. Runtime Dropdown
  const runtimeSelect = document.getElementById('filter-runtime');
  if (runtimeSelect) {
    runtimeSelect.innerHTML = FILTER_OPTIONS.runtimes.map(rt => `
      <option value="${rt.value}">${rt.label}</option>
    `).join('');
    runtimeSelect.addEventListener('change', (e) => {
      state.preferences.maxRuntime = parseInt(e.target.value, 10);
      fetchLiveCatalog();
    });
  }

  // 5. Sort Selector
  const sortSelect = document.getElementById('filter-sort');
  if (sortSelect) {
    sortSelect.innerHTML = FILTER_OPTIONS.sorts.map(s => `
      <option value="${s.value}">${s.label}</option>
    `).join('');
    sortSelect.addEventListener('change', (e) => {
      state.preferences.sortBy = e.target.value;
      applyFiltersAndRecommend(false);
    });
  }
}

function syncUIControlsWithPreferences() {
  const pills = document.querySelectorAll('.mood-pill');
  pills.forEach(pill => {
    if (pill.getAttribute('data-mood') === state.preferences.mood) {
      pill.classList.add('active');
    } else {
      pill.classList.remove('active');
    }
  });

  const genreSelect = document.getElementById('filter-genre');
  if (genreSelect) genreSelect.value = state.preferences.genre || 'all';

  const ratingSelect = document.getElementById('filter-rating');
  if (ratingSelect) ratingSelect.value = String(state.preferences.minRating || 0);

  const runtimeSelect = document.getElementById('filter-runtime');
  if (runtimeSelect) runtimeSelect.value = String(state.preferences.maxRuntime || 0);

  const sortSelect = document.getElementById('filter-sort');
  if (sortSelect) sortSelect.value = state.preferences.sortBy || 'relevance';
}

function clearFilters() {
  state.preferences = {
    mood: 'all',
    genre: 'all',
    minRating: 0,
    maxRuntime: 0,
    searchQuery: '',
    sortBy: 'relevance'
  };

  const nlpInput = document.getElementById('nlp-input');
  if (nlpInput) nlpInput.value = '';

  const searchInput = document.getElementById('title-search-input');
  if (searchInput) searchInput.value = '';

  const nlpBanner = document.getElementById('nlp-detected-banner');
  if (nlpBanner) nlpBanner.classList.remove('visible');

  syncUIControlsWithPreferences();
  fetchLiveCatalog();
  showToast('Filters reset to default', 'info');
}

function surpriseMe() {
  if (state.allMovies.length === 0) return;
  const highScorers = state.allMovies.filter(m => m.rating >= 7.8);
  const pool = highScorers.length > 0 ? highScorers : state.allMovies;
  const randomPick = pool[Math.floor(Math.random() * pool.length)];

  openWhyModal(randomPick.id);
  showToast(`Surprise Pick: "${randomPick.title}"!`, 'success');
}

/* Personalization sidebar */
function loadAppearancePreferences() {
  const theme = localStorage.getItem(STORAGE_KEYS.THEME) || 'dark';
  const layout = localStorage.getItem(STORAGE_KEYS.LAYOUT) || 'cinematic';
  applyTheme(theme, false);
  applyLayoutMode(layout, false);
}

function applyTheme(theme, persist = true) {
  const isLight = theme === 'light';
  document.body.classList.toggle('light-theme', isLight);
  document.documentElement.style.colorScheme = isLight ? 'light' : 'dark';
  if (persist) localStorage.setItem(STORAGE_KEYS.THEME, isLight ? 'light' : 'dark');
  const toggle = document.getElementById('theme-toggle-btn');
  if (toggle) {
    toggle.setAttribute('aria-pressed', String(isLight));
    toggle.querySelector('.theme-toggle-icon').textContent = isLight ? '🌙' : '☀️';
    toggle.querySelector('span:last-child').textContent = isLight ? 'Switch to Dark Mode' : 'Switch to Light Mode';
  }
}

function applyLayoutMode(mode, persist = true) {
  const modes = ['cinematic', 'glitch', 'animated', 'retro', 'depth3d', 'hyper4d', 'toon'];
  const activeMode = modes.includes(mode) ? mode : 'cinematic';
  modes.forEach(name => document.body.classList.remove(`layout-${name}`));
  document.body.classList.add(`layout-${activeMode}`);
  renderThemeArtwork(activeMode);
  if (persist) localStorage.setItem(STORAGE_KEYS.LAYOUT, activeMode);
  const select = document.getElementById('layout-mode-select');
  if (select) select.value = activeMode;
}

function renderThemeArtwork(mode) {
  const layer = document.getElementById('theme-art-layer');
  if (!layer) return;
  const artwork = {
    depth3d: `
      <div class="depth-cube depth-cube-one"><i></i><i></i><i></i></div>
      <div class="depth-cube depth-cube-two"><i></i><i></i><i></i></div>
      <div class="depth-ticket">NOW<br>SHOWING</div>`,
    hyper4d: `
      <div class="hyper-rings"><i></i><i></i><i></i><i></i></div>
      <div class="hyper-comet hyper-comet-one"></div><div class="hyper-comet hyper-comet-two"></div>`,
    toon: `
      <div class="toon-cloud toon-cloud-one"></div><div class="toon-cloud toon-cloud-two"></div>
      <div class="toon-mascot toon-robot" title="Original movie-loving robot"><b></b><i></i><em></em></div>
      <div class="toon-mascot toon-cat" title="Original mischievous cat"><b></b><i></i><em></em></div>
      <div class="toon-mascot toon-star" title="Original shooting star">★</div>
      <div class="toon-burst toon-burst-one">POW!</div><div class="toon-burst toon-burst-two">WOW!</div>`
  };
  layer.innerHTML = artwork[mode] || '';
}

function openSidebar() {
  const sidebar = document.getElementById('app-sidebar');
  const scrim = document.getElementById('sidebar-scrim');
  if (!sidebar || !scrim) return;
  sidebar.classList.add('open');
  sidebar.setAttribute('aria-hidden', 'false');
  scrim.classList.add('visible');
  document.getElementById('menu-trigger-btn')?.setAttribute('aria-expanded', 'true');
  document.body.classList.add('sidebar-open');
  document.getElementById('sidebar-close-btn')?.focus();
}

function closeSidebar() {
  const sidebar = document.getElementById('app-sidebar');
  if (!sidebar?.classList.contains('open')) return;
  sidebar.classList.remove('open');
  sidebar.setAttribute('aria-hidden', 'true');
  document.getElementById('sidebar-scrim')?.classList.remove('visible');
  document.getElementById('menu-trigger-btn')?.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('sidebar-open');
}

/* ==========================================================================
   10. EVENT LISTENERS & NAVIGATION
   ========================================================================== */

function setupEventListeners() {
  // Personalization sidebar
  document.getElementById('menu-trigger-btn')?.addEventListener('click', openSidebar);
  document.getElementById('sidebar-close-btn')?.addEventListener('click', closeSidebar);
  document.getElementById('sidebar-scrim')?.addEventListener('click', closeSidebar);
  document.getElementById('sidebar-watchlist-btn')?.addEventListener('click', () => {
    closeSidebar();
    openWatchlistModal();
  });
  document.getElementById('sidebar-favorites-btn')?.addEventListener('click', openFavoritesModal);
  document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
    applyTheme(document.body.classList.contains('light-theme') ? 'dark' : 'light');
  });
  document.getElementById('layout-mode-select')?.addEventListener('change', (event) => {
    applyLayoutMode(event.target.value);
  });

  // 1. Natural Language Search Form
  const nlpForm = document.getElementById('nlp-search-form');
  const nlpInput = document.getElementById('nlp-input');
  if (nlpForm && nlpInput) {
    nlpForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = nlpInput.value.trim();
      if (val) handleNaturalLanguageSearch(val);
    });
  }

  // Suggestion Chips
  document.querySelectorAll('.nlp-suggestion-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const query = chip.getAttribute('data-query');
      if (nlpInput) nlpInput.value = query;
      handleNaturalLanguageSearch(query);
    });
  });

  // 2. Title Live Search Input with 350ms debounce
  const titleSearchInput = document.getElementById('title-search-input');
  if (titleSearchInput) {
    titleSearchInput.addEventListener('input', (e) => {
      clearTimeout(state.searchDebounceTimer);
      state.searchDebounceTimer = setTimeout(() => {
        state.preferences.searchQuery = e.target.value.trim();
        fetchLiveCatalog();
      }, 350);
    });
  }

  // 3. Clear Filters Button
  document.getElementById('btn-clear-filters')?.addEventListener('click', clearFilters);

  // 4. Recommend Movies Button
  document.getElementById('btn-recommend-now')?.addEventListener('click', () => {
    fetchLiveCatalog();
    scrollToResults();
  });

  // 5. Hero Action Buttons
  document.getElementById('hero-discover-btn')?.addEventListener('click', scrollToResults);
  document.getElementById('hero-quiz-btn')?.addEventListener('click', openQuizModal);
  document.getElementById('hero-surprise-btn')?.addEventListener('click', surpriseMe);

  // 6. Navigation Links
  document.getElementById('nav-home-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  document.getElementById('nav-discover-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    scrollToResults();
  });

  document.getElementById('nav-quiz-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    openQuizModal();
  });

  document.getElementById('nav-watchlist-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    openWatchlistModal();
  });

  // 7. Modal Close Handlers
  document.getElementById('quiz-modal-close')?.addEventListener('click', closeQuizModal);
  document.getElementById('why-modal-close')?.addEventListener('click', closeWhyModal);
  document.getElementById('watchlist-modal-close')?.addEventListener('click', closeWatchlistModal);
  document.getElementById('favorites-modal-close')?.addEventListener('click', closeFavoritesModal);

  ['quiz-modal', 'why-modal', 'watchlist-modal', 'favorites-modal'].forEach(modalId => {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          if (modalId === 'quiz-modal') closeQuizModal();
          else if (modalId === 'why-modal') closeWhyModal();
          else if (modalId === 'watchlist-modal') closeWatchlistModal();
          else if (modalId === 'favorites-modal') closeFavoritesModal();
        }
      });
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSidebar();
      closeQuizModal();
      closeWhyModal();
      closeWatchlistModal();
      closeFavoritesModal();
    }
  });
}

/* ==========================================================================
   11. HELPER UTILITIES
   ========================================================================== */

function scrollToResults() {
  const section = document.getElementById('discovery-section');
  if (section) {
    section.scrollIntoView({ behavior: 'smooth' });
  }
}

function escapeHTML(str) {
  if (typeof str !== 'string') return String(str || '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(message, type = 'info') {
  let toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  toast.className = `toast-message toast-${type}`;
  
  const icon = type === 'success' ? '✓' : type === 'warning' ? '⚠️' : 'ℹ️';
  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-text">${escapeHTML(message)}</span>
  `;

  toastContainer.appendChild(toast);

  setTimeout(() => toast.classList.add('visible'), 20);

  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 400);
  }, 3200);
}

// Start application on DOM Ready
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', initApp);
}

// Export for Unit Testing in Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    WEIGHTS,
    calculateMatchScore,
    calculateMoodScore,
    calculateGenreScore,
    calculateRatingScore,
    calculateRuntimeScore,
    calculateAttributeScore,
    generateReasons,
    parseNaturalLanguage,
    filterMovies,
    sortMovies
  };
}
