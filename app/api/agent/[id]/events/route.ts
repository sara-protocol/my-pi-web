import { NextRequest } from "next/server";
import { runLocalAgent } from "@/lib/local-agent";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = await params;
  const { searchParams } = new URL(req.url);
  const message = searchParams.get("message") || "";

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: any) => {
        const data = `data: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(data));
      };
      try {
        await runLocalAgent(message, sessionId, send);
      } catch (e:any) {
        send({ type: 'text', text: `\nError: ${e.message}` });
        send({ type: 'done' });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
