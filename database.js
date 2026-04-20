// database.js — SQLite database setup & initialization for Dr. Abhi's Dental Clinic
const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'clinic.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initializeSchema();
  }
  return db;
}

function initializeSchema() {
  db.exec(`
    -- Appointments table
    CREATE TABLE IF NOT EXISTS appointments (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      name      TEXT    NOT NULL,
      phone     TEXT    NOT NULL,
      email     TEXT,
      service   TEXT    NOT NULL,
      date      TEXT    NOT NULL,
      time      TEXT    NOT NULL,
      message   TEXT,
      status    TEXT    NOT NULL DEFAULT 'pending',
      created_at TEXT   NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT   NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- Contact / inquiry submissions
    CREATE TABLE IF NOT EXISTS contacts (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      name      TEXT    NOT NULL,
      phone     TEXT    NOT NULL,
      email     TEXT,
      subject   TEXT,
      message   TEXT    NOT NULL,
      status    TEXT    NOT NULL DEFAULT 'unread',
      created_at TEXT   NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- Admin users
    CREATE TABLE IF NOT EXISTS admins (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      username  TEXT    UNIQUE NOT NULL,
      password  TEXT    NOT NULL,
      created_at TEXT   NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- Audit log
    CREATE TABLE IF NOT EXISTS audit_log (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      action    TEXT    NOT NULL,
      entity    TEXT    NOT NULL,
      entity_id INTEGER,
      details   TEXT,
      created_at TEXT   NOT NULL DEFAULT (datetime('now','localtime'))
    );
  `);

  // Seed default admin if none exists
  const adminCount = db.prepare('SELECT COUNT(*) as cnt FROM admins').get();
  if (adminCount.cnt === 0) {
    const username = process.env.ADMIN_USERNAME || 'admin';
    const rawPassword = process.env.ADMIN_PASSWORD || 'DrAbhi@2025';
    const hashed = bcrypt.hashSync(rawPassword, 12);
    db.prepare('INSERT INTO admins (username, password) VALUES (?, ?)').run(username, hashed);
    console.log(`✅ Default admin created → username: "${username}"`);
  }

  // Seed sample appointments for demo
  const apptCount = db.prepare('SELECT COUNT(*) as cnt FROM appointments').get();
  if (apptCount.cnt === 0) {
    const samples = [
      ['Ravi Sharma',  '9876543210', 'ravi@example.com',  'Root Canal Treatment',      '2025-02-15', '10:00 AM', 'Have mild pain in tooth', 'confirmed'],
      ['Priya Gupta',  '9812345678', 'priya@example.com', 'Teeth Whitening',            '2025-02-16', '11:30 AM', null, 'confirmed'],
      ['Amit Mehta',   '9823456789', null,                'Wisdom Tooth Extraction',    '2025-02-17', '02:00 PM', 'Swelling for 2 days', 'pending'],
      ['Neha Kapoor',  '9834567890', 'neha@example.com',  'Braces & Aligners',          '2025-02-18', '03:30 PM', null, 'pending'],
      ['Deepak Jain',  '9845678901', 'deepak@example.com','Dental Implants',            '2025-02-19', '10:00 AM', 'Missing 2 teeth', 'pending'],
    ];
    const insert = db.prepare(
      'INSERT INTO appointments (name, phone, email, service, date, time, message, status) VALUES (?,?,?,?,?,?,?,?)'
    );
    samples.forEach(s => insert.run(...s));
  }
}

// ─── Appointment Queries ───────────────────────────────────────────────────────
const appointments = {
  isSlotTaken(date, time) {
    const existing = getDb().prepare(
      `SELECT id FROM appointments WHERE date = ? AND time = ? AND status != 'cancelled'`
    ).get(date, time);
    return !!existing;
  },

  getAvailableSlots(date) {
    const allSlots = [
      '09:00 AM','09:30 AM','10:00 AM','10:30 AM','11:00 AM','11:30 AM','12:00 PM',
      '02:00 PM','02:30 PM','03:00 PM','03:30 PM','04:00 PM','04:30 PM',
      '05:00 PM','05:30 PM','06:00 PM','06:30 PM','07:00 PM','07:30 PM','08:00 PM','08:30 PM'
    ];
    const booked = getDb().prepare(
      `SELECT time FROM appointments WHERE date = ? AND status != 'cancelled'`
    ).all(date).map(r => r.time);
    return allSlots.map(slot => ({ time: slot, available: !booked.includes(slot) }));
  },

  create(data) {
    // Check for double booking before inserting
    const conflict = getDb().prepare(
      `SELECT id, name FROM appointments WHERE date = ? AND time = ? AND status != 'cancelled'`
    ).get(data.date, data.time);

    if (conflict) {
      const err = new Error(`This time slot (${data.time} on ${data.date}) is already booked. Please choose a different time.`);
      err.code = 'SLOT_TAKEN';
      throw err;
    }

    const stmt = getDb().prepare(
      `INSERT INTO appointments (name, phone, email, service, date, time, message)
       VALUES (@name, @phone, @email, @service, @date, @time, @message)`
    );
    const result = stmt.run(data);
    log('CREATE', 'appointment', result.lastInsertRowid, `New appointment by ${data.name}`);
    return getDb().prepare('SELECT * FROM appointments WHERE id = ?').get(result.lastInsertRowid);
  },

  getAll({ status, search, limit = 50, offset = 0 } = {}) {
    let q = 'SELECT * FROM appointments';
    const params = [];
    const where = [];
    if (status && status !== 'all') { where.push('status = ?'); params.push(status); }
    if (search) {
      where.push('(name LIKE ? OR phone LIKE ? OR service LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    if (where.length) q += ' WHERE ' + where.join(' AND ');
    q += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    return getDb().prepare(q).all(...params);
  },

  getById(id) {
    return getDb().prepare('SELECT * FROM appointments WHERE id = ?').get(id);
  },

  updateStatus(id, status) {
    getDb().prepare(
      `UPDATE appointments SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?`
    ).run(status, id);
    log('UPDATE', 'appointment', id, `Status changed to ${status}`);
    return this.getById(id);
  },

  delete(id) {
    log('DELETE', 'appointment', id, 'Appointment deleted');
    return getDb().prepare('DELETE FROM appointments WHERE id = ?').run(id);
  },

  getStats() {
    const db = getDb();
    return {
      total:     db.prepare("SELECT COUNT(*) as n FROM appointments").get().n,
      pending:   db.prepare("SELECT COUNT(*) as n FROM appointments WHERE status='pending'").get().n,
      confirmed: db.prepare("SELECT COUNT(*) as n FROM appointments WHERE status='confirmed'").get().n,
      cancelled: db.prepare("SELECT COUNT(*) as n FROM appointments WHERE status='cancelled'").get().n,
      completed: db.prepare("SELECT COUNT(*) as n FROM appointments WHERE status='completed'").get().n,
      today:     db.prepare("SELECT COUNT(*) as n FROM appointments WHERE date = date('now')").get().n,
      contacts:  db.prepare("SELECT COUNT(*) as n FROM contacts WHERE status='unread'").get().n,
    };
  }
};

// ─── Contact Queries ───────────────────────────────────────────────────────────
const contacts = {
  create(data) {
    const result = getDb().prepare(
      'INSERT INTO contacts (name, phone, email, subject, message) VALUES (@name, @phone, @email, @subject, @message)'
    ).run(data);
    log('CREATE', 'contact', result.lastInsertRowid, `New contact from ${data.name}`);
    return getDb().prepare('SELECT * FROM contacts WHERE id = ?').get(result.lastInsertRowid);
  },

  getAll({ status, limit = 50, offset = 0 } = {}) {
    let q = 'SELECT * FROM contacts';
    const params = [];
    if (status && status !== 'all') { q += ' WHERE status = ?'; params.push(status); }
    q += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    return getDb().prepare(q).all(...params);
  },

  markRead(id) {
    getDb().prepare("UPDATE contacts SET status = 'read' WHERE id = ?").run(id);
    return getDb().prepare('SELECT * FROM contacts WHERE id = ?').get(id);
  },

  delete(id) {
    return getDb().prepare('DELETE FROM contacts WHERE id = ?').run(id);
  }
};

// ─── Admin Queries ─────────────────────────────────────────────────────────────
const admins = {
  findByUsername(username) {
    return getDb().prepare('SELECT * FROM admins WHERE username = ?').get(username);
  }
};

// ─── Audit ────────────────────────────────────────────────────────────────────
function log(action, entity, entityId, details) {
  try {
    getDb().prepare(
      'INSERT INTO audit_log (action, entity, entity_id, details) VALUES (?, ?, ?, ?)'
    ).run(action, entity, entityId, details);
  } catch (_) { /* non-critical */ }
}

module.exports = { getDb, appointments, contacts, admins };
