import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client.js'
import { ACHIEVEMENTS, FIGHTERS } from '../src/domain/catalog.js'

// Idempotente: pode rodar a cada deploy.
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

for (const f of FIGHTERS) {
  await prisma.fighter.upsert({ where: { id: f.id }, update: { name: f.name }, create: f })
}
for (const a of ACHIEVEMENTS) {
  await prisma.achievement.upsert({ where: { code: a.code }, update: a, create: a })
}
console.log(`seed: ${FIGHTERS.length} lutadores, ${ACHIEVEMENTS.length} conquistas`)
await prisma.$disconnect()
