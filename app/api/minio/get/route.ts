import type { NextRequest } from "next/server";
import { Client } from "minio";

function guessContentType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".aasx")) return "application/zip";
  if (lower.endsWith(".xml")) return "application/xml";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

export async function POST(request: Request | NextRequest) {
  const body = await request.json();
  const { endpoint, port, useSSL, accessKey, secretKey, bucket, key } = body || {};

  if (!endpoint || !port || useSSL === undefined || !accessKey || !secretKey || !bucket || !key) {
    return Response.json({ error: "Missing MinIO configuration or key." }, { status: 400 });
  }

  const client = new Client({
    endPoint: endpoint,
    port: Number(port),
    useSSL: Boolean(useSSL),
    accessKey,
    secretKey,
  });

  try {
    const buffer: Buffer = await new Promise((resolve, reject) => {
      client.getObject(bucket, key, (err, dataStream) => {
        if (err) return reject(err);
        const chunks: Buffer[] = [];
        dataStream.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        dataStream.on("error", reject);
        dataStream.on("end", () => resolve(Buffer.concat(chunks)));
      });
    });

    const base64 = buffer.toString("base64");
    const name = key.split("/").pop() || key;
    const contentType = guessContentType(name);

    return Response.json({ name, base64, contentType }, { status: 200 });
  } catch (err: any) {
    return Response.json({ error: err?.message || "Failed to download object from MinIO" }, { status: 500 });
  }
}