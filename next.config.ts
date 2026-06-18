import type { NextConfig } from "next";

const allowedDevOrigins = [
  "127.0.0.1",
  ...(process.env.JUNO_WHOLESALE_OPS_DEV_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
];

const nextConfig: NextConfig = {
  allowedDevOrigins,
  output: "standalone",
};

export default nextConfig;
