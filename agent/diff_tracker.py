from typing import List, Dict

def compute_list_diff(
    agent_items: List[Dict],
    human_items: List[Dict],
    id_field: str = "id",
) -> Dict:
    agent_by_id = {item[id_field]: item for item in agent_items}
    human_by_id = {item[id_field]: item for item in human_items}

    added   = [item for id_, item in human_by_id.items() if id_ not in agent_by_id]
    deleted = [id_ for id_ in agent_by_id if id_ not in human_by_id]

    modified = []
    for id_, human_item in human_by_id.items():
        if id_ in agent_by_id:
            agent_item = agent_by_id[id_]
            changed_fields = {
                k: {"before": agent_item.get(k), "after": human_item.get(k)}
                for k in set(list(agent_item.keys()) + list(human_item.keys()))
                if agent_item.get(k) != human_item.get(k)
            }
            if changed_fields:
                modified.append({
                    "id": id_,
                    "before": agent_item,
                    "after": human_item,
                    "changed_fields": changed_fields,
                })

    unchanged_count = len([
        id_ for id_ in human_by_id
        if id_ in agent_by_id and id_ not in [m["id"] for m in modified]
    ])
    return {
        "added": added,
        "deleted": deleted,
        "modified": modified,
        "unchanged_count": unchanged_count,
    }

def summarise_diff(diff: Dict) -> str:
    parts = []
    if diff["added"]:    parts.append(f"+{len(diff['added'])} added")
    if diff["deleted"]:  parts.append(f"-{len(diff['deleted'])} deleted")
    if diff["modified"]: parts.append(f"~{len(diff['modified'])} modified")
    if not parts:        return "no changes"
    return ", ".join(parts)
