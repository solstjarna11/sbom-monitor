import path from "node:path";
import { access } from "node:fs/promises";

export function getDefaultDataRoot(): string {
  return path.resolve(process.cwd(), "data");
}

export function toAbsolutePath(inputPath: string): string {
  return path.resolve(process.cwd(), inputPath);
}

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}