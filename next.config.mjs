/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow dev HMR when opening the app from another device on your LAN (see terminal Network URL).
  // Add your machine’s LAN IP if Next warns about blocked cross-origin dev resources.
  allowedDevOrigins: ['192.168.0.150'],
}

export default nextConfig
