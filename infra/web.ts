import { api } from "./api";
import { apiKey } from "./secrets";

// The browser never calls the API: the Next.js server does, with the key from the secret.
export const web = new sst.aws.Nextjs("Web", {
  path: "apps/web",
  environment: {
    API_BASE_URL: api.url,
    API_KEY: apiKey.value,
  },
});
