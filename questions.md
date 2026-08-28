# Questions

Open questions from ox-alpha to Pratham. Protocol:
1. ox-alpha adds questions here.
2. Pratham answers (writes the answer inline under the question).
3. Once the answer is incorporated into the relevant doc/code, that Q&A block is removed.

## Open

### Light image: keep VLM labeling or not? (ox-alpha, waiting on Pratham)

Note: the current Dockerfile already installs **no** torch/rfdetr (train is an
optional extra), so it is already lighter than it looks. The only real weight
to cut is litellm + its dependency tree (openai/anthropic SDKs, ~100MB).

Options:
- **A. Keep labeling** (litellm stays): ingest + label + review in the light
  image. Then the current image already qualifies — nothing to build, maybe
  just a doc note. (ox-alpha default)
- **B. Hand-annotation only** (drop litellm): ingest + review UI with manual box
  drawing into gold; no VLM calls. Needs litellm moved to an optional extra
  (`[project.optional-dependencies] vlm = ["litellm"]`), `uv sync --extra vlm`
  for dev, and a slim Dockerfile. Genuinely lighter image (~100-150MB less).

Which workflow should the light image serve — A or B?
