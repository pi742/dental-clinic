// server.js — Dr. Abhi's Dental Clinic · Backend API Server
require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const { body, param, query, validationResult } = require('express-validator');
const path       = require('path');
const nodemailer = require('nodemailer');

let appointments, contacts, admins;
try {
  const db = require('./database');
  appointments = db.appointments;
  contacts = db.contacts;
  admins = db.admins;
  console.log('✅ Database loaded successfully');
} catch(err) {
  console.error('❌ DATABASE ERROR:', err.message);
  console.error('   Make sure you ran: npm install');
  process.exit(1);
}

const app  = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_in_production';

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','PATCH'], credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static HTML files from root
app.use(express.static(path.join(__dirname)));

// ─── Rate Limiting ─────────────────────────────────────────────────────────────
const generalLimiter = rateLimit({ windowMs: 15*60*1000, max: 100, message: { error: 'Too many requests, please try again later.' } });
const authLimiter    = rateLimit({ windowMs: 15*60*1000, max: 10,  message: { error: 'Too many login attempts.' } });
const formLimiter    = rateLimit({ windowMs: 60*60*1000, max: 5,   message: { error: 'You have submitted too many forms. Try again in an hour.' } });

app.use('/api/', generalLimiter);
app.use('/api/admin/login', authLimiter);
app.use('/api/appointments', formLimiter);
app.use('/api/contact', formLimiter);

// ─── Helpers ───────────────────────────────────────────────────────────────────
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ success: false, errors: errors.array() });
  next();
}

function authMiddleware(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.admin = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Email transporter (optional)
let mailer = null;
if (process.env.SMTP_USER && process.env.SMTP_PASS) {
  mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

async function sendNotification(subject, html) {
  if (!mailer || !process.env.NOTIFY_EMAIL) return;
  try {
    await mailer.sendMail({ from: process.env.SMTP_USER, to: process.env.NOTIFY_EMAIL, subject, html });
  } catch (e) { console.warn('⚠️  Email notification failed:', e.message); }
}

// ─── PUBLIC ROUTES ─────────────────────────────────────────────────────────────

// POST /api/appointments — Patient books an appointment
app.post('/api/appointments',
  [
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }),
    body('phone').trim().notEmpty().withMessage('Phone is required').isLength({ min: 6, max: 15 }).withMessage('Invalid phone number'),
    body('email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid email'),
    body('service').trim().notEmpty().withMessage('Service is required'),
    body('date').notEmpty().withMessage('Date is required').trim(),
    body('time').trim().notEmpty().withMessage('Time is required'),
    body('message').optional().trim().isLength({ max: 500 }),
  ],
  validate,
  async (req, res) => {
    try {
      const appt = appointments.create({
        name:    req.body.name,
        phone:   req.body.phone,
        email:   req.body.email   || null,
        service: req.body.service,
        date:    req.body.date,
        time:    req.body.time,
        message: req.body.message || null,
      });

      await sendNotification(
        `🦷 New Appointment — ${appt.name}`,
        `<h2>New Appointment Request</h2>
         <p><b>Name:</b> ${appt.name}</p>
         <p><b>Phone:</b> ${appt.phone}</p>
         <p><b>Service:</b> ${appt.service}</p>
         <p><b>Date/Time:</b> ${appt.date} at ${appt.time}</p>
         <p><b>Message:</b> ${appt.message || 'None'}</p>`
      );

      res.status(201).json({ success: true, message: 'Appointment booked successfully! We will confirm shortly.', data: appt });
    } catch (err) {
      console.error('APPOINTMENT ERROR:', err);
      if (err.code === 'SLOT_TAKEN') {
        return res.status(409).json({ success: false, error: err.message });
      }
      res.status(500).json({ success: false, error: 'Failed to book appointment. Please call us directly.' });
    }
  }
);

// POST /api/contact — Patient sends a message
app.post('/api/contact',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('phone').trim().notEmpty().withMessage('Phone is required'),
    body('email').optional({ checkFalsy: true }).isEmail(),
    body('subject').optional().trim().isLength({ max: 200 }),
    body('message').trim().notEmpty().withMessage('Message is required').isLength({ max: 1000 }),
  ],
  validate,
  async (req, res) => {
    try {
      const contact = contacts.create({
        name:    req.body.name,
        phone:   req.body.phone,
        email:   req.body.email   || null,
        subject: req.body.subject || null,
        message: req.body.message,
      });

      await sendNotification(
        `💬 New Contact Message — ${contact.name}`,
        `<h2>New Contact Submission</h2>
         <p><b>Name:</b> ${contact.name}</p>
         <p><b>Phone:</b> ${contact.phone}</p>
         <p><b>Subject:</b> ${contact.subject || 'N/A'}</p>
         <p><b>Message:</b> ${contact.message}</p>`
      );

      res.status(201).json({ success: true, message: "Thank you! We'll get back to you soon.", data: contact });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, error: 'Failed to send message. Please call us directly.' });
    }
  }
);

// GET /api/slots/:date — returns available time slots for a given date
app.get('/api/slots/:date', (req, res) => {
  try {
    const slots = appointments.getAvailableSlots(req.params.date);
    res.json({ success: true, data: slots });
  } catch(err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── ADMIN AUTH ────────────────────────────────────────────────────────────────

// POST /api/admin/login
app.post('/api/admin/login',
  [
    body('username').trim().notEmpty(),
    body('password').notEmpty(),
  ],
  validate,
  async (req, res) => {
    const admin = admins.findByUsername(req.body.username);
    if (!admin) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(req.body.password, admin.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: admin.id, username: admin.username },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({ success: true, token, username: admin.username });
  }
);

// ─── ADMIN ROUTES (protected) ──────────────────────────────────────────────────

// GET /api/admin/stats
app.get('/api/admin/stats', authMiddleware, (req, res) => {
  res.json({ success: true, data: appointments.getStats() });
});

// GET /api/admin/appointments
app.get('/api/admin/appointments', authMiddleware,
  [
    query('status').optional().isIn(['all','pending','confirmed','cancelled','completed']),
    query('search').optional().trim(),
    query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt(),
  ],
  validate,
  (req, res) => {
    const data = appointments.getAll({
      status: req.query.status,
      search: req.query.search,
      limit:  req.query.limit  || 50,
      offset: req.query.offset || 0,
    });
    res.json({ success: true, data, count: data.length });
  }
);

// GET /api/admin/appointments/:id
app.get('/api/admin/appointments/:id', authMiddleware, (req, res) => {
  const appt = appointments.getById(req.params.id);
  if (!appt) return res.status(404).json({ error: 'Appointment not found' });
  res.json({ success: true, data: appt });
});

// PATCH /api/admin/appointments/:id/status
app.patch('/api/admin/appointments/:id/status',
  authMiddleware,
  [body('status').isIn(['pending','confirmed','cancelled','completed']).withMessage('Invalid status')],
  validate,
  (req, res) => {
    const appt = appointments.getById(req.params.id);
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });
    const updated = appointments.updateStatus(req.params.id, req.body.status);
    res.json({ success: true, data: updated });
  }
);

// DELETE /api/admin/appointments/:id
app.delete('/api/admin/appointments/:id', authMiddleware, (req, res) => {
  const appt = appointments.getById(req.params.id);
  if (!appt) return res.status(404).json({ error: 'Appointment not found' });
  appointments.delete(req.params.id);
  res.json({ success: true, message: 'Appointment deleted' });
});

// GET /api/admin/contacts
app.get('/api/admin/contacts', authMiddleware,
  [query('status').optional().isIn(['all','read','unread'])],
  validate,
  (req, res) => {
    const data = contacts.getAll({ status: req.query.status, limit: 50 });
    res.json({ success: true, data, count: data.length });
  }
);

// PATCH /api/admin/contacts/:id/read
app.patch('/api/admin/contacts/:id/read', authMiddleware, (req, res) => {
  const contact = contacts.markRead(req.params.id);
  res.json({ success: true, data: contact });
});

// DELETE /api/admin/contacts/:id
app.delete('/api/admin/contacts/:id', authMiddleware, (req, res) => {
  contacts.delete(req.params.id);
  res.json({ success: true, message: 'Contact deleted' });
});

// ─── SERVE PAGES ───────────────────────────────────────────────────────────────
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ─── 404 / Error Handlers ──────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🦷  Dr. Abhi's Dental Clinic — Backend Server`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`🌐  Website  → http://localhost:${PORT}`);
  console.log(`🔧  Admin    → http://localhost:${PORT}/admin`);
  console.log(`📡  API      → http://localhost:${PORT}/api`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
});

module.exports = app;
