import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { AuthGuard, type AuthedPlayer, CurrentPlayer } from '../auth/auth.guard.js'
import { ZodPipe } from '../infra/zod.pipe.js'
import { PlayersService } from './players.service.js'

const RegisterSchema = z.object({
  nickname: z.string().trim().regex(/^[A-Za-z0-9_]{3,16}$/, '3 a 16 caracteres: letras, numeros ou _'),
})

@Controller('players')
export class PlayersController {
  constructor (private readonly players: PlayersService) {}

  @Post()
  register (@Body(new ZodPipe(RegisterSchema)) body: z.infer<typeof RegisterSchema>) {
    return this.players.register(body.nickname)
  }

  // Rotas /me antes de /:id para não serem capturadas como id = "me".
  @Get('me')
  @UseGuards(AuthGuard)
  me (@CurrentPlayer() player: AuthedPlayer) {
    return this.players.profile(player.id)
  }

  @Get('me/achievements')
  @UseGuards(AuthGuard)
  myAchievements (@CurrentPlayer() player: AuthedPlayer) {
    return this.players.achievements(player.id)
  }

  @Get(':id')
  profile (@Param('id') id: string) {
    return this.players.profile(id)
  }

  @Get(':id/achievements')
  achievements (@Param('id') id: string) {
    return this.players.achievements(id)
  }
}
