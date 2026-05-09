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

```bash
curl -X POST http://localhost:3000/jobs ^
  -H "Content-Type: application/json" ^
  -d "{\"type\":\"generic\",\"payload\":{\"durationMs\":500},\"scheduleAt\":\"2026-05-09T10:00:00.000Z\",\"priority\":3,\"tags\":[\"demo\"],\"maxAttempts\":3}"
```

### List jobs

```bash
curl "http://localhost:3000/jobs?limit=10&tag=demo"
```

### Job events (audit trail)

```bash
curl "http://localhost:3000/jobs/<jobId>/events"
```

### Dead-letter browsing + retry

```bash
curl "http://localhost:3000/jobs/dead-letter"
curl -X POST "http://localhost:3000/jobs/<jobId>/retry-dead"
```

### Stats + metrics

```bash
curl "http://localhost:3000/jobs/stats"
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

