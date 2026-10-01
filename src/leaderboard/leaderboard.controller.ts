import { Controller, Get, Query } from '@nestjs/common'
import { z } from 'zod'
import { ZodPipe } from '../infra/zod.pipe.js'
import { LeaderboardService } from './leaderboard.service.js'

const Query_ = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) })

@Controller('leaderboard')
export class LeaderboardController {
  constructor (private readonly leaderboard: LeaderboardService) {}

  @Get()
  async top (@Query(new ZodPipe(Query_)) q: z.infer<typeof Query_>) {
    return { items: await this.leaderboard.top(q.limit) }
  }
}
