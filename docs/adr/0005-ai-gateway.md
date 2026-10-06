# ADR 0005 — AI Gateway

**Status:** Accepted

AI access goes through an internal `AIGateway`, with ModelRegistry, PromptRegistry, AIUsage, AIExecution and AIDecision concepts. LLMs are for classification, summarization, interpretation, strategy, language and explainability; deterministic calculations remain application code. OpenAI is not required in Phase 0.

[Phase 6](../architecture/phase-6-conversation-ai.md) implements requested conversation analysis and explicitly reviewed CRM timeline notes. The provider remains disabled until credentials are configured; simulated acceptance and live-provider validation are reported separately.

The user clarified on 2026-10-05 that the product requires proactive AI to initiate customer conversations. Phase 6 is an auxiliary analysis mechanism, not fulfillment of that requirement. [Proactive relationship AI](../architecture/proactive-ai.md) records the required authorized planning, outbound initiation, conversation continuity and human handoff. Provider activation alone does not implement that workflow.

[Original project reconciliation](../architecture/original-project-reconciliation.md) recovers the September execution chat and its attachments. The original phase 3 excludes conversational AI and automatic campaigns from that infrastructure phase; it does not prohibit those later product capabilities. The current explicit requirement is proactive customer contact. Full later-phase AI specifications were not recovered and must not be inferred from the phase 3 exclusions alone.
