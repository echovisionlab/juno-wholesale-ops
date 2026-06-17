import { getJunoLiveWorkerProcessManager } from "@/lib/juno-live/worker-process";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type WorkerActionRequest = {
  action?: unknown;
};

export function GET() {
  return Response.json({ worker: getJunoLiveWorkerProcessManager().getStatus() });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as WorkerActionRequest;
  const manager = getJunoLiveWorkerProcessManager();

  if (body.action === "start") {
    return Response.json({ worker: manager.start() });
  }

  if (body.action === "stop") {
    return Response.json({ worker: await manager.stopAndWait() });
  }

  if (body.action === "restart") {
    return Response.json({ worker: await manager.restart() });
  }

  return Response.json({ error: "action must be start, stop, or restart" }, { status: 400 });
}
