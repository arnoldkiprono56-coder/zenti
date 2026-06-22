import path from "node:path";
import { fileURLToPath } from "node:url";
import { rm } from "node:fs/promises";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Clean up old api/public if it exists from a previous build
await rm(path.join(root, "api/public"), { recursive: true, force: true });

console.log("Vercel build complete. Frontend is in dist/, API function is in api/");
