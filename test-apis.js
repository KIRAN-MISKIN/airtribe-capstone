require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { createApp } = require('./src/app');
const { prisma } = require('./src/db/prismaClient');
const { connection } = require('./src/config/redis');

let server;
const PORT = 3005;
const BASE_URL = `http://localhost:${PORT}`;

let token;
let createdJobId;

test.before(async () => {
  const app = createApp();
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(PORT, resolve));
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
  await connection.quit();
});

test('Health check', async () => {
  const res = await fetch(`${BASE_URL}/health`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.ok, true);
});

test('Auth Register and Login', async () => {
  const randomUser = `testuser_${Date.now()}`;
  
  // Register
  const regRes = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: randomUser, password: 'password123' })
  });
  const regText = await regRes.text();
  if (regRes.status !== 201) {
    console.error('Register failed:', regText);
  }
  assert.strictEqual(regRes.status, 201);
  const regData = JSON.parse(regText);
  assert.strictEqual(regData.message, 'User created');

  // Login
  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: randomUser, password: 'password123' })
  });
  assert.strictEqual(loginRes.status, 200);
  const loginData = await loginRes.json();
  assert.ok(loginData.token);
  token = loginData.token;
});

test('Create Job', async () => {
  const jobPayload = {
    type: "email",
    payload: {
      to: "test@example.com",
      subject: "Test Subject",
      body: "Test Body"
    },
    scheduleAt: new Date(Date.now() + 100000).toISOString(),
    priority: 2
  };

  const res = await fetch(`${BASE_URL}/jobs`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(jobPayload)
  });
  
  assert.strictEqual(res.status, 201);
  const data = await res.json();
  assert.ok(data.job);
  assert.ok(data.job.id);
  assert.strictEqual(data.job.type, 'email');
  createdJobId = data.job.id;
});

test('List Jobs', async () => {
  const res = await fetch(`${BASE_URL}/jobs`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data.jobs));
});

test('Get Job', async () => {
  const res = await fetch(`${BASE_URL}/jobs/${createdJobId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.job.id, createdJobId);
});

test('Get Job Events', async () => {
  const res = await fetch(`${BASE_URL}/jobs/${createdJobId}/events`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.jobId, createdJobId);
  assert.ok(Array.isArray(data.events));
});

test('Reschedule Job', async () => {
  const newSchedule = new Date(Date.now() + 200000).toISOString();
  const res = await fetch(`${BASE_URL}/jobs/${createdJobId}`, {
    method: 'PATCH',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ scheduleAt: newSchedule, priority: 1 })
  });
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.job.priority, 1);
  // Compare times using Date objects since ISO string formats might slightly differ in precision
  assert.strictEqual(new Date(data.job.scheduleAt).getTime(), new Date(newSchedule).getTime());
});

test('Cancel Job', async () => {
  const res = await fetch(`${BASE_URL}/jobs/${createdJobId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.message, 'Job cancelled successfully');

  // Verify status
  const jobRes = await fetch(`${BASE_URL}/jobs/${createdJobId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const jobData = await jobRes.json();
  assert.strictEqual(jobData.job.status, 'cancelled');
});

test('Create Recurring Job', async () => {
  const jobPayload = {
    type: "report",
    payload: {
      reportType: "system_health",
      outputPath: "/tmp/report.json"
    },
    cron: "0 9 * * 1",
    priority: 5
  };

  const res = await fetch(`${BASE_URL}/jobs`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(jobPayload)
  });
  
  assert.strictEqual(res.status, 201);
  const data = await res.json();
  assert.strictEqual(data.job.cron, '0 9 * * 1');
});

test('Get Stats', async () => {
  const res = await fetch(`${BASE_URL}/jobs/stats`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.ok(data.totalCount !== undefined);
});

test('Get Metrics', async () => {
  const res = await fetch(`${BASE_URL}/metrics`);
  assert.strictEqual(res.status, 200);
  const text = await res.text();
  assert.ok(text.includes('http_request_duration_ms'));
});
