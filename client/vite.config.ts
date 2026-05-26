import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/photos": "http://localhost:3000",
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
