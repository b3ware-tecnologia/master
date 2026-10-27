import {requirePlatformAdminPage} from "@/lib/page-auth";
import {AdminCenter} from "@/components/admin-center";
export default async function PlatformPage(){await requirePlatformAdminPage();return <AdminCenter/>;}