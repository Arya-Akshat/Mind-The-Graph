import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import networkx as nx
from pathlib import Path
from config import OUTPUT_DIR

def generate_all_plots(G: nx.DiGraph, results: dict, spectral: dict):
    out_path = Path(OUTPUT_DIR)
    out_path.mkdir(exist_ok=True)
    
    # 1. graph_structure.png
    plt.figure(figsize=(10, 8))
    pos = {n: (d.get('position', (0,0))[0], d.get('position', (0,0))[1]) for n, d in G.nodes(data=True)}
    nx.draw(G, pos, with_labels=True, node_size=500, node_color="lightblue", font_size=8)
    plt.title("Metro Graph Structure")
    plt.savefig(out_path / "graph_structure.png", bbox_inches='tight')
    plt.close()
    
    # 2. occupancy_over_time.png
    plt.figure(figsize=(12, 8))
    for i, (mode, res) in enumerate(results.items()):
        plt.subplot(2, 2, i+1)
        # Plot top 3 nodes
        totals = [(n, sum(res.node_occupancy[n])) for n in G.nodes]
        top3 = sorted(totals, key=lambda x: x[1], reverse=True)[:3]
        for n, _ in top3:
            plt.plot(res.node_occupancy[n], label=n)
        plt.title(f"Occupancy ({mode})")
        plt.legend(prop={'size': 6})
    plt.tight_layout()
    plt.savefig(out_path / "occupancy_over_time.png")
    plt.close()
    
    # 3. queue_lengths.png
    plt.figure(figsize=(10, 6))
    for mode, res in results.items():
        # Plot avg queue length across all nodes at each step
        avg_q = []
        n_steps = len(list(res.queue_lengths.values())[0]) if res.queue_lengths else 0
        for s in range(n_steps):
            q_sum = sum(res.queue_lengths[n][s] for n in G.nodes)
            avg_q.append(q_sum / len(G.nodes) if G.nodes else 0)
        plt.plot(avg_q, label=mode)
    plt.title("Average Queue Lengths")
    plt.legend()
    plt.savefig(out_path / "queue_lengths.png")
    plt.close()
    
    # 4. spectral_analysis.png
    plt.figure(figsize=(8, 5))
    plt.bar(range(1, len(spectral['top_eigenvalues'])+1), spectral['top_eigenvalues'])
    plt.title(f"Top Eigenvalues (Spectral Gap: {spectral['spectral_gap']:.4f})")
    plt.savefig(out_path / "spectral_analysis.png")
    plt.close()
    
    # 5. routing_comparison.png
    plt.figure(figsize=(12, 6))
    modes = list(results.keys())
    tt = [results[m].avg_travel_time for m in modes]
    wt = [results[m].avg_wait_time for m in modes]
    pq = [results[m].peak_queue for m in modes]
    tp = [results[m].throughput for m in modes]
    
    x = range(len(modes))
    plt.subplot(1,4,1); plt.bar(x, tt); plt.xticks(x, modes, rotation=45); plt.title("Avg Travel Time")
    plt.subplot(1,4,2); plt.bar(x, wt); plt.xticks(x, modes, rotation=45); plt.title("Avg Wait Time")
    plt.subplot(1,4,3); plt.bar(x, pq); plt.xticks(x, modes, rotation=45); plt.title("Peak Queue")
    plt.subplot(1,4,4); plt.bar(x, tp); plt.xticks(x, modes, rotation=45); plt.title("Throughput")
    plt.tight_layout()
    plt.savefig(out_path / "routing_comparison.png")
    plt.close()

def print_console_summary(G, results, spectral):
    print("\n" + "="*60)
    print("METRO SIMULATION ROUTING SUMMARY")
    print("="*60)
    header = f"{'Metric':<20} | {'Baseline':<9} | {'Biased':<9} | {'Selfish':<9} | {'Optimized':<9}"
    print(header)
    print("-" * 60)
    
    metrics = [
        ("Avg Travel Time", "avg_travel_time"),
        ("Avg Wait Time", "avg_wait_time"),
        ("Peak Queue", "peak_queue"),
        ("Throughput", "throughput")
    ]
    
    for label, key in metrics:
        row = f"{label:<20}"
        for mode in ["baseline", "biased", "selfish", "optimized"]:
            val = getattr(results[mode], key)
            row += f" | {val:<9.2f}"
        print(row)
    print("="*60 + "\n")
