export const singleCompanyMode = () => process.env.BM_SINGLE_COMPANY_MODE === "true";
export const operationalCompanySlug = () => process.env.BM_COMPANY_SLUG || "bm-credito";
export const operationalTenantFilter = () => singleCompanyMode() ? {tenant:{slug:operationalCompanySlug()}} : {};
export async function operationalTenantScope(){if(!singleCompanyMode())return {};const {db}=await import("@/lib/db");const tenant=await db.tenant.findFirst({where:{slug:operationalCompanySlug(),status:"ACTIVE"},select:{id:true}});return {tenantId:tenant?.id??"NO_ACTIVE_COMPANY"};}
