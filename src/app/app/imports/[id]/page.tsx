import { notFound } from "next/navigation";
import MappingForm from "./mapping-form";
import { resolveAuthorizationContext, requireCapability } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { ImportProgress } from "@/components/import-progress";
export default async function ImportPage({ params }: { params: Promise<{ id: string }> }) { const context = await resolveAuthorizationContext(); requireCapability(context, "lists.import"); const item = await db.import.findFirst({ where: { id: (await params).id, tenantId: context.tenantId }, include: { summary: true, errors: true, mappings: true } }); if (!item) notFound(); return <><h1>{item.name}</h1><ImportProgress initial={JSON.parse(JSON.stringify(item))} />{item.status === "PREVIEWED" && <MappingForm importId={item.id} mappings={item.mappings.map((mapping) => ({ sourceColumn: mapping.sourceColumn, targetField: mapping.targetField }))} />}</> }
