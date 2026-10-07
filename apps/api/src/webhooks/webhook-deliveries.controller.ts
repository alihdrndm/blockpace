import {
  DeliveriesQuerySchema,
  listOf,
  ProblemDetailsSchema,
  WebhookDeliverySchema,
} from "@alihdrndm/blockpace-core";
import { Controller, Get, Inject, Query } from "@nestjs/common";
import {
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
import { WebhooksService } from "./webhooks.service.js";

@ApiTags("webhooks")
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
@Controller("v1/webhook-deliveries")
export class WebhookDeliveriesController {
  constructor(
    @Inject(WebhooksService) private readonly webhooks: WebhooksService,
  ) {}

  @Get()
  @ApiOperation({
    summary: "List webhook deliveries, newest first, by status or endpoint",
  })
  @ApiResponse({
    status: 200,
    description: "A page of deliveries",
    standardSchema: listOf(WebhookDeliverySchema),
  })
  @ApiResponse({
    status: 422,
    description: "VALIDATION_FAILED",
    standardSchema: ProblemDetailsSchema,
  })
  list(
    @Query({ schema: DeliveriesQuerySchema })
    query: {
      limit: number;
      cursor?: string;
      status?: "pending" | "delivered" | "failed";
      endpointId?: string;
    },
  ) {
    return this.webhooks.listDeliveries(query);
  }
}
