import {
  CreateWebhookEndpointRequestSchema,
  IdParamSchema,
  ListQuerySchema,
  listOf,
  ProblemDetailsSchema,
  WebhookDeliverySchema,
  WebhookEndpointCreatedSchema,
  WebhookEndpointSchema,
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
  Query,
} from "@nestjs/common";
import {
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
import { WebhooksService } from "./webhooks.service.js";

const problem = (status: number, description: string) =>
  ApiResponse({ status, description, standardSchema: ProblemDetailsSchema });

@ApiTags("webhooks")
@ApiSecurity("apiKey")
@problem(401, "Missing or wrong API key")
@problem(429, "Rate limited")
@Controller("v1/webhook-endpoints")
export class WebhookEndpointsController {
  constructor(
    @Inject(WebhooksService) private readonly webhooks: WebhooksService,
  ) {}

  @Post()
  @ApiOperation({
    summary: "Register a webhook URL",
    description:
      "The response contains the signing secret. It is shown only here, never again.",
  })
  @ApiResponse({
    status: 201,
    description: "The endpoint and its secret",
    standardSchema: WebhookEndpointCreatedSchema,
  })
  @problem(422, "VALIDATION_FAILED or WEBHOOK_URL_NOT_ALLOWED")
  create(
    @Body({ schema: CreateWebhookEndpointRequestSchema }) body: { url: string },
  ) {
    return this.webhooks.createEndpoint(body.url);
  }

  @Get()
  @ApiOperation({
    summary: "List webhook endpoints (without secrets), newest first",
  })
  @ApiResponse({
    status: 200,
    description: "A page of endpoints",
    standardSchema: listOf(WebhookEndpointSchema),
  })
  @problem(422, "VALIDATION_FAILED (bad limit or cursor)")
  list(
    @Query({ schema: ListQuerySchema }) query: {
      limit: number;
      cursor?: string;
    },
  ) {
    return this.webhooks.listEndpoints(query);
  }

  @Delete(":id")
  @HttpCode(204)
  @ApiOperation({
    summary: "Delete a webhook endpoint and its queued deliveries",
  })
  @ApiResponse({ status: 204, description: "Deleted" })
  @problem(404, "NOT_FOUND")
  @problem(422, "VALIDATION_FAILED (id is not a UUID)")
  async remove(
    @Param({ schema: IdParamSchema }) params: { id: string },
  ): Promise<void> {
    await this.webhooks.removeEndpoint(params.id);
  }

  @Post(":id/test")
  @HttpCode(202)
  @ApiOperation({ summary: "Queue a PING delivery to this endpoint" })
  @ApiResponse({
    status: 202,
    description: "The queued delivery",
    standardSchema: WebhookDeliverySchema,
  })
  @problem(404, "NOT_FOUND")
  @problem(422, "VALIDATION_FAILED (id is not a UUID)")
  sendTest(@Param({ schema: IdParamSchema }) params: { id: string }) {
    return this.webhooks.sendTest(params.id);
  }
}
