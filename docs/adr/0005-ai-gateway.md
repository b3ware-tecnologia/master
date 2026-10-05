# ADR 0005 — AI Gateway

**Status:** Accepted

AI access goes through an internal `AIGateway`, with ModelRegistry, PromptRegistry, AIUsage, AIExecution and AIDecision concepts. LLMs are for classification, summarization, interpretation, strategy, language and explainability; deterministic calculations remain application code. OpenAI is not required in Phase 0.

[Phase 6](../architecture/phase-6-conversation-ai.md) implements requested conversation analysis and explicitly reviewed CRM timeline notes. The provider remains disabled until credentials are configured; simulated acceptance and live-provider validation are reported separately.
