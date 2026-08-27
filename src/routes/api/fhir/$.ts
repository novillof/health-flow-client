import { createFileRoute } from "@tanstack/react-router";

const ALLOWED = new Set(["GET", "POST", "PUT", "DELETE"]);

async function proxy({
  request,
  params,
}: {
  request: Request;
  params: { _splat?: string };
}): Promise<Response> {
  const baseUrl = process.env["FHIR_BASE_URL"];
  const token = process.env["FHIR_ACCESS_TOKEN"];

  if (!baseUrl) {
    return Response.json(
      { error: "FHIR server is not configured (missing FHIR_BASE_URL)." },
      { status: 500 },
    );
  }
  if (!ALLOWED.has(request.method)) {
    return new Response("Method not allowed", { status: 405 });
  }

  const path = (params._splat ?? "").replace(/^\/+/, "");
  // Only allow simple FHIR resource paths, no traversal or absolute URLs.
  if (!/^[A-Za-z0-9._\-/]*$/.test(path) || path.includes("..")) {
    return Response.json({ error: "Invalid FHIR path." }, { status: 400 });
  }

  const search = new URL(request.url).search;
  const target = `${baseUrl.replace(/\/+$/, "")}/${path}${search}`;

  const headers = new Headers({ Accept: "application/fhir+json" });
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let body: string | undefined;
  if (request.method === "POST" || request.method === "PUT") {
    body = await request.text();
    headers.set("Content-Type", "application/fhir+json");
  }

  try {
    const upstream = await fetch(target, { method: request.method, headers, body });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/fhir+json",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    console.error("FHIR proxy error", error);
    return Response.json({ error: "Could not reach the FHIR server." }, { status: 502 });
  }
}

export const Route = createFileRoute("/api/fhir/$")({
  server: {
    handlers: {
      GET: proxy,
      POST: proxy,
      PUT: proxy,
      DELETE: proxy,
    },
  },
});
