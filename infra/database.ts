import { vpc } from "./network";

export const database = new sst.aws.Postgres("Database", {
  vpc,
  version: "17",
});

// The API and worker read one connection string, exactly as they do locally.
export const databaseUrl = $interpolate`postgres://${database.username}:${database.password}@${database.host}:${database.port}/${database.database}`;
