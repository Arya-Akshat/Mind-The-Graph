import numpy as np
from config import OUTPUT_DIR, DASHBOARD_DATA
from simulation import CrowdSimulation

def run_verification(G, results, spectral):
    failures = []

    def check(name, condition):
        if not condition:
            failures.append(name)
        else:
            print(f"  ✓  {name}")

    print("\n── Verification ──────────────────────────")

    # Matrix checks
    for mode, res in results.items():
        P = np.array(res.transition_matrix)
        check(f"{mode}: rows sum to 1",
              np.allclose(P.sum(axis=1), 1.0, atol=1e-5))

    # Graph integrity
    for u, v in G.edges():
        check(f"edge ({u},{v}) nodes exist", u in G.nodes and v in G.nodes)
    for n, d in G.nodes(data=True):
        check(f"node {n} capacity >= 0", d.get('capacity', 0) >= 0)

    # Spectral sanity
    check("spectral_gap finite and > 0",
          np.isfinite(spectral['spectral_gap']) and spectral['spectral_gap'] > 0)

    # Routing produces different results
    check("selfish != baseline (travel time)",
          abs(results['selfish'].avg_travel_time
              - results['baseline'].avg_travel_time) > 0.01)

    # Optimization improves something
    check("optimized beats baseline (wait time OR throughput)",
          results['optimized'].avg_wait_time < results['baseline'].avg_wait_time
          or results['optimized'].throughput  > results['baseline'].throughput)

    # Reproducibility
    r1 = CrowdSimulation(G, "baseline", 200, 42).run()
    r2 = CrowdSimulation(G, "baseline", 200, 42).run()
    check("reproducible with same seed",
          abs(r1.avg_travel_time - r2.avg_travel_time) < 1e-9)

    # JSON output exists and is loadable
    import json
    from pathlib import Path
    p = Path(OUTPUT_DIR) / "simulation_compact.json"
    check("simulation_compact.json exists", p.exists())
    if p.exists():
        with open(p) as f:
            data = json.load(f)
        check("JSON has all 4 modes",
              all(m in data['modes'] for m in ["baseline","biased","selfish","optimized"]))

    if failures:
        print(f"\n  ✗  {len(failures)} check(s) FAILED: {failures}")
        raise AssertionError(f"Verification failed: {failures}")
    else:
        print("  All checks passed ✓\n")
