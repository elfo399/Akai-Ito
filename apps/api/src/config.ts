import { fileURLToPath } from "node:url";
import path from "node:path";
export const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
export const dataDirectory = () =>
  path.resolve(projectRoot, process.env.DATA_DIR ?? "data");
