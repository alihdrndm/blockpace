import { database, databaseUrl } from "./database";
import { vpc } from "./network";
import { apiKey } from "./secrets";

// The API and worker run as containers, not Lambda functions: SST bundles Lambdas with esbuild,
// which does not emit the decorator metadata NestJS relies on, while the Docker images are built
// with the Nest build itself (see docs/DECISIONS.md).
const cluster = new sst.aws.Cluster("Cluster", { vpc });

const shared = {
  DATABASE_URL: databaseUrl,
  API_KEY: apiKey.value,
  NODE_ENV: "production",
};

export const api = new sst.aws.Service("Api", {
  cluster,
  image: { context: "./", dockerfile: "apps/api/Dockerfile" },
  link: [database],
  environment: {
    ...shared,
    PORT: "4020",
    // Migrations run from the API container at start, so a deploy brings the schema up to date.
    RUN_MIGRATIONS: "true",
  },
  loadBalancer: {
    rules: [{ listen: "80/http", forward: "4020/http" }],
    health: { "4020/http": { path: "/healthz", interval: "10 seconds" } },
  },
});

// No load balancer: the worker only polls the database and sends webhooks.
export const worker = new sst.aws.Service("Worker", {
  cluster,
  image: { context: "./", dockerfile: "apps/worker/Dockerfile" },
  link: [database],
  environment: shared,
});
