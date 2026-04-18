import numpy as np
import networkx as nx
from markov_model import baseline_transition_matrix

def compute_spectral_metrics(G: nx.DiGraph) -> dict:
    """
    spectral_gap    = 1 - |λ₂| of the transition matrix P
    mixing_time     ≈ ceil(log(100) / spectral_gap)   [ε=0.01 bound]
    stationary_dist = left eigenvector of P for λ=1   [satisfies πP = π]
    bottleneck_nodes: nodes with highest eigenvector centrality
    """
    P = baseline_transition_matrix(G)
    nodes = list(G.nodes)
    
    # Eigen decomposition (left eigenvectors for stationary dist)
    eigenvalues, eigenvectors = np.linalg.eig(P.T)
    
    # Sort by magnitude descending
    idx = np.argsort(np.abs(eigenvalues))[::-1]
    eigenvalues = eigenvalues[idx]
    eigenvectors = eigenvectors[:, idx]
    
    # Top eigenvalues
    top_evals = [float(np.abs(e)) for e in eigenvalues[:5]]
    
    # Spectral gap
    if len(top_evals) > 1:
        gap = 1.0 - top_evals[1]
    else:
        gap = 1.0
    
    gap = max(1e-6, gap)
    
    # Mixing time
    mixing_time = int(np.ceil(np.log(100) / gap))
    
    # Stationary distribution (leading eigenvector)
    # The leading eigenvalue is ~1.0
    stat_dist_vec = np.abs(eigenvectors[:, 0])
    if stat_dist_vec.sum() > 0:
        stat_dist_vec = stat_dist_vec / stat_dist_vec.sum()
        
    stationary_dist = {str(n): float(stat_dist_vec[i]) for i, n in enumerate(nodes)}
    
    # Eigenvector centrality via networkx (more robust for directed graphs)
    try:
        ev_cent = nx.eigenvector_centrality_numpy(G, weight='weight')
    except (nx.NetworkXException, TypeError):
        ev_cent = nx.in_degree_centrality(G)
        
    eigenvector_centrality = {str(k): float(v) for k, v in ev_cent.items()}
    
    # Bottlenecks = top 3 nodes by eigenvector centrality
    bottleneck_nodes = sorted(ev_cent.keys(), key=lambda x: ev_cent[x], reverse=True)[:3]
    
    return {
        "spectral_gap": float(gap),
        "mixing_time": mixing_time,
        "top_eigenvalues": top_evals,
        "stationary_dist": stationary_dist,
        "eigenvector_centrality": eigenvector_centrality,
        "bottleneck_nodes": bottleneck_nodes
    }
