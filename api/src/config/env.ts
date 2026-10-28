import "dotenv/config";

function readPort(raw: string | undefined): number {
  const port = Number(raw ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: "${raw}"`);
  }
  return port;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: readPort(process.env.PORT),
  databaseUrl: required("DATABASE_URL"),
} as const;
