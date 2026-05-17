# Chronos — Job Scheduling API

A production-ready job scheduling system built with **Express + BullMQ + Redis + Prisma (PostgreSQL)**.

## Features

- ✅ Job scheduling with **delay** (`scheduleAt`) or **recurring cron** expressions
- ✅ **Priority queuing** (lower number = higher priority)
- ✅ **Retry with exponential backoff** + **dead-letter queue** for exhausted jobs
- ✅ **Audit trail** (`JobEvent`) for full lifecycle visibility
- ✅ Optional **webhook callbacks** with **HMAC-SHA256 signature** verification
- ✅ **BullBoard** queue UI at `/admin/queues` (protected with basic auth)
- ✅ Observability: request IDs, response-time headers, structured logs, `/metrics` (Prometheus)
- ✅ **Food Order** job type with 5 automatic stage transitions, 3-minute intervals, and email notifications per stage

---

## Requirements

| Dependency | Version |
|---|---|
| Node.js | 18+ (20+ recommended) |
| Redis | 6+ |
| PostgreSQL | 13+ |

---

## Setup (Local)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
copy .env.example .env
```

Edit `.env` and set your `DATABASE_URL`, `REDIS_HOST`, `JWT_SECRET`, and SMTP config.

### 3. Run database migrations

```bash
npm run prisma:migrate
```

### 4. Start the API server

```bash
npm run dev
```

### 5. Start the background worker (separate terminal)

```bash
npm run worker
```

The API will be available at `http://localhost:3000` (or the port set in `PORT`).

---

## Docker (Recommended for Submission)

### Quick start with Docker Compose (full stack)

```bash
docker compose up --build
```

This spins up:
- `chronos-api` → API server on port **3000**
- `chronos-worker` → Background job worker
- `chronos-postgres` → PostgreSQL on port **5432**
- `chronos-redis` → Redis on port **6379**

### Build the image only

```bash
docker build -t chronos-api .
```

### Run the container (requires external Postgres & Redis)

```bash
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://postgres:password@host:5432/chronos" \
  -e REDIS_HOST=host \
  -e REDIS_PORT=6379 \
  -e JWT_SECRET=your-secret \
  chronos-api
```

---

## API Reference

> **Base URL:** `http://localhost:3000`  
> **Authentication:** All `/jobs` endpoints require `Authorization: Bearer <token>` obtained from the Login API.

---

### 1. Health Check

Check if the API server is running.

**Endpoint:** `GET /health`

#### cURL

```bash
curl -X GET http://localhost:3000/health
```

#### Required Parameters
_None_

#### Optional Parameters
_None_

#### ✅ Success Response `200 OK`

```json
{ "ok": true }
```

---

### 2. Register User

Create a new user account.

**Endpoint:** `POST /auth/register`

#### cURL

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "changeme"
  }'
```

#### Required Parameters

| Field | Type | Description |
|---|---|---|
| `username` | string | Unique username |
| `password` | string | Plain-text password (hashed with bcrypt) |

#### Optional Parameters
_None_

#### ✅ Success Response `201 Created`

```json
{
  "message": "User created"
}
```

#### ❌ Failure Responses

| Status | Body | Reason |
|---|---|---|
| `400` | `{"error": "username and password are required"}` | Missing fields |
| `400` | `{"error": "User already exists"}` | Duplicate username |

---

### 3. Login User

Authenticate and receive a JWT token.

**Endpoint:** `POST /auth/login`

#### cURL

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "changeme"
  }'
```

#### Required Parameters

| Field | Type | Description |
|---|---|---|
| `username` | string | Registered username |
| `password` | string | Account password |

#### Optional Parameters
_None_

#### ✅ Success Response `200 OK`

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJlNWIwYjRhOSIsInVzZXJuYW1lIjoidGVzdHVzZXIiLCJpYXQiOjE3NzkwMjAyNjksImV4cCI6MTc3OTEwNjY2OX0.xFFxKhRa..."
}
```

> **Note:** Token expires in **24 hours**. Use it in subsequent requests as `Authorization: Bearer <token>`.

#### ❌ Failure Responses

| Status | Body | Reason |
|---|---|---|
| `400` | `{"error": "username and password are required"}` | Missing fields |
| `401` | `{"error": "Invalid credentials"}` | Wrong username or password |

---

### 4. Create Job

Schedule a new job. Supports one-time scheduling via `scheduleAt` or recurring jobs via `cron`.

**Endpoint:** `POST /jobs`

#### cURL — One-time job

```bash
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{
    "type": "generic",
    "payload": { "durationMs": 500 },
    "scheduleAt": "2026-05-20T10:00:00.000Z",
    "priority": 3,
    "tags": ["demo"],
    "maxAttempts": 3
  }'
```

#### cURL — Email job

```bash
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{
    "type": "email",
    "payload": {
      "to": "user@example.com",
      "subject": "Hello from Chronos",
      "body": "This is a test email sent via the job scheduler."
    },
    "scheduleAt": "2026-05-20T09:00:00Z",
    "priority": 2,
    "maxAttempts": 3,
    "tags": ["email", "notifications"]
  }'
```

#### cURL — Recurring report job (cron)

```bash
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{
    "type": "report",
    "payload": {
      "reportType": "system_health",
      "userId": "system",
      "dateRange": { "from": "auto", "to": "auto" }
    },
    "cron": "0 9 * * 1",
    "priority": 5,
    "tags": ["report", "recurring"]
  }'
```

#### cURL — Webhook job

```bash
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{
    "type": "webhook",
    "payload": {
      "url": "https://webhook.site/your-unique-id",
      "method": "POST",
      "headers": { "X-Chronos-Event": "order.placed" },
      "body": { "orderId": "ord_001", "amount": 1999 },
      "timeoutMs": 5000
    },
    "priority": 1,
    "maxAttempts": 5,
    "tags": ["webhook", "order"]
  }'
```

#### Required Parameters

| Field | Type | Description |
|---|---|---|
| `type` | string | Job type: `generic`, `email`, `report`, `webhook` |
| `scheduleAt` **or** `cron` | string | ISO 8601 datetime **or** cron expression. Exactly one is required. |

#### Optional Parameters

| Field | Type | Default | Description |
|---|---|---|---|
| `payload` | object | `{}` | Arbitrary data passed to the worker |
| `priority` | integer | `undefined` | Lower number = higher priority |
| `maxAttempts` | integer | `3` | Max retry attempts before moving to dead-letter queue |
| `tags` | string[] | `[]` | Labels for filtering jobs |
| `callbackUrl` | string | `null` | Webhook URL to POST result to on completion/failure |

#### ✅ Success Response `201 Created`

```json
{
  "job": {
    "id": "7b6d5051-b8c1-4189-8cbf-b30183290fac",
    "type": "generic",
    "payload": { "durationMs": 500 },
    "status": "queued",
    "scheduleAt": "2026-05-20T10:00:00.000Z",
    "attempts": 0,
    "maxAttempts": 3,
    "priority": 3,
    "callbackUrl": null,
    "tags": ["demo"],
    "startedAt": null,
    "completedAt": null,
    "createdAt": "2026-05-17T12:18:10.125Z",
    "updatedAt": "2026-05-17T12:18:10.125Z"
  }
}
```

#### ❌ Failure Responses

| Status | Body | Reason |
|---|---|---|
| `400` | `{"error": "type and scheduleAt (or cron) are required"}` | Missing required fields |
| `400` | `{"error": "scheduleAt and cron are mutually exclusive"}` | Both provided |
| `401` | `{"error": "Invalid or expired token"}` | Bad/missing auth token |

---

### 5. Create Food Order Job

Place a food order that automatically progresses through **5 stages** with **3-minute intervals** between each. An **email notification** is sent to the customer at every stage transition.

**Endpoint:** `POST /jobs`

> **Note:** Unlike other job types, `food-order` does **not** require `scheduleAt` or `cron` — it starts immediately upon creation.

#### Order Lifecycle

```
Created → [0 min] Order Processing
        → [+3 min] Food Preparing
        → [+6 min] Food Ready to Pick Up
        → [+9 min] Out for Delivery
        → [+12 min] Delivered ✅
```

#### cURL

```bash
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{
    "type": "food-order",
    "payload": {
      "customerEmail": "customer@example.com",
      "customerName": "Kiran Miskin",
      "orderId": "ORD-2026-001",
      "items": [
        { "name": "Butter Chicken", "qty": 2, "price": 299 },
        { "name": "Garlic Naan", "qty": 4, "price": 49 }
      ]
    },
    "priority": 1,
    "tags": ["food", "order"]
  }'
```

#### Required Parameters (in `payload`)

| Field | Type | Description |
|---|---|---|
| `customerEmail` | string | Email address to send stage notifications to |
| `orderId` | string | Your order reference ID (e.g. `ORD-2026-001`) |

#### Optional Parameters

| Field | Type | Default | Description |
|---|---|---|---|
| `payload.customerName` | string | `null` | Customer name used in email greeting |
| `payload.items` | array | `[]` | List of ordered items (for email context) |
| `priority` | integer | `5` | Lower number = higher priority |
| `tags` | string[] | `[]` | Labels for filtering |
| `callbackUrl` | string | `null` | Webhook URL to POST final result to |

#### ✅ Success Response `201 Created`

```json
{
  "job": {
    "id": "1112683e-fdc4-4e5b-b0a6-546314980fe4",
    "type": "food-order",
    "payload": {
      "customerEmail": "customer@example.com",
      "customerName": "Kiran Miskin",
      "orderId": "ORD-2026-001",
      "items": [
        { "name": "Butter Chicken", "qty": 2, "price": 299 },
        { "name": "Garlic Naan", "qty": 4, "price": 49 }
      ]
    },
    "status": "queued",
    "scheduleAt": "2026-05-17T12:36:57.000Z",
    "attempts": 0,
    "maxAttempts": 3,
    "priority": 1,
    "callbackUrl": null,
    "tags": ["food", "order"],
    "startedAt": null,
    "completedAt": null,
    "createdAt": "2026-05-17T12:36:57.000Z",
    "updatedAt": "2026-05-17T12:36:57.000Z"
  }
}
```

> **Tracking:** Poll `GET /jobs/:id` to track current stage. Poll `GET /jobs/:id/events` for the full audit trail.

#### Example: Checking stage progress

```bash
curl "http://localhost:3000/jobs/1112683e-fdc4-4e5b-b0a6-546314980fe4/events" \
  -H "Authorization: Bearer <your-token>"
```

**Events response (mid-delivery):**
```json
{
  "jobId": "1112683e-fdc4-4e5b-b0a6-546314980fe4",
  "events": [
    { "event": "queued",            "attempt": 0, "createdAt": "2026-05-17T12:36:57Z" },
    { "event": "started",           "attempt": 1, "createdAt": "2026-05-17T12:36:58Z" },
    { "event": "order_processing",  "attempt": 1, "message": "Stage: Order Processing",   "createdAt": "2026-05-17T12:37:02Z" },
    { "event": "started",           "attempt": 2, "createdAt": "2026-05-17T12:40:02Z" },
    { "event": "food_preparing",    "attempt": 2, "message": "Stage: Food Preparing",     "createdAt": "2026-05-17T12:40:06Z" },
    { "event": "started",           "attempt": 3, "createdAt": "2026-05-17T12:43:06Z" },
    { "event": "food_ready",        "attempt": 3, "message": "Stage: Food Ready to Pick Up", "createdAt": "2026-05-17T12:43:10Z" }
  ]
}
```

#### ❌ Failure Responses

| Status | Body | Reason |
|---|---|---|
| `400` | `{"error": "food-order requires payload.customerEmail and payload.orderId"}` | Missing required payload fields |
| `401` | `{"error": "Invalid or expired token"}` | Bad/missing auth token |

---

### 6. List Jobs

Retrieve a paginated list of jobs with optional filters.

**Endpoint:** `GET /jobs`

#### cURL

```bash
curl "http://localhost:3000/jobs?limit=10&status=queued&tag=demo" \
  -H "Authorization: Bearer <your-token>"
```

#### Required Parameters
_None_

#### Optional Query Parameters

| Parameter | Type | Description |
|---|---|---|
| `limit` | integer | Max jobs to return (default: `25`, max: `100`) |
| `cursor` | string | Pagination cursor (job ID) from previous response's `nextCursor` |
| `status` | string | Filter by status: `queued`, `pending`, `running`, `succeeded`, `failed`, `cancelled` |
| `priority` | integer | Filter by exact priority |
| `tag` | string | Filter by tag |
| `from` | ISO 8601 | Filter jobs created after this date |
| `to` | ISO 8601 | Filter jobs created before this date |

#### ✅ Success Response `200 OK`

```json
{
  "jobs": [
    {
      "id": "7b6d5051-b8c1-4189-8cbf-b30183290fac",
      "type": "generic",
      "payload": { "durationMs": 500 },
      "status": "queued",
      "scheduleAt": "2026-05-20T10:00:00.000Z",
      "attempts": 0,
      "maxAttempts": 3,
      "priority": 3,
      "callbackUrl": null,
      "tags": ["demo"],
      "startedAt": null,
      "completedAt": null,
      "createdAt": "2026-05-17T12:18:10.125Z",
      "updatedAt": "2026-05-17T12:18:10.125Z"
    }
  ],
  "nextCursor": "5967145f-474b-43c2-95e8-009f96125494"
}
```

> Use `nextCursor` as the `cursor` query param for the next page. `null` means no more pages.

#### ❌ Failure Responses

| Status | Body | Reason |
|---|---|---|
| `401` | `{"error": "Invalid or expired token"}` | Bad/missing auth token |

---

### 6. Get Job by ID

Retrieve a single job with its latest event.

**Endpoint:** `GET /jobs/:id`

#### cURL

```bash
curl "http://localhost:3000/jobs/7b6d5051-b8c1-4189-8cbf-b30183290fac" \
  -H "Authorization: Bearer <your-token>"
```

#### Required Parameters

| Parameter | Type | Description |
|---|---|---|
| `:id` (path) | string | UUID of the job |

#### Optional Parameters
_None_

#### ✅ Success Response `200 OK`

```json
{
  "job": {
    "id": "7b6d5051-b8c1-4189-8cbf-b30183290fac",
    "type": "generic",
    "payload": { "durationMs": 500 },
    "status": "queued",
    "scheduleAt": "2026-05-20T10:00:00.000Z",
    "attempts": 0,
    "maxAttempts": 3,
    "priority": 3,
    "callbackUrl": null,
    "tags": ["demo"],
    "startedAt": null,
    "completedAt": null,
    "createdAt": "2026-05-17T12:18:10.125Z",
    "updatedAt": "2026-05-17T12:18:10.125Z",
    "events": [
      {
        "id": "79c3012c-8c8d-4890-b17f-b1e4b587ff61",
        "jobId": "7b6d5051-b8c1-4189-8cbf-b30183290fac",
        "event": "queued",
        "attempt": 0,
        "message": null,
        "meta": null,
        "createdAt": "2026-05-17T12:18:10.171Z"
      }
    ]
  }
}
```

#### ❌ Failure Responses

| Status | Body | Reason |
|---|---|---|
| `401` | `{"error": "Invalid or expired token"}` | Bad/missing auth token |
| `404` | `{"error": "Job not found"}` | Job ID does not exist |

---

### 7. Get Job Events (Audit Trail)

Retrieve the full event history for a job.

**Endpoint:** `GET /jobs/:id/events`

#### cURL

```bash
curl "http://localhost:3000/jobs/7b6d5051-b8c1-4189-8cbf-b30183290fac/events" \
  -H "Authorization: Bearer <your-token>"
```

#### Required Parameters

| Parameter | Type | Description |
|---|---|---|
| `:id` (path) | string | UUID of the job |

#### Optional Parameters
_None_

#### ✅ Success Response `200 OK`

```json
{
  "jobId": "7b6d5051-b8c1-4189-8cbf-b30183290fac",
  "events": [
    {
      "id": "79c3012c-8c8d-4890-b17f-b1e4b587ff61",
      "jobId": "7b6d5051-b8c1-4189-8cbf-b30183290fac",
      "event": "queued",
      "attempt": 0,
      "message": null,
      "meta": null,
      "createdAt": "2026-05-17T12:18:10.171Z"
    },
    {
      "id": "9ad21cdc-1234-5678-abcd-ef0123456789",
      "jobId": "7b6d5051-b8c1-4189-8cbf-b30183290fac",
      "event": "started",
      "attempt": 1,
      "message": null,
      "meta": null,
      "createdAt": "2026-05-17T12:19:00.000Z"
    },
    {
      "id": "b2c34def-abcd-1234-5678-abcdef012345",
      "jobId": "7b6d5051-b8c1-4189-8cbf-b30183290fac",
      "event": "succeeded",
      "attempt": 1,
      "message": null,
      "meta": { "durationMs": 523 },
      "createdAt": "2026-05-17T12:19:01.000Z"
    }
  ]
}
```

#### ❌ Failure Responses

| Status | Body | Reason |
|---|---|---|
| `401` | `{"error": "Invalid or expired token"}` | Bad/missing auth token |

---

### 8. Get Job Stats

Retrieve aggregate statistics for all jobs.

**Endpoint:** `GET /jobs/stats`

#### cURL

```bash
curl "http://localhost:3000/jobs/stats" \
  -H "Authorization: Bearer <your-token>"
```

#### Required Parameters
_None_

#### Optional Parameters
_None_

#### ✅ Success Response `200 OK`

```json
{
  "totalCount": 10,
  "byStatus": [
    { "status": "queued", "count": 5 },
    { "status": "succeeded", "count": 3 },
    { "status": "failed", "count": 1 },
    { "status": "cancelled", "count": 1 }
  ],
  "avgDurationMs": 325.5,
  "failureRate": 0.1
}
```

#### ❌ Failure Responses

| Status | Body | Reason |
|---|---|---|
| `401` | `{"error": "Invalid or expired token"}` | Bad/missing auth token |

---

### 9. Cancel Job

Cancel a queued or pending job. Cannot cancel a completed or failed job.

**Endpoint:** `DELETE /jobs/:id`

#### cURL

```bash
curl -X DELETE "http://localhost:3000/jobs/7b6d5051-b8c1-4189-8cbf-b30183290fac" \
  -H "Authorization: Bearer <your-token>"
```

#### Required Parameters

| Parameter | Type | Description |
|---|---|---|
| `:id` (path) | string | UUID of the job to cancel |

#### Optional Parameters
_None_

#### ✅ Success Response `200 OK`

```json
{
  "message": "Job cancelled successfully",
  "jobId": "7b6d5051-b8c1-4189-8cbf-b30183290fac"
}
```

#### ❌ Failure Responses

| Status | Body | Reason |
|---|---|---|
| `400` | `{"error": "Cannot cancel a job with status 'completed'"}` | Job already completed |
| `400` | `{"error": "Cannot cancel a job with status 'failed'"}` | Job already failed |
| `401` | `{"error": "Invalid or expired token"}` | Bad/missing auth token |
| `404` | `{"error": "Job not found"}` | Job ID does not exist |

---

### 10. Reschedule Job

Update the schedule or priority of a pending/queued job.

**Endpoint:** `PATCH /jobs/:id`

#### cURL

```bash
curl -X PATCH "http://localhost:3000/jobs/7b6d5051-b8c1-4189-8cbf-b30183290fac" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{
    "scheduleAt": "2026-05-25T14:00:00Z",
    "priority": 1
  }'
```

#### Required Parameters

| Field / Parameter | Type | Description |
|---|---|---|
| `:id` (path) | string | UUID of the job |
| `scheduleAt` (body) | string | New ISO 8601 datetime for the job |

#### Optional Parameters

| Field | Type | Description |
|---|---|---|
| `priority` | integer | New priority value |

#### ✅ Success Response `200 OK`

```json
{
  "job": {
    "id": "7b6d5051-b8c1-4189-8cbf-b30183290fac",
    "type": "generic",
    "status": "queued",
    "scheduleAt": "2026-05-25T14:00:00.000Z",
    "priority": 1,
    "attempts": 0,
    "maxAttempts": 3,
    "tags": ["demo"],
    "createdAt": "2026-05-17T12:18:10.125Z",
    "updatedAt": "2026-05-17T12:45:00.000Z"
  }
}
```

#### ❌ Failure Responses

| Status | Body | Reason |
|---|---|---|
| `400` | `{"error": "scheduleAt is required"}` | Missing scheduleAt in body |
| `400` | `{"error": "Cannot reschedule a job with status 'completed'. Must be pending or queued."}` | Job is not reschedulable |
| `401` | `{"error": "Invalid or expired token"}` | Bad/missing auth token |
| `404` | `{"error": "Job not found"}` | Job ID does not exist |

---

### 11. List Dead-Letter Jobs

Browse jobs that have exhausted all retry attempts.

**Endpoint:** `GET /jobs/dead-letter`

#### cURL

```bash
curl "http://localhost:3000/jobs/dead-letter?start=0&end=49" \
  -H "Authorization: Bearer <your-token>"
```

#### Required Parameters
_None_

#### Optional Query Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `start` | integer | `0` | Start index for pagination |
| `end` | integer | `49` | End index for pagination |

#### ✅ Success Response `200 OK`

```json
{
  "count": 1,
  "jobs": [
    {
      "id": "c3d4e5f6-7890-abcd-ef01-234567890abc",
      "name": "email",
      "data": {
        "jobId": "c3d4e5f6-7890-abcd-ef01-234567890abc",
        "payload": { "to": "test@example.com", "subject": "Test" }
      },
      "timestamp": 1779020000000,
      "attemptsMade": 3,
      "failedReason": "Connection timeout"
    }
  ]
}
```

#### ❌ Failure Responses

| Status | Body | Reason |
|---|---|---|
| `401` | `{"error": "Invalid or expired token"}` | Bad/missing auth token |

---

### 12. Retry Dead-Letter Job

Move a dead-letter job back to the active queue for re-processing.

**Endpoint:** `POST /jobs/:id/retry-dead`

#### cURL

```bash
curl -X POST "http://localhost:3000/jobs/c3d4e5f6-7890-abcd-ef01-234567890abc/retry-dead" \
  -H "Authorization: Bearer <your-token>"
```

#### Required Parameters

| Parameter | Type | Description |
|---|---|---|
| `:id` (path) | string | UUID of the dead-letter job |

#### Optional Parameters
_None_

#### ✅ Success Response `200 OK`

```json
{
  "ok": true,
  "jobId": "c3d4e5f6-7890-abcd-ef01-234567890abc"
}
```

#### ❌ Failure Responses

| Status | Body | Reason |
|---|---|---|
| `401` | `{"error": "Invalid or expired token"}` | Bad/missing auth token |
| `404` | `{"error": "Dead-letter job not found"}` | No dead-letter job with that ID |
| `404` | `{"error": "DB job not found"}` | Job exists in DLQ but not in database |

---

### 13. Prometheus Metrics

Expose Prometheus-compatible metrics (no auth required).

**Endpoint:** `GET /metrics`

#### cURL

```bash
curl http://localhost:3000/metrics
```

#### Required Parameters
_None_

#### Optional Parameters
_None_

#### ✅ Success Response `200 OK`

```
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="POST",route="/auth/login",status="200"} 3
...
# HELP http_request_duration_ms HTTP request duration in milliseconds
# TYPE http_request_duration_ms histogram
http_request_duration_ms_bucket{le="5",method="GET",route="/health",status="200"} 1
...
```

---

## BullBoard Queue UI

Visual dashboard for monitoring job queues in real time.

- **URL:** `http://localhost:3000/admin/queues`
- **Username:** `ADMIN_USER` from `.env` (default: `admin`)
- **Password:** `ADMIN_PASS` from `.env` (default: `changeme`)

---

## Webhooks

When a job has `callbackUrl` set, the worker will POST the result to that URL upon completion or failure.

**Signature header:** `x-chronos-signature`  
**Format:** Hex-encoded `HMAC-SHA256` of the raw JSON body using `WEBHOOK_SECRET` from `.env`

**Success payload:**
```json
{
  "jobId": "...",
  "status": "succeeded",
  "result": {}
}
```

**Failure payload:**
```json
{
  "jobId": "...",
  "status": "failed",
  "error": "Error message here"
}
```

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `3000` | HTTP server port |
| `NODE_ENV` | No | `development` | Node environment |
| `DATABASE_URL` | **Yes** | — | PostgreSQL connection string |
| `REDIS_HOST` | **Yes** | `localhost` | Redis hostname |
| `REDIS_PORT` | No | `6379` | Redis port |
| `REDIS_PASSWORD` | No | — | Redis password (if auth enabled) |
| `JWT_SECRET` | **Yes** | — | Secret for signing JWT tokens |
| `WEBHOOK_SECRET` | No | `change-me` | HMAC secret for webhook signatures |
| `ADMIN_USER` | No | `admin` | BullBoard basic auth username |
| `ADMIN_PASS` | No | `changeme` | BullBoard basic auth password |
| `WORKER_CONCURRENCY` | No | `5` | Number of parallel worker threads |
| `WORKER_QUEUE_NAME` | No | `job-queue` | Main BullMQ queue name |
| `WORKER_FAILED_QUEUE_NAME` | No | `job-queue-failed` | Dead-letter queue name |
| `JOB_ATTEMPTS` | No | `3` | Default max retry attempts |
| `JOB_BACKOFF_DELAY` | No | `2000` | Base backoff delay in ms |
| `SMTP_HOST` | No | — | SMTP server for email jobs |
| `SMTP_PORT` | No | `587` | SMTP port |
| `SMTP_USER` | No | — | SMTP username |
| `SMTP_PASS` | No | — | SMTP password |
| `FROM_EMAIL` | No | — | Sender email address |

---

## Job Statuses

| Status | Description |
|---|---|
| `pending` | Job created, waiting for scheduled time |
| `queued` | Job added to BullMQ, ready to run |
| `running` | Worker has picked up and is executing the job |
| `succeeded` | Job completed successfully |
| `failed` | Job failed after all retry attempts |
| `cancelled` | Job manually cancelled |

### Food Order Stage Statuses

| Status | Stage # | Email Subject |
|---|---|---|
| `order_processing` | 1 of 5 | 🛒 Your order is being processed! |
| `food_preparing` | 2 of 5 | 👨‍🍳 Your food is being prepared! |
| `food_ready` | 3 of 5 | ✅ Your food is ready for pickup! |
| `out_for_delivery` | 4 of 5 | 🚴 Your order is out for delivery! |
| `succeeded` | 5 of 5 (delivered) | 🎉 Your order has been delivered! |

---

## Notes

- BullMQ queue names **cannot contain `:`** — this project uses `job-queue` and `job-queue-failed`
- Jobs use **cursor-based pagination** for efficient large-dataset traversal
- The API server and worker are **separate processes** — run both for full functionality
- `food-order` jobs use **BullMQ stage chaining**: each stage handler schedules the next stage as a new delayed job. All stages share the same DB Job ID and audit trail.
- If SMTP is unavailable, the food-order stage still advances — email failure is logged but non-fatal
