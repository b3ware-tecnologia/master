# RBAC

Capabilities are centralized in `src/domain/access.ts`; business services never branch directly on role names. Tenant masters receive tenant administration, users, teams, audit and settings capabilities. Managers receive read access and team-member management. Consultants receive no administrative capability.

CRM and customer reads now enforce these scopes in database predicates: `TENANT_MASTER -> TENANT`, `TENANT_MANAGER -> TEAM`, `CONSULTANT -> ASSIGNED`. Managers must belong to the active assigned team; consultants must be active members of that team and the current assigned membership. Reassignment, team archival, membership suspension or team-member removal removes access. Services revalidate the current user, membership and tenant on each operation. Consultants can read their customers and update their assigned cases, and have no distribution, creation or administration capability.

Platform administrators are excluded from tenant context and cannot silently act as consultants. Dedicated platform CRM routes validate an active administrator and require an explicit active target tenant. User list/detail responses select safe fields and exclude password hashes.
