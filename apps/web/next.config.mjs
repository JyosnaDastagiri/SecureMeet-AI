/** @type {import('next').NextConfig} */
const nextConfig = {
  // Strict Mode double-mounts effects in development, which would create two sockets and two
  // media sessions in the meeting room. The room hook cleans up properly, but we keep this off for clarity.
  reactStrictMode: false,
  poweredByHeader: false,
};
export default nextConfig;
