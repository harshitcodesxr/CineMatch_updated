const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const databasePath = path.join(__dirname, 'data', 'cinematch.db');
fs.mkdirSync(path.dirname(databasePath), { recursive: true });

// SQLite gives the watchlist real server-side persistence instead of keeping it
// only in one browser's localStorage.
const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS watchlist (
    movie_id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    added_at TEXT NOT NULL
  );
`);
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function sendJson(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1_000_000) reject(new Error('Request body is too large'));
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch { reject(new Error('Invalid JSON request body')); }
    });
    req.on('error', reject);
  });
}

async function handleWatchlistApi(req, res, pathname) {
  if (pathname === '/api/watchlist' && req.method === 'GET') {
    const rows = database.prepare('SELECT payload FROM watchlist ORDER BY added_at DESC').all();
    return sendJson(res, 200, rows.map(row => JSON.parse(row.payload)));
  }

  if (pathname === '/api/watchlist' && req.method === 'POST') {
    try {
      const movie = await readJson(req);
      if (!movie.id || !movie.title) return sendJson(res, 400, { error: 'Movie id and title are required.' });
      const savedMovie = { ...movie, addedAt: movie.addedAt || new Date().toISOString() };
      database.prepare(`
        INSERT INTO watchlist (movie_id, payload, added_at) VALUES (?, ?, ?)
        ON CONFLICT(movie_id) DO UPDATE SET payload = excluded.payload, added_at = excluded.added_at
      `).run(savedMovie.id, JSON.stringify(savedMovie), savedMovie.addedAt);
      return sendJson(res, 201, savedMovie);
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  if (pathname === '/api/watchlist' && req.method === 'DELETE') {
    database.prepare('DELETE FROM watchlist').run();
    return sendJson(res, 200, { success: true });
  }

  if (pathname.startsWith('/api/watchlist/') && req.method === 'DELETE') {
    const movieId = decodeURIComponent(pathname.slice('/api/watchlist/'.length));
    database.prepare('DELETE FROM watchlist WHERE movie_id = ?').run(movieId);
    return sendJson(res, 200, { success: true });
  }

  return sendJson(res, 404, { error: 'API route not found.' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  if (pathname.startsWith('/api/')) return handleWatchlistApi(req, res, pathname);

  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.resolve(__dirname, relativePath);
  if (!filePath.startsWith(path.resolve(__dirname) + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Forbidden');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`CineMatch server running at http://localhost:${PORT}/`);
  console.log(`Watchlist database: ${databasePath}`);
});
