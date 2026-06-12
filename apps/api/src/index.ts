import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import cors from "cors";
import express from "express";

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

function runYtdlp(args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    let stderr = "";
    const proc = spawn("yt-dlp", args);

    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("error", (err: NodeJS.ErrnoException) => {
      reject(err);
    });

    proc.on("close", (code) => {
      resolve({ code: code ?? 1, stderr });
    });
  });
}

app.post("/api/youtube/audio", async (req, res) => {
  const url = req.body?.url;
  if (!url || typeof url !== "string") {
    res.status(400).send("url required");
    return;
  }

  const dir = await mkdtemp(join(tmpdir(), "mpc-audio-"));

  try {
    const outputTemplate = join(dir, "audio.%(ext)s");

    const { code, stderr } = await runYtdlp([
      "-f",
      "bestaudio/best",
      "--no-playlist",
      "-x",
      "--audio-format",
      "wav",
      "-o",
      outputTemplate,
      url,
    ]);

    if (code !== 0) {
      res.status(500).send(stderr.trim() || `yt-dlp exited with code ${code}`);
      return;
    }

    const files = await readdir(dir);
    const audioFile = files.find((name) => name.startsWith("audio."));
    if (!audioFile) {
      res.status(500).send("no audio file produced");
      return;
    }

    const data = await readFile(join(dir, audioFile));
    res.setHeader("Content-Type", "audio/wav");
    res.send(data);
  } catch (err) {
    if (!res.headersSent) {
      const error = err as NodeJS.ErrnoException;
      res
        .status(500)
        .send(
          error.code === "ENOENT"
            ? "yt-dlp not found — run: brew install yt-dlp && brew install ffmpeg"
            : error.message ?? "download failed",
        );
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

app.listen(PORT, () => {
  console.log(`mpc api listening on http://localhost:${PORT}`);
});
