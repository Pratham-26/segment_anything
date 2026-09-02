# Questions

Open questions from ox-alpha to Pratham. Protocol:
1. ox-alpha adds questions here.
2. Pratham answers (writes the answer inline under the question).
3. Once the answer is incorporated into the relevant doc/code, that Q&A block is removed.

## Open

### Which VLM credentials should live runs use?
Asked 2026-09-02. Live labeling/benchmark need a working key; every token in the current
environment fails 401 at its endpoint (`ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL`
= api.z.ai/api/anthropic → 401; `ZAI_API_KEY` → api.z.ai 401; `OPIC_AUTH_TOKEN` → not a
LiteLLM provider; no `.env`). Demo caches were built with an OpenRouter key that is no
longer present. Provide `OPENROUTER_API_KEY` (or any LiteLLM-compatible key) in `.env`,
or point `config.yaml: vlms` at models reachable with an existing key.

(none)
