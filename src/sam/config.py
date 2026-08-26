"""Project config (config.yaml) load/save."""
from pathlib import Path

DEFAULTS = {
    "query": None,
    "vlm": None,
    "variant": "rf-detr-base",
    "val_frac": 0.1,
}


def config_path(project):
    return Path(project) / "config.yaml"


def load_config(project):
    import yaml
    p = config_path(project)
    cfg = dict(DEFAULTS)
    if p.exists():
        cfg.update(yaml.safe_load(p.read_text()) or {})
    return cfg


def save_config(project, cfg):
    import yaml
    merged = dict(DEFAULTS)
    merged.update(cfg)
    config_path(project).write_text(yaml.safe_dump(merged, sort_keys=False))
