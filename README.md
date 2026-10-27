# CineMatch - Movie Recommendation Tool 🎬🍿
> **B.Tech Semester III Computer Science & Engineering Project**  
> Pure Browser-Based Client-Side System • Zero Backend Dependencies • Explainable Multi-Factor Weighted Scoring • TMDB API Integration

---

## 1. Project Overview & Problem Statement

In modern streaming platforms, users are routinely confronted with thousands of titles, leading to severe **choice overload** and decision fatigue. Traditional recommender systems depend heavily on long-term viewing histories or collaborative filtering matrix factorization, which fail when a user wants a specific film matching their **current emotional headspace, available time window, and vibe right now**.

**CineMatch** solves this problem by delivering instant, explainable, and multi-dimensional movie recommendations based on:
1. **Mood / Emotional Vibe** (e.g., Mind-Bending, Adrenaline, Cozy, Dark & Gritty, Feel-Good, Romantic)
2. **Genre Preferences** (Action, Sci-Fi, Mystery, Comedy, Drama, Animation, etc.)
3. **Available Time Budget** (Under 90 min, 90–120 min, 120–150 min, or Any)
4. **Quality Threshold** (Minimum ratings: 6.0+, 7.0+, 8.0+, 8.5+)
5. **Natural-Language Desires** (Keyword & semantic regex matching)

Every recommendation includes a **transparent match percentage (0–100%)** and an **honest, dynamic explanation** of why the title was selected.

---

## 2. Technology Stack

As specified for this Semester III Computer Science project, CineMatch is built exclusively with vanilla web standards without external libraries, front-end frameworks, or databases:

| Component | Technology | Rationale / Purpose |
| :--- | :--- | :--- |
| **Structure** | **HTML5** | Semantic tags (`<header>`, `<nav>`, `<main>`, `<article>`, `<section>`, `<dialog>`) for accessibility |
| **Styling** | **CSS3** | Modern dark cinematic theme, CSS custom properties (variables), Grid, Flexbox, Glassmorphism, animations |
| **Logic & Engine** | **Vanilla JavaScript (ES6+)** | Modular functional architecture, weighted scoring pipeline, NLP parser, DOM manipulation |
| **Persistence** | **SQLite + Node.js HTTP API** | Server-side database for watchlist items, with `localStorage` as an offline fallback |
| **Data Layer** | **Curated Dataset + TMDB API v3** | 55 curated offline classics + live streaming from The Movie Database API (`686addb02f6f1a62adb87c65c61523e8`) |
| **Offline Resilience** | **Client-Side SVG Generator** | Dynamically synthesizes vector movie posters if offline or if images fail to load |

> [!NOTE]
> **Implementation Notes**:
> - NO React, Angular, or Vue
> - NO Bootstrap or Tailwind CSS
> - A lightweight Node.js server is included for the SQLite watchlist database
> - No external database service or package installation is required (Node.js 22+)
> - NO opaque black-box Machine Learning models

---

## 3. Project Directory Structure

```
CineMatch/
│
├── index.html          # Semantic HTML5 single-page application structure
├── style.css           # Cinematic dark theme, responsive grid & component styles
├── script.js          # Core recommendation engine, NLP parser, quiz & state manager
├── data.js             # 55 Curated offline movies, TMDB config, classifier & quiz data
├── server.js            # Static server + Watchlist REST API
├── data/cinematch.db    # SQLite watchlist database (created automatically on first run)
├── README.md           # Comprehensive project documentation & viva voce guide
└── assets/             # Media and icon assets
    ├── images/
    └── icons/
```

---

## 4. System Architecture & Pipeline

```
  ┌────────────────────────────────────────────────────────┐
  │                   User Input Channels                  │
  │  • Filter Bar  • Natural Language Search  • Mood Quiz  │
  └───────────────────────────┬────────────────────────────┘
                              │
                              ▼
  ┌────────────────────────────────────────────────────────┐
  │         Phase 1: Input Normalization & Parsing         │
  │   Extracts Mood, Genre, Max Runtime, and Min Rating    │
  └───────────────────────────┬────────────────────────────┘
                              │
                              ▼
  ┌────────────────────────────────────────────────────────┐
  │        Phase 2: Hard Constraint Filter & Relaxer       │
  │   Filters dataset by Genre, Rating, and Runtime        │
  │   (Smart relaxation prevents zero-result dead ends)    │
  └───────────────────────────┬────────────────────────────┘
                              │
                              ▼
  ┌────────────────────────────────────────────────────────┐
  │         Phase 3: Multi-Factor Weighted Scoring         │
  │                                                        │
  │   Total Score = (Mood × 40%) + (Genre × 25%)           │
  │               + (Rating × 15%) + (Runtime × 10%)       │
  │               + (Attributes × 10%)                     │
  └───────────────────────────┬────────────────────────────┘
                              │
                              ▼
  ┌────────────────────────────────────────────────────────┐
  │            Phase 4: Sorter & Ranking Engine            │
  │  Ranks movies by CineMatch Score, Rating, or Runtime   │
  └───────────────────────────┬────────────────────────────┘
                              │
                              ▼
  ┌────────────────────────────────────────────────────────┐
  │             Phase 5: Explainable UI Render             │
  │   • Match Score Badges (e.g. 96% Match)                │
  │   • "Why this movie?" Modal with Score Breakdown Bars  │
  │   • Dynamic Bulleted Reasons (No canned text)          │
  │   • LocalStorage Watchlist CRUD + Binge Statistics     │
  └────────────────────────────────────────────────────────┘
```

---

## 5. Mathematical Recommendation Algorithm

Rather than relying on opaque machine learning embeddings, CineMatch uses a **deterministic, explainable multi-attribute weighted utility model**.

### Mathematical Formulation:

$$\text{MatchScore}(m, P) = \min\Big(99, \max\big(30, \sum_{i \in \text{Factors}} w_i \cdot f_i(m, P)\big)\Big)$$

Where:
- $m$: Movie candidate
- $P$: Active user preferences $\{ \text{mood}, \text{genre}, \text{minRating}, \text{maxRuntime}, \text{query} \}$
- $w_i$: Factor weights defined in JavaScript:

$$\text{Weights} = \{ w_{\text{mood}}: 40\%, w_{\text{genre}}: 25\%, w_{\text{rating}}: 15\%, w_{\text{runtime}}: 10\%, w_{\text{attributes}}: 10\% \}$$

### Factor Scoring Functions:

1. **Mood Factor $f_{\text{mood}}(m, P)$ [Weight: 40%]**:
   - $1.0$ if target mood is in $m.\text{moods}$
   - $0.95$ if target mood matches tagline in $m.\text{vibe}$
   - $0.65$ if complementary synergistic mood (e.g., *Mind-Bending* $\leftrightarrow$ *Dark & Gritty*)
   - $0.25$ otherwise ($0.85$ neutral baseline if no mood selected)

2. **Genre Factor $f_{\text{genre}}(m, P)$ [Weight: 25%]**:
   - $1.0$ if primary genre matches
   - $0.85$ if secondary genre in $m.\text{genres}$ matches
   - $0.15$ otherwise ($0.85$ baseline if "All Genres" selected)

3. **Rating Factor $f_{\text{rating}}(m, P)$ [Weight: 15%]**:
   - If $m.\text{rating} \ge P.\text{minRating}$: $\min(1.0, 0.85 + (m.\text{rating} - P.\text{minRating}) \times 0.1)$
   - If $m.\text{rating} < P.\text{minRating}$: $\max(0.1, 0.7 - (P.\text{minRating} - m.\text{rating}) \times 0.25)$

4. **Runtime Factor $f_{\text{runtime}}(m, P)$ [Weight: 10%]**:
   - $1.0$ if $m.\text{runtime} \le P.\text{maxRuntime}$
   - $\max(0.2, 1.0 - \frac{m.\text{runtime} - P.\text{maxRuntime}}{60})$ if overtime

5. **Attribute & Acclaim Factor $f_{\text{attr}}(m, P)$ [Weight: 10%]**:
   - Popularity bonus: $\frac{m.\text{popularity}}{100} \times 0.25$
   - Critical acclaim / featured classic bonus: $+0.15$
   - Search query keyword match in tags or synopsis: $+0.15$

---

## 6. TMDB API Integration & Dual Mode Architecture

CineMatch integrates live with **The Movie Database (TMDB) REST API v3**:
- **API Key**: `686addb02f6f1a62adb87c65c61523e8`
- **Base Endpoint**: `https://api.themoviedb.org/3`
- **Image CDN**: `https://image.tmdb.org/t/p/w500`

### Dual-Layer Resilience:
1. **Curated Library (Default / Offline Safe)**: 55 carefully selected cinematic gems annotated with rich mood metadata, directors, cast, and custom tags. Works with zero internet access.
2. **TMDB Live Stream Mode**: Real-time trending and top-rated movies fetched via `fetch()`. TMDB movies are processed through the `classifyTMDBMovieToMoods()` rule engine to map TMDB genre IDs and synopsis keywords into CineMatch's 11 mood archetypes.
3. **Live Trailers**: Clicking "Watch Live Trailer" in the "Why this movie?" modal queries TMDB's `/movie/{id}/videos` endpoint to embed the official YouTube trailer on demand.

---

## 7. Natural-Language Query Parsing (Rule-Based Heuristic)

Instead of sending user text to costly server-side LLMs, CineMatch demonstrates how client-side regular expressions and keyword taxonomies extract structured criteria:

| Example Query | Extracted Mood | Extracted Genre | Extracted Runtime | Extracted Rating |
| :--- | :--- | :--- | :--- | :--- |
| `"I want a dark thriller under 2 hours"` | `Dark & Gritty` | `Thriller` | `120 min` | Default |
| `"Give me a mind-bending sci-fi movie with a high rating"` | `Mind-Bending` | `Sci-Fi` | Any | `8.0+` |
| `"Looking for a cozy animated movie under 90 minutes"` | `Cozy` | `Animation` | `90 min` | Default |
| `"A funny feel-good masterpiece"` | `Funny` | All | Any | `8.5+` |

The UI displays a **"CineMatch Parsed"** chip bar showing the user exactly which parameters were detected and applied.

---

## 8. Interactive 4-Step Mood Quiz

The CineMatch Quiz guides indecisive users through a clean 4-step wizard:
1. **Step 1 (Headspace)**: Selects mood archetype (Mind-Bending, Adrenaline, Cozy, Dark & Gritty, Feel-Good, Emotional, Funny).
2. **Step 2 (Time Budget)**: Under 90m, 90–120m, 120–150m, or Any Runtime.
3. **Step 3 (Atmosphere)**: Sci-Fi, Action, Mystery, Comedy, Animation, Romance, Drama, or Surprise Me.
4. **Step 4 (Quality Standard)**: Masterpieces Only (8.0+), Great Cinema (7.5+), Solid & Entertaining (6.5+), or No Preference.

Results immediately run through the recommendation engine and highlight the best matches.

---

## 9. Watchlist Database, Details & Analytics

- **SQLite CRUD Operations**: Add, remove and clear watchlist items using `/api/watchlist` endpoints. The database file is created automatically when the server starts.
- **Offline Safety Net**: The browser keeps a local backup only if the database server cannot be reached.
- **No Duplicates**: Checks movie IDs prior to insertion.
- **Binge-Time Analytics**: Automatically aggregates and displays:
  - Total number of saved films
  - Cumulative watch time (e.g., *7h 45m*)
  - Average IMDb rating of saved selections
- **Movie Details**: The Info action loads official TMDB metadata: director, cast, production budget, worldwide box office, regional OTT availability, and a trailer player.

---

## 10. How to Run the Project

No compilation, Node package installations, or servers are needed.

1. Install Node.js 22 or newer.
2. Open a terminal in the `CineMatch` folder and run `node server.js`.
3. Open [http://localhost:3000](http://localhost:3000) in a browser.

The server automatically creates `data/cinematch.db`; no `npm install` or MongoDB setup is needed.

---

## 11. B.Tech Viva-Voce Questions & Answers Guide

### Q1: Why use a weighted heuristic algorithm instead of Collaborative Filtering?
> **Answer**: Collaborative filtering suffers from the **cold-start problem** (it requires extensive historical user rating matrices) and cannot recommend based on a user's *instant, temporary mood*. Our multi-attribute utility model operates in real time, requires zero user tracking, and produces 100% explainable match breakdowns.

### Q2: How does the system handle conflicting or overly strict filters?
> **Answer**: In `script.js`, the `filterMovies()` function implements **Smart Filter Relaxation**. If a user requests a combination with 0 matches (e.g., Horror with <90m runtime and rating >8.5), CineMatch relaxes the rating and runtime boundaries while preserving the primary genre and mood, ensuring the user is never stranded on an empty screen.

### Q3: How does CineMatch interact with TMDB without a backend server?
> **Answer**: Client-side JavaScript makes asynchronous HTTPS calls via `fetch()` directly to the TMDB v3 API. Responses are normalized on the fly in `data.js` into CineMatch's standard schema, mapping TMDB genre IDs and synopses into our mood taxonomy.

### Q4: How is Watchlist data preserved?
> **Answer**: CineMatch exposes REST endpoints from its Node.js server and persists each watchlist item in an embedded SQLite database. SQLite is a real relational database stored in one portable file, so it needs no separate database service. `localStorage` is retained strictly as an offline backup.

---

## 12. Future Scope

While CineMatch is intentionally designed as an offline-first, client-side academic project, the architecture is modular and future-proofed for:
- User authentication & cross-device cloud sync
- Collaborative filtering with user vectors
- Integration with streaming availability APIs (JustWatch / Watchmode)
- Multi-user "Watch Party" group vibe consensus matching
- Progressive Web App (PWA) offline installation with Service Workers

---

*Developed for B.Tech Semester III Computer Science & Engineering • Academic Project Presentation*
