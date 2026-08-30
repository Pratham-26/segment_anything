Run results (datasets, runs, exports) live here; bind-mounted as /data in both containers.

## Demo projects
`demo-forms`, `demo-scenes`, `demo-invoices` are generated samples (synthetic PIL
images, labels from free OpenRouter VLMs through the real `sam label` pipeline).
Regenerate with:

    OPENROUTER_API_KEY=... uv run python scripts/make_demo_projects.py

`demo-invoices` additionally carries a partially corrected gold subset, a split,
and placeholder metrics so the results view has something to render.
