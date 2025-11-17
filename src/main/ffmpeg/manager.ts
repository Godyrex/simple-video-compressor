import { spawn } from "child_process";
import fs from "fs-extra";
import path from "path";

type ProgressPayload = Record<string, any>;

export class FFmpegManager {
  private processes: Map<string, ReturnType<typeof spawn>> = new Map();
  private tempPaths: Map<string, string> = new Map();
  private ffmpegPath: string;
  constructor(ffmpegPath: string) {
    this.ffmpegPath = ffmpegPath;
  }

  async probe(
    filePath: string
  ): Promise<{ duration_ms?: number; size?: number }> {
    return new Promise((resolve, reject) => {
      const args = ["-hide_banner", "-i", filePath];
      const proc = spawn(this.ffmpegPath, args);
      let stderr = "";
      proc.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      proc.on("close", async () => {
        const m = stderr.match(
          /Duration:\s(\d{1,2}):(\d{2}):(\d{2}(?:\.\d+)?)/
        );
        let duration_ms: number | undefined;
        if (m) {
          const h = Number(m[1]);
          const mm = Number(m[2]);
          const secPart = m[3];
          const [sec, msPart] = secPart.split(".");
          const s = Number(sec);
          const ms = msPart ? Number(msPart) : 0;
          duration_ms = (h * 3600 + mm * 60 + s) * 1000 + ms;
        }
        let size: number | undefined;
        try {
          const stat = await fs.stat(filePath);
          size = stat.size;
        } catch (e) {
          console.error("Error getting file size during probe:", e);
        }
        resolve({ duration_ms, size });
      });
      proc.on("error", (err: Error) => reject(err));
    });
  }

  async startCompression(
    payload: {
      id: string;
      inputPath: string;
      outputPath: string;
      options?: any;
    },
    progressCb: (p: ProgressPayload) => void
  ): Promise<{ id: string; outputPath: string }> {
    const { id, inputPath, outputPath, options } = payload;

    const uid = (globalThis as any).crypto?.randomUUID
      ? (globalThis as any).crypto.randomUUID()
      : String(Date.now());

    const tmpPath = this.createTempPath(outputPath, uid);
    this.tempPaths.set(id, tmpPath);
    const args = this.buildFfmpegArgs(inputPath, tmpPath, options);

    const proc = spawn(this.ffmpegPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.processes.set(id, proc);
    //stdout for progress
    const { handleStdout, flushStdout } = this.createStdoutHandler(
      id,
      progressCb
    );
    proc.stdout.on("data", handleStdout);
    //stderr for errors
    let stderrBuf = "";
    const handleStderr = (chunk: Buffer) => {
      const s = chunk.toString();
      stderrBuf += s;
      this.parseStderrProgress(s, id, progressCb);
    };
    proc.stderr.on("data", handleStderr);

    return new Promise((resolve, reject) => {
      proc.on("close", async (code: number) => {
        this.processes.delete(id);
        try {
          flushStdout();
        } catch (e) {
          /* ignore */
        }

        if (code === 0) {
          try {
            await this.moveTempToTarget(tmpPath, outputPath);
            this.tempPaths.delete(id);
            resolve({ id, outputPath });
          } catch (err) {
            this.deleteTempPath(id);
            return reject(err);
          }
        } else {
          this.deleteTempPath(id);
          return reject(
            new Error(
              `ffmpeg exited with code ${code}. stderr: ${stderrBuf.slice(
                0,
                1000
              )}`
            )
          );
        }
      });

      proc.on("error", (err: Error) => {
        this.processes.delete(id);
        this.deleteTempPath(id);
        reject(err);
      });
    });
  }

  private createTempPath(outputPath: string, uid: string) {
    const parsed = path.parse(outputPath);
    const tmpName = `${parsed.name}.tmp-${uid}${parsed.ext}`;
    return path.join(parsed.dir || path.dirname(outputPath), tmpName);
  }

  private buildFfmpegArgs(inputPath: string, tmpPath: string, options?: any) {
    const args: string[] = [
      "-hide_banner",
      "-loglevel",
      "info",
      "-progress",
      "pipe:1",
      "-i",
      inputPath,
    ];
    if (options && options.reencode) {
      const crf = options.crf || 23;
      args.push("-c:v", "libx264", "-preset", "medium", "-crf", String(crf));
      args.push("-c:a", "aac", "-b:a", options.audioBitrate || "128k");
    } else {
      args.push("-c:v", "copy", "-c:a", "copy");
    }
    args.push("-y", tmpPath);
    return args;
  }

  private createStdoutHandler(
    id: string,
    progressCb: (p: ProgressPayload) => void
  ) {
    let stdoutBuf = "";

    const parseLinesToPayload = (lines: string[]): ProgressPayload | null => {
      const payload: ProgressPayload = { id };
      let hasData = false;
      for (const line of lines) {
        const kv = line.split("=");
        if (kv.length === 2) {
          const key = kv[0].trim();
          const val = kv[1].trim();
          payload[key] = val;
          hasData = true;
        }
      }
      if (payload.out_time_ms !== undefined) {
        const raw = Number(payload.out_time_ms);
        if (!isNaN(raw)) {
          payload.out_time_ms =
            raw > 1000000 ? Math.round(raw / 1000) : Math.round(raw);
        }
      }
      return hasData ? payload : null;
    };

    const handleStdout = (chunk: Buffer) => {
      stdoutBuf += chunk.toString();
      const lines = stdoutBuf.split(/\r?\n/);
      const completeLines =
        stdoutBuf.endsWith("\n") || stdoutBuf.endsWith("\r")
          ? lines
          : lines.slice(0, -1);
      stdoutBuf =
        stdoutBuf.endsWith("\n") || stdoutBuf.endsWith("\r")
          ? ""
          : lines[lines.length - 1] || "";

      const payload = parseLinesToPayload(completeLines);
      if (payload) progressCb(payload);
    };

    const flushStdout = () => {
      if (!stdoutBuf) return;
      const lines = stdoutBuf.split(/\r?\n/).filter(Boolean);
      const payload = parseLinesToPayload(lines);
      if (payload) progressCb(payload);
      stdoutBuf = "";
    };

    return { handleStdout, flushStdout };
  }

  private parseStderrProgress(
    s: string,
    id: string,
    progressCb: (p: ProgressPayload) => void
  ) {
    const timeMatch = s.match(/time=(\d{1,2}):(\d{2}):(\d{2}(?:\.\d+)?)/);
    if (timeMatch) {
      try {
        const h = Number(timeMatch[1]);
        const mm = Number(timeMatch[2]);
        const sec = Number(timeMatch[3]);
        const out_ms = Math.round((h * 3600 + mm * 60 + Number(sec)) * 1000);
        progressCb({ id, out_time_ms: out_ms });
      } catch (e) {
        // ignore parse errors
      }
    }
  }

  cancel(id: string) {
    const proc = this.processes.get(id);
    if (proc) {
      try {
        proc.kill();
      } catch (e) {
        // ignore
      }
    }
    if (proc) {
      proc.once("close", () => {
        this.deleteTempPath(id);
      });
    } else {
      this.deleteTempPath(id);
    }
  }

  deleteTempPath(id: string) {
    const tmp = this.tempPaths.get(id);
    if (tmp) {
      fs.remove(tmp).catch((e) => {
        console.error(`Failed to delete temp path: ${tmp}`, e);
      });
      this.tempPaths.delete(id);
    }
  }
  moveTempToTarget = async (tempPath: string, targetPath: string) => {
    await fs.ensureDir(path.dirname(targetPath));
    await fs.move(tempPath, targetPath, { overwrite: true });
  };
}
