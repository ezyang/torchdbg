/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    config.module.rules.push({
      test: /example\/.*\.log$/,
      type: "asset/source",
    });
    return config;
  },
};

export default nextConfig;
