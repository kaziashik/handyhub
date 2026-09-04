# HandyHub

**A backend platform that connects customers with verified local technicians for on-demand home services — booking, scheduling, and payments, all in one API.**

**Live:** [handy-hub-taupe.vercel.app](https://handy-hub-taupe.vercel.app)
**Postman collection:** [`HandyHub_Postman_Collection.json`](https://github.com/kaziashik/handyhub/blob/main/resources/HandyHub_Postman_Collection.json)
**ERD:** [`ERD_digram.png`](https://github.com/kaziashik/handyhub/blob/main/Project%20plan%20%26%20resorceses/ERD_digram.png)

---

## Table of contents

- [Problem statement](#problem-statement)
- [Who uses this system](#who-uses-this-system)
- [Tech stack](#tech-stack)
- [Database design](#database-design)
- [System workflow](#system-workflow)
- [API reference](#api-reference)
- [Getting started](#getting-started)
- [Testing the API with Postman](#testing-the-api-with-postman)
- [Roadmap](#roadmap)

---

## Problem statement

Finding a reliable technician for home repairs — plumbing, electrical work, appliance fixes — is still mostly informal in a lot of markets: word-of-mouth referrals, unverified contact numbers, no way to confirm someone actually did the job before, and no clean way to pay or track the appointment once it's booked.

On the flip side, skilled independent technicians have no lightweight way to advertise availability, manage a schedule, or get paid without running their own booking software.

HandyHub exists to close that gap on the backend: a single API that lets a **customer** discover and book a **verified technician**, pay for the job, and track it end to end, while giving **admins** a way to vet who's allowed onto the platform in the first place.

## Who uses this system

The API is built around three roles, enforced at the route level via JWT-based auth middleware (`auth(Role.X)`), not just at the UI layer.

| Role | Description |
|---|---|
| **Customer** | Registers, books appointments with a technician, pays for a booking, tracks appointment status, views their own service history and analytics. |
| **Technician** | Applies to join the platform (with a resume + supporting documents), and — once approved by an admin — manages their availability schedule, accepts/updates job status, and views their own performance analytics. |
| **Admin** | Reviews and approves/rejects technician applications, has visibility into all appointments and schedules across the platform, and views platform-wide analytics. |

A technician doesn't get technician privileges the moment they sign up — they go through an **application → email verification → admin approval** pipeline before they can publish a schedule or accept bookings. This is deliberate: it's the mechanism that makes "verified" in the pitch above actually true.

## Tech stack

| Layer | Choice |
|---|---|
| Runtime | Node.js + TypeScript |
| Framework | Express 5 |
| Database | PostgreSQL |
| ORM | Prisma 7 (with `@prisma/adapter-pg`) |
| Auth | JWT (access + refresh tokens), Google OAuth via Passport |
| File storage | Cloudinary (profile images, technician documents) |
| Uploads | Multer |
| Payments | bKash |
| Caching / rate-limit store | Redis |
| Email | Nodemailer + EJS templates |
| Scheduled jobs | node-cron |
| Validation | Zod |

## Database design

The schema is split into focused Prisma files (`user`, `customer`, `technician`, `technician_profile`, `booking`, `appointment`, `schedule`, `availability`, `payment`, `review`, `category`, `service`, `Auth`) unified under one `schema.prisma`. Core state machines you'll want to know before touching the API:

- `BookingStatus`: `REQUESTED → ACCEPTED / DECLINED → PAID → IN_PROGRESS → COMPLETED` (or `CANCELLED` at most points)
- `TechinicianVerificationStatus`: `PENDING → APPROVED / REJECTED`
- `ScheduleStatus`: `DRAFT → PUBLISHED`
- `PaymentStatus`: `UNPAID → PAID / FAILED / CANCELLED / REFUNDED`

Full entity-relationship diagram:

![HandyHub ERD](https://github.com/kaziashik/handyhub/blob/main/Project%20plan%20%26%20resorceses/ERD_digram.png?raw=true)

## System workflow

**1. Technician onboarding**
```
Technician applies (resume + docs)
        │
        ▼
Verifies email (OTP)
        │
        ▼
Admin reviews application ──▶ Rejected → notified via email, flow ends
        │
        ▼
     Approved
        │
        ▼
Technician can publish a schedule
```

**2. Booking lifecycle**
```
Customer registers / logs in (email+password or Google)
        │
        ▼
Browses available technicians & schedules
        │
        ▼
Books an appointment  ──────▶  status: REQUESTED
        │
        ▼
Pays via bKash  ────────────▶  payment callback confirms → status: PAID
        │
        ▼
Technician updates status  ─▶  IN_PROGRESS → COMPLETED
        │
        ▼
Either party may CANCEL before completion (admin can force-cancel)
```

**3. Cross-cutting concerns applied to every request**
- Global rate limiting on all routes, with stricter limits layered on auth, uploads, and payment endpoints specifically (brute-force and abuse protection).
- Every write to a protected resource passes through `validateRequest` (Zod schema) before it reaches the controller.
- Role checks happen in middleware (`checkAuth`), so a customer token can never touch a technician-only or admin-only route regardless of what the client sends.

## API reference

Base URL: `{{APP_URL}}/api/v1`

### Auth — `/auth`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/auth/register` | Public | Register a new customer account |
| POST | `/auth/verify-email` | Public | Verify email via OTP after registration |
| POST | `/auth/login` | Public | Log in with email + password |
| POST | `/auth/google` | Public | Log in / register via Google OAuth |
| GET | `/auth/me` | Admin, Customer, Technician | Get the logged-in user's own profile |
| POST | `/auth/refresh-token` | Public (valid refresh cookie required) | Issue a new access token |
| POST | `/auth/logout` | Public | Clear session cookies |
| POST | `/auth/forgot-password` | Public | Request a password reset email |
| POST | `/auth/reset-password` | Public | Reset password using reset token |

### Users — `/users`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| PATCH | `/users/profile-image` | Admin, Customer, Technician | Upload/replace the user's profile image |

### Technicians — `/techinician`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/techinician/apply-as-techinician` | Public | Submit a technician application with resume + supporting files |
| POST | `/techinician/apply-as-techinician/verify-email` | Public | Verify the applicant's email |
| POST | `/techinician/approve-techinician` | Admin | Approve or reject a pending technician application |
| GET | `/techinician/all-techinician` | Admin | List all technicians on the platform |

### Schedules — `/schedule`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/schedule/create-schedule` | Technician | Create a new availability slot (draft) |
| GET | `/schedule/my-schedules` | Technician | List the logged-in technician's own schedules |
| GET | `/schedule/all-schedules` | Admin | List every technician's schedules |
| GET | `/schedule/todays-schedule` | Public | List schedules happening today |
| PATCH | `/schedule/update-schedule/:scheduleId` | Technician | Edit an existing schedule |
| PATCH | `/schedule/publish-schedule/:scheduleId` | Technician | Publish a draft schedule so customers can book it |
| GET | `/schedule/:scheduleId` | Technician, Admin | Get a single schedule by ID |
| DELETE | `/schedule/:scheduleId` | Technician | Delete a schedule |

### Appointments — `/appointment`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/appointment/book-appointment` | Customer | Book an appointment against a technician's published schedule |
| POST | `/appointment/pay-appointment` | Customer | Initiate payment for a booked appointment |
| GET | `/appointment/book-appointment/payment/callback` | Public (payment gateway callback) | bKash redirects here to confirm/fail a payment |
| POST | `/appointment/cancel-appointment` | Customer, Admin | Cancel an appointment |
| PATCH | `/appointment/update-status/:appointmentId` | Technician | Update job status (e.g. in progress, completed) |
| GET | `/appointment/my-appointments` | Customer | List the logged-in customer's appointments |
| GET | `/appointment/doctor-appointments` | Customer | List appointments (legacy naming — see note below) |
| GET | `/appointment/all-appointments` | Admin | List every appointment on the platform |
| GET | `/appointment/:appointmentId` | Customer, Technician, Admin | Get a single appointment by ID |

> **Note:** `/appointment/doctor-appointments` keeps a naming carryover from an earlier iteration of the project — it's a HandyHub appointment endpoint, not medical scheduling.

### Analytics — `/analytics`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/analytics/customer-analytics` | Customer | Booking/spend summary for the logged-in customer |
| GET | `/analytics/techician-analytics` | Technician | Job/earnings summary for the logged-in technician |
| GET | `/analytics/admin-analytics` | Admin | Platform-wide metrics |

## Getting started

### Prerequisites

- Node.js 18+
- PostgreSQL database
- A Redis instance (used for rate-limiting and caching)
- Cloudinary account (file uploads)
- Google OAuth credentials (if enabling Google login)
- bKash merchant credentials (if enabling payments)
- An SMTP-capable email account (OTP, password reset, and notification emails)

### 1. Clone and install

```bash
git clone https://github.com/kaziashik/handyhub.git
cd handyhub
npm install
```

### 2. Configure environment variables

Create a `.env` file in the project root. **Never commit this file** — treat every value below as a secret, generate your own, and rotate anything that's ever been exposed.

```env
node_env=development
PORT=5000
APP_URL=http://localhost:5000

# PostgreSQL connection string
DATABASE_URL="postgresql://user:password@host:5432/handyhub"

# JWT
JWT_ACCESS_SECRET=replace_with_a_long_random_string
JWT_REFRESH_SECRET=replace_with_a_different_long_random_string
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

BCRYPT_SALT_ROUNDS=10

# Used to build absolute links back to this API (not read anywhere yet)
BACKEND_URL=

# Allowed CORS origin for the browser client
FRONTEND_URL=http://localhost:3000

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CLIENT_CALLBACK_URL=

# Seed accounts created on first run — set your own values
SUPER_ADMIN_NAME=
SUPER_ADMIN_EMAIL=
SUPER_ADMIN_PASSWORD=
TESTER_ADMIN_NAME=
TESTER_ADMIN_EMAIL=
TESTER_ADMIN_PASSWORD=
TESTER_TECHINICAN_NAME=
TESTER_TECHINICAN_EMAIL=
TESTER_TECHINICAN_PASSWORD=

# Redis
REDIS_USER=default
REDIS_PASSWORD=
REDIS_HOST=
REDIS_PORT=

# SMTP (email)
SMTP_USER=
SMTP_PASSWORD=
EMAIL_SENDER=

# Cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# bKash payment gateway
BKASH_BASE_URL=
BKASH_USERNAME=
BKASH_PASSWORD=
BKASH_APP_KEY=
BKASH_APP_SECRET=
BKASH_CALLBACK_URL=http://localhost:5000/api/v1/appointment/book-appointment/payment/callback
```

> `SMTP_PASSWORD` for Gmail should be an [App Password](https://support.google.com/accounts/answer/185833), not your regular account password.

### 3. Set up the database

```bash
npx prisma generate
npx prisma migrate deploy
```

### 4. Run it

```bash
# development (hot reload)
npm run dev

# production build
npm run build
npm start
```

The server starts at `http://localhost:5000` by default. Hitting `GET /` should return:

```
Welcome to HandyHub System Backend!
```

## Testing the API with Postman

Import [`HandyHub_Postman_Collection.json`](https://github.com/kaziashik/handyhub/blob/main/resources/HandyHub_Postman_Collection.json) into Postman and set a collection variable (or environment) for:

- `baseUrl` → `http://localhost:5000/api/v1` (or your deployed URL)
- Any auth tokens returned from `/auth/login`, so subsequent role-protected requests are authenticated automatically

Suggested flow to exercise the whole system in one pass: register a customer → apply as a technician with a second account → log in as the seeded admin → approve the technician → log in as the technician → publish a schedule → log in as the customer → book and pay for an appointment → update its status as the technician.

## Roadmap

- [ ] Additional payment providers (Stripe, SSLCommerz are already modeled in the schema)
- [ ] Reviews and ratings surfaced through the public API
- [ ] Push/SMS notifications alongside existing email flows
