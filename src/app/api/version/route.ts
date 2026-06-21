import { getPublicVersionInfo } from "@/lib/build-info";

export function GET() {
  return Response.json(getPublicVersionInfo());
}
