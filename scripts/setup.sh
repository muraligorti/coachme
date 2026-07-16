#!/bin/bash
echo "FIT:OS NEXUS — Production Setup"
echo "1. cp .env.example .env && edit values"
echo "2. docker-compose up -d postgres redis"
echo "3. cd backend && npm install && npx prisma db push && node prisma/seed.js"
echo "4. cd frontend && npm install && npm run dev"
echo "5. Demo: admin@fitos-nexus.com / Admin123!"
