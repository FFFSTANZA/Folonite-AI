import type { NextConfig } from "next";
import dotenv from "dotenv";

dotenv.config();

const nextConfig: NextConfig = {
  transpilePackages: ["@folonite/shared"],
};

export default nextConfig;
