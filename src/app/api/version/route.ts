import { getPublicBuildInfo } from "@/lib/build-info";

export function GET() {
  return Response.json(getPublicBuildInfo());
}
