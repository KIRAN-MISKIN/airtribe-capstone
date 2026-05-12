# Chronos (Chromos Capstone)

A job scheduling system using **Express + BullMQ + Redis + Prisma (Postgres)**.

## Features

- Job scheduling with delay (`scheduleAt`)
- **Priority** (lower number = higher priority)
- **Retry + backoff**, and **dead-letter queue** for exhausted jobs
- **Audit trail** (`JobEvent`) for lifecycle transitions
- Optional **webhook callbacks** with **HMAC signature**
- **BullBoard** queue UI at `/admin/queues` (basic auth)
- Observability: request IDs, response time headers, structured logs, `/metrics` (Prometheus)

## Requirements

- Node.js 18+ (Node 20+ recommended)
- Redis
- Postgres

## Setup

1. Install deps

```bash
npm install
```

2. Create env file

```bash
copy .env.example .env
```

3. Run migrations + generate Prisma client

```bash
npm run prisma:migrate
```

## Run

### API server

```bash
npm run dev
```

### Worker

```bash
npm run worker
```

## API quickstart

### Create a job

```cmd
curl -X POST http://localhost:3000/jobs ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer <your-token>" ^
  -d "{\"type\":\"generic\",\"payload\":{\"durationMs\":500},\"scheduleAt\":\"2026-05-09T10:00:00.000Z\",\"priority\":3,\"tags\":[\"demo\"],\"maxAttempts\":3}"
```

### List jobs

```cmd
curl "http://localhost:3000/jobs?limit=10&tag=demo" -H "Authorization: Bearer <your-token>"
```

### Job events (audit trail)

```cmd
curl "http://localhost:3000/jobs/<jobId>/events" -H "Authorization: Bearer <your-token>"
```

### Dead-letter browsing + retry

```cmd
curl "http://localhost:3000/jobs/dead-letter" -H "Authorization: Bearer <your-token>"
curl -X POST "http://localhost:3000/jobs/<jobId>/retry-dead" -H "Authorization: Bearer <your-token>"
```

### Stats + metrics

```cmd
curl "http://localhost:3000/jobs/stats" -H "Authorization: Bearer <your-token>"
curl "http://localhost:3000/metrics"
```

### BullBoard

- URL: `http://localhost:3000/admin/queues`
- Credentials: `ADMIN_USER` / `ADMIN_PASS` from `.env`

## Note on queue names

BullMQ queue names **cannot contain `:`**. This project uses `job-queue` and `job-queue-failed` by default.

## Webhooks

If a job has `callbackUrl`, the worker POSTs success/failure payloads to it with header:

- `x-chronos-signature`: hex HMAC-SHA256 of the raw JSON body using `WEBHOOK_SECRET`

## API Documentation & Examples

*Note: For Windows Command Prompt (`cmd.exe`), use double quotes for the JSON body and escape internal double quotes with `\`, as shown in the `curl` commands below. Ensure you have obtained a valid JWT token via `/auth/login` and replace `<your-token>`.*

### 1. Register User (Auth)
**Success Response (201 Created):**
```json
{
  "message": "User created"
}
```
**Fail Response (400 Bad Request):**
```json
{
  "error": "User already exists"
}
```
**Windows CMD:**
```cmd
curl -X POST http://localhost:3000/auth/register -H "Content-Type: application/json" -d "{\"username\":\"admin\",\"password\":\"changeme\"}"
```

### 2. Login User (Auth)
**Success Response (200 OK):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5..."
}
```
**Fail Response (401 Unauthorized):**
```json
{
  "error": "Invalid credentials"
}
```
**Windows CMD:**
```cmd
curl -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" -d "{\"username\":\"admin\",\"password\":\"changeme\"}"
```

### 3. Create Email Job
**Request Body:**
```json
{
  "type": "email",
  "payload": {
    "to": "test@example.com",
    "subject": "Hello from Chronos",
    "body": "This is a test email sent via the job scheduler."
  },
  "priority": 2,
  "maxAttempts": 3,
  "tags": ["email"]
}
```
**Success Response (201 Created):**
```json
{
  "job": {
    "id": "uuid-here",
    "type": "email",
    "status": "queued",
    "priority": 2
  }
}
```
**Fail Response (400 Bad Request):**
```json
{
  "error": "type and scheduleAt (or cron) are required"
}
```
**Windows CMD:**
```cmd
curl -X POST http://localhost:3000/jobs -H "Content-Type: application/json" -H "Authorization: Bearer <your-token>" -d "{\"type\":\"email\",\"payload\":{\"to\":\"test@example.com\",\"subject\":\"Hello from Chronos\",\"body\":\"This is a test email sent via the job scheduler.\"},\"priority\":2,\"maxAttempts\":3,\"tags\":[\"email\"]}"
```

### 4. Create Report Job (Scheduled)
**Request Body:**
```json
{
  "type": "report",
  "payload": {
    "reportType": "weekly_sales",
    "userId": "user_abc123",
    "dateRange": { "from": "2026-05-05", "to": "2026-05-11" },
    "format": "json",
    "outputPath": "/tmp/reports/weekly.json"
  },
  "scheduleAt": "2026-05-16T09:00:00Z",
  "priority": 5,
  "tags": ["report", "weekly"]
}
```
**Success Response (201 Created):**
```json
{
  "job": { "id": "uuid", "type": "report", "status": "queued" }
}
```
**Fail Response (401 Unauthorized):**
```json
{
  "error": "Invalid or expired token"
}
```
**Windows CMD:**
```cmd
curl -X POST http://localhost:3000/jobs -H "Content-Type: application/json" -H "Authorization: Bearer <your-token>" -d "{\"type\":\"report\",\"payload\":{\"reportType\":\"weekly_sales\",\"userId\":\"user_abc123\",\"dateRange\":{\"from\":\"2026-05-05\",\"to\":\"2026-05-11\"},\"format\":\"json\",\"outputPath\":\"/tmp/reports/weekly.json\"},\"scheduleAt\":\"2026-05-16T09:00:00Z\",\"priority\":5,\"tags\":[\"report\",\"weekly\"]}"
```

### 5. Create Webhook Job
**Request Body:**
```json
{
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
}
```
**Windows CMD:**
```cmd
curl -X POST http://localhost:3000/jobs -H "Content-Type: application/json" -H "Authorization: Bearer <your-token>" -d "{\"type\":\"webhook\",\"payload\":{\"url\":\"https://webhook.site/your-unique-id\",\"method\":\"POST\",\"headers\":{\"X-Chronos-Event\":\"order.placed\"},\"body\":{\"orderId\":\"ord_001\",\"amount\":1999},\"timeoutMs\":5000},\"priority\":1,\"maxAttempts\":5,\"tags\":[\"webhook\",\"order\"]}"
```

### 6. Create Recurring Report Job
**Request Body:**
```json
{
  "type": "report",
  "payload": {
    "reportType": "system_health",
    "userId": "system",
    "dateRange": { "from": "auto", "to": "auto" }
  },
  "cron": "0 9 * * 1",
  "priority": 5,
  "tags": ["report", "recurring", "health"]
}
```
**Fail Response (400 Bad Request):**
```json
{
  "error": "scheduleAt and cron are mutually exclusive"
}
```
**Windows CMD:**
```cmd
curl -X POST http://localhost:3000/jobs -H "Content-Type: application/json" -H "Authorization: Bearer <your-token>" -d "{\"type\":\"report\",\"payload\":{\"reportType\":\"system_health\",\"userId\":\"system\",\"dateRange\":{\"from\":\"auto\",\"to\":\"auto\"}},\"cron\":\"0 9 * * 1\",\"priority\":5,\"tags\":[\"report\",\"recurring\",\"health\"]}"
```

### 7. Cancel Job
**Success Response (200 OK):**
```json
{
  "message": "Job cancelled successfully",
  "jobId": "uuid-here"
}
```
**Fail Response (400 Bad Request):**
```json
{
  "error": "Cannot cancel a job with status 'completed'"
}
```
**Windows CMD:**
```cmd
curl -X DELETE http://localhost:3000/jobs/<job-uuid> -H "Authorization: Bearer <your-token>"
```

### 8. Reschedule Job
**Request Body:**
```json
{
  "scheduleAt": "2026-05-20T14:00:00Z",
  "priority": 1
}
```
**Success Response (200 OK):**
```json
{
  "job": {
    "id": "uuid-here",
    "scheduleAt": "2026-05-20T14:00:00.000Z",
    "priority": 1
  }
}
```
**Fail Response (400 Bad Request):**
```json
{
  "error": "Cannot reschedule a job with status 'completed'. Must be pending or queued."
}
```
**Windows CMD:**
```cmd
curl -X PATCH http://localhost:3000/jobs/<job-uuid> -H "Content-Type: application/json" -H "Authorization: Bearer <your-token>" -d "{\"scheduleAt\":\"2026-05-20T14:00:00Z\",\"priority\":1}"
```
