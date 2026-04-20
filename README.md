# 🦷 Dr. Abhi's Dental Clinic — Full Stack Website

A production-ready dental clinic website with a complete backend.

## 📁 Project Structure

```
dental-backend/
├── server.js         ← Express API server (main entry point)
├── database.js       ← SQLite database & all queries
├── index.html        ← Main website (with booking form + contact form)
├── admin.html        ← Admin dashboard panel
├── package.json      ← Node.js dependencies
├── .env.example      ← Environment variables template
└── clinic.db         ← SQLite database (auto-created on first run)
```

## 🚀 Quick Start

### 1. Install Node.js
Download from https://nodejs.org (v18 or higher)

### 2. Install dependencies
```bash
cd dental-backend
npm install
```

### 3. Configure environment
```bash
cp .env.example .env
# Edit .env with your settings
```

### 4. Start the server
```bash
npm start
```

The server starts on **http://localhost:3000**

---

## 🌐 URLs

| Page | URL |
|------|-----|
| Main Website | http://localhost:3000 |
| Admin Panel | http://localhost:3000/admin |
| API Base | http://localhost:3000/api |

---

## 🔐 Default Admin Login

```
Username: admin
Password: DrAbhi@2025
```
**Change these in your .env file before going live!**

---

## 📡 API Endpoints

### Public (no auth required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/appointments` | Book an appointment |
| POST | `/api/contact` | Send a contact message |

### Admin (requires Bearer token from login)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/login` | Admin login |
| GET | `/api/admin/stats` | Dashboard stats |
| GET | `/api/admin/appointments` | List all appointments |
| GET | `/api/admin/appointments/:id` | Get single appointment |
| PATCH | `/api/admin/appointments/:id/status` | Update status |
| DELETE | `/api/admin/appointments/:id` | Delete appointment |
| GET | `/api/admin/contacts` | List all messages |
| PATCH | `/api/admin/contacts/:id/read` | Mark message as read |
| DELETE | `/api/admin/contacts/:id` | Delete message |

---

## 🎛️ Admin Dashboard Features

- **Dashboard** — Live stats: total, pending, confirmed, today's appointments, unread messages
- **Appointments** — Full table with search, status filters, inline status change, view details, delete
- **Messages** — All contact form submissions, mark read, delete
- **Live badges** — Red badge counts on sidebar for pending items
- **Real-time clock** — Updates every second

---

## 📧 Email Notifications (Optional)

To get email alerts when new appointments are booked, add to `.env`:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-gmail@gmail.com
SMTP_PASS=your-app-password  ← Google App Password, not regular password
NOTIFY_EMAIL=drabhis@example.com
```

For Gmail: Enable 2FA → Create App Password at myaccount.google.com/apppasswords

---

## 🌍 Deploying to Production

### Option A — VPS (DigitalOcean / Linode / AWS EC2)
```bash
# Install PM2 for process management
npm install -g pm2
pm2 start server.js --name "dental-clinic"
pm2 save && pm2 startup

# Use nginx as reverse proxy on port 80/443
```

### Option B — Railway.app (easiest)
1. Push code to GitHub
2. Connect repo to Railway.app
3. Set environment variables in Railway dashboard
4. Deploy → get live URL instantly

### Option C — Render.com
1. Create new Web Service
2. Connect GitHub repo
3. Build command: `npm install`
4. Start command: `node server.js`

---

## 🛡️ Security Features

- **Helmet.js** — Sets secure HTTP headers
- **Rate limiting** — 5 bookings/hour per IP, 10 login attempts per 15 min
- **Input validation** — express-validator on all inputs
- **JWT authentication** — 8-hour admin tokens
- **bcrypt password hashing** — 12 rounds
- **CORS configured** — Restrict in production

---

## 📞 Clinic Details in Code

All clinic details are pre-configured:
- **Clinic:** Dr. Abhi's Dental Clinic
- **Phone:** 079829 55917
- **Address:** Commercial Complex, Gopal Nagar, Azadpur, Delhi 110033
- **Website:** delhidentaldoctor.com

---

Built with ❤️ for Dr. Abhi's Dental Clinic
