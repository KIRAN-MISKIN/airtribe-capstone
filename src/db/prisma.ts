// Kept for TS consumers; JS runtime uses `src/db/prismaClient.js`.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
