// ════════════════════════════════════════════
//  Wonder Kids School — Backend API
//  Node.js + Express + SQLite + Multer
//  Free hosting: Render.com
// ════════════════════════════════════════════

// ── package.json (create this file separately) ──
/*
{
  "name": "wonderkids-backend",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "better-sqlite3": "^9.4.3",
    "multer": "^1.4.5-lts.1",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "nodemon": "^3.0.2"
  }
}
*/

require('dotenv').config();
const express = require('express');
const Database = require('better-sqlite3');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

// ── MIDDLEWARE ──
app.use(cors({ origin: '*' })); // In production, restrict to your domain
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── UPLOADS FOLDER ──
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.round(Math.random()*1e6)}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB

// ── DATABASE SETUP ──
const db = new Database('./wonderkids.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    cls TEXT NOT NULL,
    parent TEXT NOT NULL,
    mobile TEXT NOT NULL,
    address TEXT,
    admdate TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS fees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER,
    student TEXT NOT NULL,
    cls TEXT NOT NULL,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    mode TEXT NOT NULL,
    date TEXT NOT NULL,
    remarks TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (student_id) REFERENCES students(id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    type TEXT DEFAULT 'info',
    badge TEXT DEFAULT 'General',
    date TEXT DEFAULT (date('now')),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS gallery (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    url TEXT NOT NULL,
    category TEXT NOT NULL,
    caption TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    filename TEXT NOT NULL,
    url TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS enquiries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    child_name TEXT,
    class TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// ── SEED SAMPLE DATA (only if tables empty) ──
const notifCount = db.prepare('SELECT COUNT(*) as n FROM notifications').get().n;
if (notifCount === 0) {
  const insertNotif = db.prepare('INSERT INTO notifications (title, body, type, badge, date) VALUES (?,?,?,?,?)');
  insertNotif.run('Admissions Open 2025–26', 'Admissions for Playgroup, Nursery, LKG and UKG are now open. Limited seats!', 'new', 'Admissions', '2025-04-20');
  insertNotif.run('Annual Day — May 15, 2025', 'Grand Annual Day on May 15. Parents invited. Report by 9:30 AM.', 'info', 'Event', '2025-04-18');
  insertNotif.run('Summer Holidays: May 20 – June 10', 'School closed from May 20 to June 10. Holiday homework will be issued.', 'success', 'Holiday', '2025-04-15');
}

// ═══════════════ ROUTES ═══════════════

// ── HEALTH CHECK ──
app.get('/', (req, res) => res.json({ status: 'Wonder Kids API running ✓', version: '1.0' }));

// ── STUDENTS ──
app.get('/api/students', (req, res) => {
  const students = db.prepare('SELECT * FROM students ORDER BY created_at DESC').all();
  res.json(students);
});

app.post('/api/students', (req, res) => {
  const { name, cls, parent, mobile, address, admdate } = req.body;
  if (!name || !cls || !parent || !mobile) return res.status(400).json({ error: 'Missing required fields' });
  const stmt = db.prepare('INSERT INTO students (name, cls, parent, mobile, address, admdate) VALUES (?,?,?,?,?,?)');
  const result = stmt.run(name, cls, parent, mobile, address || '', admdate || '');
  res.json({ id: result.lastInsertRowid, name, cls, parent, mobile });
});

app.delete('/api/students/:id', (req, res) => {
  db.prepare('DELETE FROM students WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── FEES ──
app.get('/api/fees', (req, res) => {
  const fees = db.prepare('SELECT * FROM fees ORDER BY created_at DESC').all();
  res.json(fees);
});

app.post('/api/fees', (req, res) => {
  const { studentId, student, cls, type, amount, mode, date, remarks } = req.body;
  if (!student || !amount) return res.status(400).json({ error: 'Missing required fields' });
  const stmt = db.prepare('INSERT INTO fees (student_id, student, cls, type, amount, mode, date, remarks) VALUES (?,?,?,?,?,?,?,?)');
  const result = stmt.run(studentId || null, student, cls || '', type || 'Tuition Fee', amount, mode || 'Cash', date || new Date().toISOString().split('T')[0], remarks || '');
  res.json({ id: result.lastInsertRowid, student, amount });
});

app.delete('/api/fees/:id', (req, res) => {
  db.prepare('DELETE FROM fees WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/fees/summary', (req, res) => {
  const total = db.prepare('SELECT SUM(amount) as total FROM fees').get().total || 0;
  const byMode = db.prepare('SELECT mode, SUM(amount) as amount FROM fees GROUP BY mode').all();
  const byMonth = db.prepare(`SELECT strftime('%Y-%m', date) as month, SUM(amount) as amount FROM fees GROUP BY month ORDER BY month`).all();
  res.json({ total, byMode, byMonth });
});

// ── NOTIFICATIONS ──
app.get('/api/notifications', (req, res) => {
  const notifs = db.prepare('SELECT * FROM notifications ORDER BY created_at DESC').all();
  res.json(notifs);
});

app.post('/api/notifications', (req, res) => {
  const { title, body, type, badge, date } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'Title and body required' });
  const stmt = db.prepare('INSERT INTO notifications (title, body, type, badge, date) VALUES (?,?,?,?,?)');
  const result = stmt.run(title, body, type || 'info', badge || 'General', date || new Date().toISOString().split('T')[0]);
  res.json({ id: result.lastInsertRowid, title });
});

app.delete('/api/notifications/:id', (req, res) => {
  db.prepare('DELETE FROM notifications WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── GALLERY ──
app.get('/api/gallery', (req, res) => {
  const { category } = req.query;
  const stmt = category
    ? db.prepare('SELECT * FROM gallery WHERE category = ? ORDER BY created_at DESC')
    : db.prepare('SELECT * FROM gallery ORDER BY created_at DESC');
  const items = category ? stmt.all(category) : stmt.all();
  res.json(items);
});

app.post('/api/gallery', upload.array('photos', 20), (req, res) => {
  const { category, caption } = req.body;
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'No files uploaded' });
  const stmt = db.prepare('INSERT INTO gallery (filename, url, category, caption) VALUES (?,?,?,?)');
  const inserted = req.files.map(file => {
    const url = `${req.protocol}://${req.get('host')}/uploads/${file.filename}`;
    const result = stmt.run(file.filename, url, category || 'General', caption || '');
    return { id: result.lastInsertRowid, url, category, caption };
  });
  res.json({ uploaded: inserted.length, files: inserted });
});

app.delete('/api/gallery/:id', (req, res) => {
  const item = db.prepare('SELECT filename FROM gallery WHERE id = ?').get(req.params.id);
  if (item) {
    const filePath = path.join(uploadDir, item.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    db.prepare('DELETE FROM gallery WHERE id = ?').run(req.params.id);
  }
  res.json({ success: true });
});

// ── MATERIALS ──
app.get('/api/materials', (req, res) => {
  const mats = db.prepare('SELECT * FROM materials ORDER BY created_at DESC').all();
  res.json(mats);
});

app.post('/api/materials', upload.single('file'), (req, res) => {
  const { title, description, category } = req.body;
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  if (!title) return res.status(400).json({ error: 'Title required' });
  const url = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  const stmt = db.prepare('INSERT INTO materials (title, description, category, filename, url) VALUES (?,?,?,?,?)');
  const result = stmt.run(title, description || '', category || 'General', req.file.filename, url);
  res.json({ id: result.lastInsertRowid, title, url });
});

app.delete('/api/materials/:id', (req, res) => {
  const item = db.prepare('SELECT filename FROM materials WHERE id = ?').get(req.params.id);
  if (item) {
    const filePath = path.join(uploadDir, item.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    db.prepare('DELETE FROM materials WHERE id = ?').run(req.params.id);
  }
  res.json({ success: true });
});

// ── ENQUIRIES ──
app.get('/api/enquiries', (req, res) => {
  const enq = db.prepare('SELECT * FROM enquiries ORDER BY created_at DESC').all();
  res.json(enq);
});

app.post('/api/enquiries', (req, res) => {
  const { parentName, phone, childName, class: cls } = req.body;
  if (!parentName || !phone) return res.status(400).json({ error: 'Name and phone required' });
  const stmt = db.prepare('INSERT INTO enquiries (parent_name, phone, child_name, class) VALUES (?,?,?,?)');
  const result = stmt.run(parentName, phone, childName || '', cls || '');
  res.json({ id: result.lastInsertRowid, parentName });
});

app.patch('/api/enquiries/:id', (req, res) => {
  db.prepare('UPDATE enquiries SET status = ? WHERE id = ?').run(req.body.status, req.params.id);
  res.json({ success: true });
});

// ── STATS (dashboard) ──
app.get('/api/stats', (req, res) => {
  const students = db.prepare('SELECT COUNT(*) as n FROM students').get().n;
  const fees = db.prepare('SELECT SUM(amount) as total FROM fees').get().total || 0;
  const photos = db.prepare('SELECT COUNT(*) as n FROM gallery').get().n;
  const enquiries = db.prepare("SELECT COUNT(*) as n FROM enquiries WHERE status='pending'").get().n;
  res.json({ students, feesCollected: fees, photos, pendingEnquiries: enquiries });
});

// ── START ──
app.listen(PORT, () => console.log(`✓ Wonder Kids API running on port ${PORT}`));
