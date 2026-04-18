import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import shutil, json
from pathlib import Path

from config import OUTPUT_DIR, DASHBOARD_DATA, N_STEPS, SEED, RENDER_STEP_STRIDE
from graph_model import build_metro_graph, graph_to_dict
from spectral_analysis import compute_spectral_metrics
from simulation import CrowdSimulation
from visualization import generate_all_plots, print_console_summary
from verify import run_verification

def build_compact_json(G, results, spectral):
    out = {
        "meta": {
            "steps": N_STEPS // RENDER_STEP_STRIDE,
            "nodes": len(G.nodes),
            "edges": len(G.edges)
        },
        "graph": graph_to_dict(G),
        "modes": {},
        "spectral": {
            "spectral_gap": round(spectral["spectral_gap"], 4),
            "mixing_time": spectral["mixing_time"],
            "bottlenecks": spectral.get("bottleneck_nodes", [])[:5]
        }
    }
    
    for mode, res in results.items():
        occ_compact = {}
        for n, vals in res.node_occupancy.items():
            occ_compact[n] = [round(v, 2) for i, v in enumerate(vals) if i % RENDER_STEP_STRIDE == 0]
            
        q_compact = {}
        for n, vals in res.queue_lengths.items():
            q_compact[n] = [round(v, 2) for i, v in enumerate(vals) if i % RENDER_STEP_STRIDE == 0]
            
        e_compact = {}
        for e, vals in res.edge_flows.items():
            ds = [round(v, 2) for i, v in enumerate(vals) if i % RENDER_STEP_STRIDE == 0]
            if sum(ds) > 0.05:
                e_compact[e] = ds
                
        out["modes"][mode] = {
            "metrics_summary": {
                "avg_travel_time": round(res.avg_travel_time, 3),
                "avg_wait_time": round(res.avg_wait_time, 3),
                "peak_queue": int(res.peak_queue),
                "throughput": round(res.throughput, 3)
            },
            "node_occupancy": occ_compact,
            "queue_lengths": q_compact,
            "edge_flows": e_compact
        }
        
    return out

def main():
    G = build_metro_graph()
    Path(OUTPUT_DIR).mkdir(exist_ok=True)
    Path(DASHBOARD_DATA).mkdir(parents=True, exist_ok=True)

    results = {}
    for mode in ["baseline", "biased", "selfish", "optimized"]:
        sim = CrowdSimulation(G, mode=mode, n_steps=N_STEPS, seed=SEED)
        results[mode] = sim.run()

    spectral = compute_spectral_metrics(G)
    output   = build_compact_json(G, results, spectral)

    # Save to outputs/ AND copy to dashboard/data/
    json_path = Path(OUTPUT_DIR) / "simulation_compact.json"
    with open(json_path, "w") as f:
        json.dump(output, f, separators=(',', ':')) # minified without indents
    shutil.copy(json_path, Path(DASHBOARD_DATA) / "simulation_compact.json")

    generate_all_plots(G, results, spectral)
    print_console_summary(G, results, spectral)
    run_verification(G, results, spectral)

if __name__ == "__main__":
    main()
