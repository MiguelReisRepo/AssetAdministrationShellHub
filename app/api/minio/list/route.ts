import type { NextRequest } from "next/server";
import { Client } from "minio";

export async function POST(request: Request | NextRequest) {
  const body = await request.json();

  const { endpoint, port, useSSL, accessKey, secretKey, bucket } = body || {};

  if (!endpoint || !port || useSSL === undefined || !accessKey || !secretKey || !bucket) {
    return Response.json({ error: "Missing MinIO configuration fields." }, { status: 400 });
  }

  const client = new Client({
    endPoint: endpoint,
    port: Number(port),
    useSSL: Boolean(useSSL),
    accessKey,
    secretKey,
  });

  const objects: Array<{ name: string; size?: number; lastModified?: string | Date }> = await new Promise((resolve, reject) => {
    const out: Array<{ name: string; size?: number; lastModified?: string | Date }> = [];
    const stream = client.listObjectsV2(bucket, "", true);

    stream.on("data", (obj: any) => {
      out.push({
        name: obj.name,
        size: obj.size,
        lastModified: obj.lastModified,
      });
    });
    stream.on("error", (err: any) => reject(err));
    stream.on("end", () => resolve(out));
  });

  const filtered = objects.filter((o) =>
    typeof o.name === "string" && (o.name.endsWith(".aasx") || o.name.endsWith(".xml") || o.name.endsWith(".json")),
  );

  return Response.json({ objects: filtered }, { status: 200 });
}