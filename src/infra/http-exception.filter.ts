import {
  type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Logger,
} from '@nestjs/common'
import * as Sentry from '@sentry/nestjs'
import type { Response } from 'express'
import { Prisma } from '../generated/prisma/client.js'

/**
 * Formato único de erro: { statusCode, error, message?, issues? }.
 * Erros conhecidos do Prisma viram 4xx; o resto é 500 genérico + Sentry
 * (detalhe interno nunca vaza para o cliente).
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpExceptionFilter')

  catch (exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>()

    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const body = exception.getResponse()
      res.status(status).json(
        typeof body === 'string'
          ? { statusCode: status, error: body }
          : { statusCode: status, ...(body as object) },
      )
      return
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        res.status(HttpStatus.CONFLICT).json({ statusCode: 409, error: 'conflict' })
        return
      }
      if (exception.code === 'P2025') {
        res.status(HttpStatus.NOT_FOUND).json({ statusCode: 404, error: 'not_found' })
        return
      }
    }

    this.logger.error(exception)
    Sentry.captureException(exception)
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ statusCode: 500, error: 'internal_error' })
  }
}
