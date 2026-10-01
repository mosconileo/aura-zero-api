import { Body, Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { AuthGuard, type AuthedPlayer, CurrentPlayer } from '../auth/auth.guard.js'
import { ZodPipe } from '../infra/zod.pipe.js'
import { type PageQuery, PageQuerySchema } from '../matches/matches.schema.js'
import { FightersService } from './fighters.service.js'

const ReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
})

@Controller('fighters')
export class FightersController {
  constructor (private readonly fighters: FightersService) {}

  @Get()
  async list () {
    return { items: await this.fighters.list() }
  }

  @Get(':id/reviews')
  reviews (@Param('id') id: string, @Query(new ZodPipe(PageQuerySchema)) q: PageQuery) {
    return this.fighters.reviews(id, q)
  }

  @Put(':id/review')
  @UseGuards(AuthGuard)
  review (
    @CurrentPlayer() player: AuthedPlayer,
    @Param('id') id: string,
    @Body(new ZodPipe(ReviewSchema)) body: z.infer<typeof ReviewSchema>,
  ) {
    return this.fighters.upsertReview(player.id, id, body)
  }
}
