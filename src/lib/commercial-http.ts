import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { conversationActor } from "@/lib/conversation-http";
import { apiError } from "@/lib/http";
import { listCommercial, createPlaybook, changePlaybook, createCatalog, publishCondition, moveOpportunity, saveChannelCadence, enqueueCommercialJob } from "@/services/commercial-service";
import { changeOpportunityTask } from "@/services/opportunity-actions";
export async function commercialRoute(request: NextRequest, platform: boolean) {
  try {
    const actor = await conversationActor(request, platform); let result: unknown;
    if (request.method === "GET") result = await listCommercial(actor);
    else {
      const data = z.strictObject({ operation: z.enum(["playbook-create", "playbook-update", "catalog-create", "condition-publish", "opportunity-move", "cadence", "ai-job", "followup"]), id: z.string().min(1).max(100).optional(), input: z.unknown() }).parse(await request.json());
      const id = () => z.string().min(1).max(100).parse(data.id);
      switch (data.operation) {
        case "playbook-create": result = await createPlaybook(actor, data.input); break;
        case "playbook-update": result = await changePlaybook(actor, id(), data.input); break;
        case "catalog-create": result = await createCatalog(actor, data.input); break;
        case "condition-publish": { const input = z.strictObject({ expectedVersion: z.number().int().min(0), confirmed: z.boolean(), archive: z.boolean().optional() }).parse(data.input); result = await publishCondition(actor, id(), input.expectedVersion, input.confirmed, input.archive); break; }
        case "opportunity-move": result = await moveOpportunity(actor, id(), data.input); break;
        case "cadence": result = await saveChannelCadence(actor, id(), data.input); break;
        case "ai-job": result = await enqueueCommercialJob(actor, data.input); break;
        case "followup": result = await changeOpportunityTask(actor, id(), data.input); break;
      }
    }
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
