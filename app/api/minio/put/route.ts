// ADDED: force Node.js runtime (MinIO SDK requires Node)
export const runtime = "nodejs";

import type { NextRequest } from "next/server";
import { Client } from "minio";

export async function POST(request: Request | NextRequest) {
  const body = await request.json();
  const { endpoint, port, useSSL, accessKey, secretKey, bucket, name, base64, contentType } = body || {};

  if (!endpoint || !port || useSSL === undefined || !accessKey || !secretKey || !bucket || !name || !base64) {
    return Response.json({ error: "Missing fields for MinIO upload." }, { status: 400 });
  }

  const client = new Client({
    endPoint: endpoint,
    port: Number(port),
    useSSL: Boolean(useSSL),
    accessKey,
    secretKey,
  });

  try {
    const buffer = Buffer.from(base64, "base64");
    await client.putObject(bucket, name, buffer, buffer.length, { "Content-Type": contentType || (name.toLowerCase().endsWith(".aasx") ? "application/zip" : "application/octet-stream") });
    return Response.json({ ok: true }, { status: 200 });
  } catch (err: any) {
    return Response.json({ error: err?.message || "Failed to upload to MinIO." }, { status: 500 });
  }
}