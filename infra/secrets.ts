// Set once per stage with `pnpm sst secret set ApiKey <value> --stage <stage>`; never in the repo.
export const apiKey = new sst.Secret("ApiKey");
