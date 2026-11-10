WEIGHTS = {"error": 4, "warning": 2, "notice": 1}


def health_score(total_pages: int, issues_by_severity: dict) -> float:
    if not total_pages:
        return 100.0
    penalty = sum(WEIGHTS.get(sev, 1) * count for sev, count in issues_by_severity.items())
    score = 100 - (penalty / total_pages) * 8
    return round(max(0.0, min(100.0, score)), 1)
