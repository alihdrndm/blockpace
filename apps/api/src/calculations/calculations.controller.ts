import {
  BlockSchema,
  type CalculationRequest,
  CalculationRequestSchema,
  compareDates,
  type Evaluation,
  EvaluationSchema,
  evaluate,
  type IsoDate,
  ProblemDetailsSchema,
  SnapshotSchema,
} from "@alihdrndm/blockpace-core";
import { Body, Controller, HttpCode, Inject, Post } from "@nestjs/common";
import {
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
import { ClockService } from "../clock/clock.service.js";
import { ProblemException } from "../errors/problem.js";

@ApiTags("calculations")
@ApiSecurity("apiKey")
@Controller("v1/calculations")
export class CalculationsController {
  // Explicit @Inject: Vitest compiles without decorator metadata, so type-based injection would fail.
  constructor(@Inject(ClockService) private readonly clock: ClockService) {}

  /** Stateless: nothing is stored. The pickup sent is treated as one snapshot taken "today". */
  @Post("attrition")
  @HttpCode(200)
  @ApiOperation({
    summary: "Calculate attrition damages for a block without saving it",
  })
  @ApiResponse({
    status: 200,
    description: "The evaluation",
    standardSchema: EvaluationSchema,
  })
  @ApiResponse({
    status: 400,
    description: "BAD_REQUEST (body is not valid JSON)",
    standardSchema: ProblemDetailsSchema,
  })
  @ApiResponse({
    status: 401,
    description: "Missing or wrong API key",
    standardSchema: ProblemDetailsSchema,
  })
  @ApiResponse({
    status: 422,
    description: "VALIDATION_FAILED or RESOLD_EXCEEDS_CONTRACTED",
    standardSchema: ProblemDetailsSchema,
  })
  @ApiResponse({
    status: 429,
    description: "Rate limited",
    standardSchema: ProblemDetailsSchema,
  })
  calculate(
    @Body({ schema: CalculationRequestSchema }) request: CalculationRequest,
  ): Evaluation {
    const over = request.nights.filter(
      (night) => night.resoldRooms > night.contractedRooms,
    );
    if (over.length > 0) {
      throw new ProblemException(
        422,
        "RESOLD_EXCEEDS_CONTRACTED",
        "Resold rooms exceed contracted rooms",
        `Resold rooms are more than contracted rooms on ${over.map((n) => n.date).join(", ")}.`,
      );
    }

    const today = request.today ?? this.clock.today();
    const firstNight = [...request.nights].sort((a, b) =>
      compareDates(a.date, b.date),
    )[0]?.date;
    const block = BlockSchema.parse({
      currency: request.currency,
      cutoffDate: request.cutoffDate ?? (firstNight as IsoDate),
      terms: request.terms,
      nights: request.nights.map(({ date, contractedRooms, rateMinor }) => ({
        date,
        contractedRooms,
        rateMinor,
      })),
    });
    const snapshot = SnapshotSchema.parse({
      asOfDate: today,
      nights: request.nights.map(({ date, pickedUpRooms, resoldRooms }) => ({
        date,
        pickedUpRooms,
        resoldRooms,
      })),
    });
    return evaluate({ block, snapshots: [snapshot], today });
  }
}
