"""Minimal COCO format helpers shared by all pipeline stages."""
import copy
import json


def new_coco():
    return {"images": [], "annotations": [], "categories": []}


def load(path):
    with open(path) as f:
        return json.load(f)


def save(path, coco):
    with open(path, "w") as f:
        json.dump(coco, f)


def category_id(coco, name):
    """Return category id for name, registering it if new."""
    for cat in coco["categories"]:
        if cat["name"] == name:
            return cat["id"]
    new_id = max((c["id"] for c in coco["categories"]), default=0) + 1
    coco["categories"].append({"id": new_id, "name": name})
    return new_id


def clone(coco):
    return copy.deepcopy(coco)
