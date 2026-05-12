const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { prisma } = require('../db/prismaClient');
const { env } = require('../config/env'); // assuming env has JWT_SECRET, but let's default to something if not

// We need a JWT secret, use env.jwtSecret or fallback
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-for-chronos-123';

async function register(req, res) {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return res.status(400).json({ error: 'User already exists' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: { username, password: hashedPassword }
  });

  res.status(201).json({ message: 'User created' });
}

async function login(req, res) {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '1d' });
  res.json({ token });
}

module.exports = { register, login, JWT_SECRET };
