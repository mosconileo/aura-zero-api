import { BadRequestException, type PipeTransform } from '@nestjs/common'
import { z } from 'zod'

/** Valida e transforma (coerção, defaults) body/query com um schema zod. */
export class ZodPipe<S extends z.ZodType> implements PipeTransform<unknown, z.infer<S>> {
  constructor (private readonly schema: S) {}

  transform (value: unknown): z.infer<S> {
    const result = this.schema.safeParse(value)
    if (!result.success) {
      throw new BadRequestException({
        error: 'validation_failed',
        issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      })
    }
    return result.data
  }
}
