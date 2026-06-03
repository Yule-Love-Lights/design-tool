import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      // Use 127.0.0.1 (IPv4) explicitly, NOT "localhost". On Windows, localhost
      // resolves to IPv6 ::1 first, and if the yll-quote-tool Next.js dev server
      // is also running on port 3000 (it binds :::3000 over IPv6) the proxy would
      // hit THAT instead of our Fastify (which binds 0.0.0.0:3000 over IPv4),
      // returning 404s and a blank app. Pinning to 127.0.0.1 avoids the collision.
      "/api": "http://127.0.0.1:3000",
      "/photos": "http://127.0.0.1:3000",
    },
    watch: {
      // Ignore editor lock/scratch files. Paint.NET drops `.pdnSave` files
      // next to the image while saving; Vite's watcher tries to subscribe to
      // them and dies with EBUSY because the editor still holds the handle.
      // Add other editors' patterns here if they cause the same crash.
      ignored: [
        "**/*.pdnSave",
        "**/*.pdnSave.*",
        "**/*.tmp",
        "**/~$*", // Office lock files
      ],
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
