import numpy as np
import networkx as nx
from scipy.special import softmax

def _ensure_stochastic(P: np.ndarray) -> np.ndarray:
    # Handle zero rows by making them uniform over available out-edges
    # but if a node is a sink (no out edges), we usually make it a self-loop
    row_sums = P.sum(axis=1)
    # Give sinks a self-loop probability of 1.0
    for i in range(P.shape[0]):
        if row_sums[i] == 0:
            P[i, i] = 1.0
        else:
            P[i] = P[i] / P[i].sum()
    
    assert np.allclose(P.sum(axis=1), 1.0, atol=1e-6), "Transition matrix not row-stochastic"
    return P

def baseline_transition_matrix(G: nx.DiGraph) -> np.ndarray:
    N = len(G.nodes)
    P = np.zeros((N, N))
    nodes = list(G.nodes)
    
    for i, u in enumerate(nodes):
        out_edges = list(G.successors(u))
        if out_edges:
            prob = 1.0 / len(out_edges)
            for v in out_edges:
                j = nodes.index(v)
                P[i, j] = prob
                
    return _ensure_stochastic(P)

def biased_transition_matrix(G: nx.DiGraph, dest_node: str, occupancy: dict, queue_metrics: dict, weights: dict) -> np.ndarray:
    N = len(G.nodes)
    nodes = list(G.nodes)
    P = np.zeros((N, N))
    
    # Pre-calculate distances to exit (dest_node or any exit)
    # Using shortest path from all nodes to dest_node
    # Actually, we should calculate distance from each node to dest_node
    sp_dist = {}
    if dest_node in G.nodes:
        try:
            sp_dist = nx.shortest_path_length(G, target=dest_node, weight='weight')
        except nx.NetworkXNoPath:
            sp_dist = {}
            
    # Pre-calc nearest exit
    exits = [n for n, d in G.nodes(data=True) if d.get('type') == 'exit']
    dist_nearest_exit = {}
    for n in nodes:
        min_d = float('inf')
        for ex in exits:
            try:
                d = nx.shortest_path_length(G, source=n, target=ex, weight='weight')
                min_d = min(min_d, d)
            except nx.NetworkXException:
                pass
        dist_nearest_exit[n] = min_d if min_d != float('inf') else 1000.0

    w_sp = weights.get("W_SHORTEST_PATH", 1.2)
    w_exit = weights.get("W_EXIT_PULL", 0.8)
    w_cong = weights.get("W_CONGESTION", 1.5)
    w_attr = weights.get("W_ATTRACTIVENESS", 0.6)
    w_q = weights.get("W_QUEUE_DELAY", 1.0)
    
    for i, u in enumerate(nodes):
        out_edges = list(G.successors(u))
        if not out_edges:
            continue
            
        scores = []
        indices = []
        
        for v in out_edges:
            j = nodes.index(v)
            indices.append(j)
            
            # SP to dest
            d_dest = sp_dist.get(v, 1000.0)
            score_sp = 1.0 / (1.0 + d_dest)
            
            # SP to nearest exit
            d_exit = dist_nearest_exit.get(v, 1000.0)
            score_exit = 1.0 / (1.0 + d_exit)
            
            # Congestion
            v_cap = max(1, G.nodes[v].get('capacity', 20))
            util = occupancy.get(v, 0) / v_cap
            score_cong = max(0.0, 1.0 - util)
            
            # Attractiveness
            score_attr = G.edges[u, v].get('attractiveness', 1.0)
            
            # Queue delay
            q_time = queue_metrics.get(v, 0.0)
            score_q = 1.0 / (1.0 + q_time)
            
            total_score = (w_sp * score_sp) + (w_exit * score_exit) + (w_cong * score_cong) + (w_attr * score_attr) + (w_q * score_q)
            scores.append(total_score)
            
        if scores:
            scores = np.array(scores)
            probs = softmax(scores)
            for idx, prob in zip(indices, probs):
                P[i, idx] = prob
                
    return _ensure_stochastic(P)


def congestion_adjusted_matrix(G: nx.DiGraph, occupancy: dict) -> np.ndarray:
    N = len(G.nodes)
    nodes = list(G.nodes)
    P = np.zeros((N, N))
    
    for i, u in enumerate(nodes):
        out_edges = list(G.successors(u))
        if not out_edges:
            continue
            
        scores = []
        indices = []
        
        for v in out_edges:
            j = nodes.index(v)
            indices.append(j)
            
            v_cap = max(1, G.nodes[v].get('capacity', 20))
            util = occupancy.get(v, 0) / v_cap
            # Higher utilization -> lower score
            score_cong = max(0.01, 1.0 - util)
            scores.append(score_cong)
            
        if scores:
            probs = softmax(np.array(scores))
            for idx, prob in zip(indices, probs):
                P[i, idx] = prob
                
    return _ensure_stochastic(P)


def layered_transition_matrix(G: nx.DiGraph) -> np.ndarray:
    N = len(G.nodes)
    nodes = list(G.nodes)
    P = np.zeros((N, N))
    
    for i, u in enumerate(nodes):
        out_edges = list(G.successors(u))
        if not out_edges:
            continue
            
        u_layer = G.nodes[u].get('layer')
        scores = []
        indices = []
        
        for v in out_edges:
            j = nodes.index(v)
            indices.append(j)
            
            v_layer = G.nodes[v].get('layer')
            if u_layer == v_layer:
                # Same layer: mildly bias
                scores.append(1.0)
            else:
                # Inter-layer edges use inverse weight (higher weight = lower score)
                w = G.edges[u, v].get('weight', 1.0)
                scores.append(1.0 / (1.0 + w))
                
        if scores:
            probs = softmax(np.array(scores))
            for idx, prob in zip(indices, probs):
                P[i, idx] = prob
                
    return _ensure_stochastic(P)
