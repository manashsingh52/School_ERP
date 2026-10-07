import { type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * Validates and transforms input with a schema from @schoolos/contracts — the same schema the
 * web forms use. Unknown fields are stripped by Zod's default object behaviour.
 * ZodErrors are turned into 422 VALIDATION_FAILED by the global filter.
 *
 *   @Body(new ZodPipe(createStudentSchema)) body: z.output<typeof createStudentSchema>
 */
export class ZodPipe<T extends ZodType> implements PipeTransform {
  constructor(private readonly schema: T) {}

  transform(value: unknown) {
    return this.schema.parse(value ?? {});
  }
}
