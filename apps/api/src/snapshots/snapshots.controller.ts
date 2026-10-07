import {
  IdParamSchema,
  type IdParams,
  ImportResponseSchema,
  ProblemDetailsSchema,
  type SnapshotParams,
  SnapshotParamsSchema,
  type SnapshotPutRequest,
  SnapshotPutRequestSchema,
  SnapshotPutResponseSchema,
  SnapshotResponseSchema,
} from "@alihdrndm/blockpace-core";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
import { z } from "zod";
import { SnapshotsService } from "./snapshots.service.js";

const problem = (status: number, description: string) =>
  ApiResponse({ status, description, standardSchema: ProblemDetailsSchema });

/** CSV uploads larger than this are refused with 413 before any parsing happens. */
const MAX_IMPORT_BYTES = 1024 * 1024;

@ApiTags("snapshots")
@ApiSecurity("apiKey")
@problem(401, "Missing or wrong API key")
@problem(429, "Rate limited")
@Controller("v1/blocks/:id/snapshots")
export class SnapshotsController {
  constructor(
    @Inject(SnapshotsService) private readonly snapshots: SnapshotsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: "All snapshots of a block with their nights, oldest first",
  })
  @ApiResponse({
    status: 200,
    description: "The snapshots",
    standardSchema: z.array(SnapshotResponseSchema),
  })
  @problem(404, "NOT_FOUND")
  @problem(422, "VALIDATION_FAILED (id is not a UUID)")
  list(@Param({ schema: IdParamSchema }) params: IdParams) {
    return this.snapshots.list(params.id);
  }

  @Put(":asOfDate")
  @ApiOperation({
    summary: "Create or replace the pickup snapshot for one as-of date",
    description:
      "Re-evaluates the block in the same transaction; the response carries the new evaluation.",
  })
  @ApiResponse({
    status: 200,
    description: "The saved snapshot and the new evaluation",
    standardSchema: SnapshotPutResponseSchema,
  })
  @problem(400, "BAD_REQUEST (body is not valid JSON)")
  @problem(404, "NOT_FOUND")
  @problem(409, "SNAPSHOT_LIMIT")
  @problem(
    422,
    "VALIDATION_FAILED, SNAPSHOT_NIGHTS_MISMATCH, SNAPSHOT_IN_FUTURE or RESOLD_EXCEEDS_CONTRACTED",
  )
  put(
    @Param({ schema: SnapshotParamsSchema }) params: SnapshotParams,
    @Body({ schema: SnapshotPutRequestSchema }) body: SnapshotPutRequest,
  ) {
    return this.snapshots.put(params.id, params.asOfDate, body);
  }

  @Delete(":asOfDate")
  @HttpCode(204)
  @ApiOperation({ summary: "Delete one snapshot and re-evaluate the block" })
  @ApiResponse({ status: 204, description: "Deleted" })
  @problem(404, "NOT_FOUND (block or snapshot)")
  @problem(422, "VALIDATION_FAILED")
  async remove(
    @Param({ schema: SnapshotParamsSchema }) params: SnapshotParams,
  ): Promise<void> {
    await this.snapshots.remove(params.id, params.asOfDate);
  }

  @Post("import")
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: MAX_IMPORT_BYTES, files: 1 },
    }),
  )
  @ApiOperation({
    summary: "Import many snapshots from a CSV file (all or nothing)",
    description:
      "Header: as_of_date,night,picked_up[,resold] (any case). At most 1 MB.",
  })
  @ApiConsumes("multipart/form-data")
  // A multipart file has no Zod schema (it is bytes, not JSON), so this one is described by hand.
  @ApiBody({
    schema: {
      type: "object",
      required: ["file"],
      properties: { file: { type: "string", format: "binary" } },
    },
  })
  @ApiResponse({
    status: 200,
    description: "How many snapshots were saved",
    standardSchema: ImportResponseSchema,
  })
  @problem(404, "NOT_FOUND")
  @problem(409, "SNAPSHOT_LIMIT")
  @problem(413, "PAYLOAD_TOO_LARGE (file over 1 MB)")
  @problem(422, "IMPORT_INVALID (errors[].path is row <n>)")
  importCsv(
    @Param({ schema: IdParamSchema }) params: IdParams,
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ) {
    return this.snapshots.importCsv(params.id, file?.buffer);
  }
}
