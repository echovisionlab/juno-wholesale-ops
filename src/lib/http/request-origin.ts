export function getRequestOrigin(request: Request): string {
  const url = new URL(request.url);
  const forwardedProto = firstForwardedHeader(request.headers.get("x-forwarded-proto"));
  const forwardedHost = firstForwardedHeader(request.headers.get("x-forwarded-host"));
  const host = forwardedHost ?? request.headers.get("host") ?? url.host;
  const proto = forwardedProto ?? url.protocol.replace(/:$/, "");
  return `${proto}://${host}`;
}

function firstForwardedHeader(value: string | null): string | null {
  return value?.split(",")[0]?.trim() || null;
}
