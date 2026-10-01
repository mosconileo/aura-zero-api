import { Body, Controller, Get, HttpStatus, Param, Post, Query, Res, UseGuards } from '@nestjs/common'
import type { Response } from 'express'
import { AuthGuard, type AuthedPlayer, CurrentPlayer } from '../auth/auth.guard.js'
import { ZodPipe } from '../infra/zod.pipe.js'
import { type CreateMatch, CreateMatchSchema, type PageQuery, PageQuerySchema } from './matches.schema.js'
import { MatchesService } from './matches.service.js'

@Controller()
export class MatchesController {
  constructor (private readonly matches: MatchesService) {}

  /** 201 na primeira gravação; 200 com a mesma luta em reenvio idempotente. */
  @Post('matches')
  @UseGuards(AuthGuard)
  async create (
    @CurrentPlayer() player: AuthedPlayer,
    @Body(new ZodPipe(CreateMatchSchema)) body: CreateMatch,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { match, created } = await this.matches.record(player.id, body)
    res.status(created ? HttpStatus.CREATED : HttpStatus.OK)
    return match
  }

  @Get('players/:id/matches')
  list (@Param('id') playerId: string, @Query(new ZodPipe(PageQuerySchema)) q: PageQuery) {
    return this.matches.listForPlayer(playerId, q)
  }
}
