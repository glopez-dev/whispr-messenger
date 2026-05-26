/**
 * Quick probe: load the v4 GraphModel and report sigmoid output for a few
 * baseline inputs. Lets us guess which side of the sigmoid means "food".
 */
import * as tf from "@tensorflow/tfjs";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "..", "public");

function safeResolve(reqUrl) {
  const urlPath = reqUrl.split("?")[0];
  const resolved = path.resolve(PUBLIC_DIR, "." + path.normalize("/" + urlPath));
  return resolved.startsWith(PUBLIC_DIR + path.sep) ? resolved : null;
}

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const fp = safeResolve(req.url);
      if (!fp || !fs.existsSync(fp)) {
        res.writeHead(404);
        return res.end();
      }
      const mime = path.extname(fp) === ".json" ? "application/json" : "application/octet-stream";
      res.writeHead(200, { "Content-Type": mime });
      res.end(fs.readFileSync(fp));
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

const { server, port } = await startServer();
try {
  const model = await tf.loadGraphModel(`http://127.0.0.1:${port}/models/v4-tfjs/model.json`);
  console.log("Loaded GraphModel.");
  console.log("  Inputs:", model.inputs.map((i) => ({ name: i.name, shape: i.shape })));
  console.log("  Outputs:", model.outputs.map((o) => ({ name: o.name, shape: o.shape })));

  for (const [label, factory] of [
    ["zeros (black)", () => tf.zeros([1, 224, 224, 3])],
    ["random 0..255", () => tf.randomUniform([1, 224, 224, 3], 0, 255)],
    ["mid-gray 128", () => tf.fill([1, 224, 224, 3], 128)],
    ["255s (white)", () => tf.fill([1, 224, 224, 3], 255)],
  ]) {
    const inp = factory();
    const out = model.predict(inp);
    const data = await out.data();
    console.log(`  ${label}: output=${Array.from(data).map((v) => v.toFixed(4))}`);
    inp.dispose();
    out.dispose();
  }
} finally {
  server.close();
}
