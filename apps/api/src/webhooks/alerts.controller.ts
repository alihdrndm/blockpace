import {
  AlertEventSchema,
  AlertsQuerySchema,
  listOf,
  ProblemDetailsSchema,
} from "@alihdrndm/blockpace-core";
import { Controller, Get, Inject, Query } from "@nestjs/common";
import {
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
import { WebhooksService } from "./webhooks.service.js";

@ApiTags("alerts")
@ApiSecurity("apiKey")
@ApiResponse({
  status: 401,
  description: "Missing or wrong API key",
  standardSchema: ProblemDetailsSchema,
})
@ApiResponse({
  status: 429,
  description: "Rate limited",
  standardSchema: ProblemDetailsSchema,
})
@Controller("v1/alerts")
export class AlertsController {
  constructor(
    @Inject(WebhooksService) private readonly webhooks: WebhooksService,
  ) {}

  @Get()
  @ApiOperation({
    summary: "List alert events, newest first, optionally for one block",
  })
  @ApiResponse({
    status: 200,
    description: "A page of alerts",
    standardSchema: listOf(AlertEventSchema),
  })
  @ApiResponse({
    status: 422,
    description: "VALIDATION_FAILED",
    standardSchema: ProblemDetailsSchema,
  })
  list(
    @Query({ schema: AlertsQuerySchema }) query: {
      limit: number;
      cursor?: string;
      blockId?: string;
    },
  ) {
    return this.webhooks.listAlerts(query);
  }
}
