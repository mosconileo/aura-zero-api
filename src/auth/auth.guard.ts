import {
  type CanActivate, createParamDecorator, type ExecutionContext, Injectable, UnauthorizedException,
} from '@nestjs/common'
import type { Request } from 'express'
import { PrismaService } from '../infra/prisma.service.js'
import { hashToken } from './token.js'

export interface AuthedPlayer { id: string; nickname: string }

type AuthedRequest = Request & { player?: AuthedPlayer }

@Injectable()
export class AuthGuard implements CanActivate {
  constructor (private readonly prisma: PrismaService) {}

  async canActivate (ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>()
    const [scheme, token] = (req.headers.authorization ?? '').split(' ')
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException({ error: 'missing_token' })

    const player = await this.prisma.player.findUnique({
      where: { tokenHash: hashToken(token) },
      select: { id: true, nickname: true },
    })
    if (!player) throw new UnauthorizedException({ error: 'invalid_token' })

    req.player = player
    return true
  }
}

export const CurrentPlayer = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthedPlayer => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().player!
})
