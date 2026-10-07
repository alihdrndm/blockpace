import {
  BlockListItemSchema,
  BlockResponseSchema,
  type BlocksQuery,
  BlocksQuerySchema,
  type CreateBlockRequest,
  CreateBlockRequestSchema,
  type EvaluationQuery,
  EvaluationQuerySchema,
  EvaluationSchema,
  IdParamSchema,
  type IdParams,
  listOf,
  PaceResponseSchema,
  type PatchBlockRequest,
  PatchBlockRequestSchema,
  ProblemDetailsSchema,
} from "@alihdrndm/blockpace-core";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
import { BlocksService } from "./blocks.service.js";

const problem = (status: number, description: string) =>
  ApiResponse({ status, description, standardSchema: ProblemDetailsSchema });

@ApiTags("blocks")
@ApiSecurity("apiKey")
@problem(401, "Missing or wrong API key")
@problem(429, "Rate limited")
@Controller("v1/blocks")
export class BlocksController {
  constructor(@Inject(BlocksService) private readonly blocks: BlocksService) {}

  @Post()
  @ApiOperation({
    summary: "Create a room block with its nights and attrition terms",
  })
  @ApiResponse({
    status: 201,
    description: "The created block",
    standardSchema: BlockResponseSchema,
  })
  @problem(400, "BAD_REQUEST (body is not valid JSON)")
  @problem(
    422,
    "VALIDATION_FAILED (including nights not consecutive or cutoff after the first night)",
  )
  create(
    @Body({ schema: CreateBlockRequestSchema }) request: CreateBlockRequest,
  ) {
    return this.blocks.create(request);
  }

  @Get()
  @ApiOperation({
    summary: "List blocks, newest first, each with today's risk summary",
  })
  @ApiResponse({
    status: 200,
    description: "A page of blocks",
    standardSchema: listOf(BlockListItemSchema),
  })
  @problem(422, "VALIDATION_FAILED (bad limit, cursor or status)")
  list(@Query({ schema: BlocksQuerySchema }) query: BlocksQuery) {
    return this.blocks.list(query);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get one block with its nights and terms" })
  @ApiResponse({
    status: 200,
    description: "The block",
    standardSchema: BlockResponseSchema,
  })
  @problem(404, "NOT_FOUND")
  @problem(422, "VALIDATION_FAILED (id is not a UUID)")
  get(@Param({ schema: IdParamSchema }) params: IdParams) {
    return this.blocks.get(params.id);
  }

  @Get(":id/evaluation")
  @ApiOperation({
    summary:
      "Evaluate the block now (or as of a date) without storing anything",
  })
  @ApiResponse({
    status: 200,
    description: "The evaluation",
    standardSchema: EvaluationSchema,
  })
  @problem(404, "NOT_FOUND")
  @problem(422, "VALIDATION_FAILED (bad id or asOf)")
  evaluation(
    @Param({ schema: IdParamSchema }) params: IdParams,
    @Query({ schema: EvaluationQuerySchema }) query: EvaluationQuery,
  ) {
    return this.blocks.evaluation(params.id, query.asOf);
  }

  @Get(":id/pace")
  @ApiOperation({
    summary: "Pickup over time: one evaluated point per snapshot",
  })
  @ApiResponse({
    status: 200,
    description: "The pace series",
    standardSchema: PaceResponseSchema,
  })
  @problem(404, "NOT_FOUND")
  @problem(422, "VALIDATION_FAILED (id is not a UUID)")
  pace(@Param({ schema: IdParamSchema }) params: IdParams) {
    return this.blocks.pace(params.id);
  }

  @Patch(":id")
  @ApiOperation({
    summary:
      "Change name, hotel, cutoff date, status or terms (nights are fixed)",
    description:
      "A change to terms or cutoffDate re-evaluates the block in the same transaction and may raise alerts.",
  })
  @ApiResponse({
    status: 200,
    description: "The updated block",
    standardSchema: BlockResponseSchema,
  })
  @problem(400, "BAD_REQUEST (body is not valid JSON)")
  @problem(404, "NOT_FOUND")
  @problem(
    422,
    "VALIDATION_FAILED (empty body, unknown key such as nights, or cutoff after the first night)",
  )
  patch(
    @Param({ schema: IdParamSchema }) params: IdParams,
    @Body({ schema: PatchBlockRequestSchema }) patch: PatchBlockRequest,
  ) {
    return this.blocks.patch(params.id, patch);
  }

  @Delete(":id")
  @HttpCode(204)
  @ApiOperation({ summary: "Delete a block and everything recorded for it" })
  @ApiResponse({ status: 204, description: "Deleted" })
  @problem(404, "NOT_FOUND")
  @problem(422, "VALIDATION_FAILED (id is not a UUID)")
  async remove(
    @Param({ schema: IdParamSchema }) params: IdParams,
  ): Promise<void> {
    await this.blocks.remove(params.id);
  }
}
