import { spawn } from "node:child_process";
import { ToolExecutionError } from "./errors";

export async function renderDotToSvg(dot: string): Promise<Uint8Array | undefined> {
  return new Promise<Uint8Array | undefined>((resolve, reject) => {
    const child = spawn("dot", ["-Tsvg"]);

    const stdoutChunks: Uint8Array[] = [];
    const stderrChunks: Uint8Array[] = [];

    child.stdout.on("data", (chunk: Uint8Array) => {
      stdoutChunks.push(chunk);
    });

    child.stderr.on("data", (chunk: Uint8Array) => {
      stderrChunks.push(chunk);
    });

    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        resolve(undefined);
        return;
      }

      reject(
        new ToolExecutionError("Failed to start Graphviz 'dot' process.", {
          cause: error,
          details: { tool: "dot" },
          exitCode: 2
        })
      );
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdoutChunks));
        return;
      }

      reject(
        new ToolExecutionError("Graphviz 'dot' failed to render SVG.", {
          details: {
            exitCode: code,
            stderr: Buffer.concat(stderrChunks).toString("utf-8")
          },
          exitCode: 2
        })
      );
    });

    child.stdin.write(dot, "utf-8");
    child.stdin.end();
  });
}