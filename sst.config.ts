/// <reference path="./.sst/platform/config.d.ts" />

// Deploy-ready AWS infrastructure. Nothing here is deployed by the build; see docs/DEPLOY.md
// for the commands the owner runs (`pnpm sst deploy --stage dev`).
export default $config({
  app(input) {
    return {
      name: "blockpace",
      home: "aws",
      providers: { aws: { region: "us-east-1" } },
      // Production keeps its data if the stack is removed, and refuses accidental deletes.
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: input?.stage === "production",
    };
  },
  async run() {
    const { api } = await import("./infra/api");
    const { web } = await import("./infra/web");
    return { api: api.url, web: web.url };
  },
});
