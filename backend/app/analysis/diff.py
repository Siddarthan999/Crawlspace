from collections import defaultdict


def compare(old_issues: list[dict], new_issues: list[dict]) -> dict:
    """old/new issues: list of {check_id, url}. Returns new / fixed / persisting keyed by check_id."""
    def key(i):
        return (i["check_id"], i["url"])
    old_keys = {key(i) for i in old_issues}
    new_keys = {key(i) for i in new_issues}
    added = new_keys - old_keys
    fixed = old_keys - new_keys
    persisting = old_keys & new_keys

    def group(keys):
        out = defaultdict(list)
        for cid, url in keys:
            out[cid].append(url)
        return dict(out)

    return dict(
        new_count=len(added), fixed_count=len(fixed), persisting_count=len(persisting),
        new_by_check=group(added), fixed_by_check=group(fixed),
    )
