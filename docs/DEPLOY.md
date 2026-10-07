# Deploying to AWS (optional)

blockpace is deploy-ready with [SST v3](https://sst.dev/docs). Nothing is deployed automatically: CI never deploys, and the project was never deployed while it was built. Deploying creates AWS resources **that cost money while they exist**, so read the list below first and remove the stage when you are done.

## Prerequisites

- An AWS account you control, with permission to create VPCs, ECS, RDS, load balancers, S3, CloudFront, Lambda and IAM roles.
- AWS credentials on your machine: `aws configure` or `aws sso login`. SST uses the default credential chain ([guide](https://sst.dev/docs/iam-credentials)).
- Docker running locally: SST builds the API and worker images from `apps/api/Dockerfile` and `apps/worker/Dockerfile`.
- `pnpm install` done at the repo root.

## Commands

```bash
# 1. Set the API key for the stage once (any long random string; never commit it).
pnpm sst secret set ApiKey "$(openssl rand -hex 32)" --stage dev

# 2. Deploy. Prints the API and web URLs at the end.
pnpm sst deploy --stage dev

# 3. Remove everything when you are done (stops the billing).
pnpm sst remove --stage dev
```

Use a stage other than `production` for experiments. In the `production` stage the config sets `removal: "retain"` and `protect: true`: `sst remove` keeps the database and other data-holding resources, and protected resources refuse to be deleted until you change that setting.

**Migrations run from the API container at start** (`RUN_MIGRATIONS=true`), so every deploy brings the database schema up to date before the API serves traffic. The demo seed data is **not** loaded in AWS.

## What the config creates

Defined in `sst.config.ts` and `infra/*.ts`, all in `us-east-1`.

| Resource | Defined in | Bills continuously? |
|---|---|---|
| VPC with public and private subnets, route tables, security groups | `infra/network.ts` (`sst.aws.Vpc`) | No (the VPC itself is free) |
| NAT instance (EC2, SST `nat: "ec2"`) so private containers can reach the internet for webhooks | `infra/network.ts` | **Yes**: an EC2 instance runs all the time |
| RDS PostgreSQL 17 instance and its storage | `infra/database.ts` (`sst.aws.Postgres`) | **Yes**: instance hours and storage |
| ECS cluster | `infra/api.ts` (`sst.aws.Cluster`) | No |
| Fargate service `Api` (container port 4020) | `infra/api.ts` (`sst.aws.Service`) | **Yes**: the task runs all the time |
| Application Load Balancer in front of `Api` (HTTP 80 → 4020, health check `/healthz`) | `infra/api.ts` | **Yes**: hourly plus capacity units |
| Fargate service `Worker` (no load balancer) | `infra/api.ts` | **Yes**: the task runs all the time |
| ECR repositories for the two images | created by `sst.aws.Service` | Storage for the images |
| CloudWatch log groups for the services | created by `sst.aws.Service` | Per GB ingested and stored |
| Next.js site: Lambda functions, S3 bucket for assets, CloudFront distribution | `infra/web.ts` (`sst.aws.Nextjs`) | Mostly per request; small storage |
| SST secret `ApiKey` (SSM Parameter Store) | `infra/secrets.ts` (`sst.Secret`) | Standard parameters are free |
| IAM roles and policies for the services and functions | created by SST | No |

## Pricing pages

Check current prices for your region before deploying:

- [Amazon RDS for PostgreSQL](https://aws.amazon.com/rds/postgresql/pricing/)
- [AWS Fargate](https://aws.amazon.com/fargate/pricing/)
- [Elastic Load Balancing](https://aws.amazon.com/elasticloadbalancing/pricing/)
- [Amazon EC2](https://aws.amazon.com/ec2/pricing/on-demand/) (the NAT instance)
- [Amazon VPC](https://aws.amazon.com/vpc/pricing/) (public IPv4 addresses)
- [AWS Lambda](https://aws.amazon.com/lambda/pricing/), [Amazon CloudFront](https://aws.amazon.com/cloudfront/pricing/), [Amazon S3](https://aws.amazon.com/s3/pricing/)
- [Amazon ECR](https://aws.amazon.com/ecr/pricing/), [Amazon CloudWatch](https://aws.amazon.com/cloudwatch/pricing/)

## Before a real production deploy

- Put HTTPS on the load balancer (`loadBalancer.domain` in `infra/api.ts`) or keep the API reachable only from the web app.
- The rate limiter counts requests per client IP. Behind the load balancer every request arrives from the balancer, so configure Express to trust the proxy's `X-Forwarded-For` before relying on the limit.
- Do not set `ALLOW_PRIVATE_WEBHOOK_TARGETS=true` in AWS.
