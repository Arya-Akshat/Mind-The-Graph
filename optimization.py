import numpy as np
import networkx as nx

def rebalance_flows(G: nx.DiGraph, occupancy: dict, P: np.ndarray, alpha=0.1) -> np.ndarray:
    from config import REBALANCE_THRESH, REBALANCE_STEP
    
    N = len(G.nodes)
    nodes = list(G.nodes)
    
    for v_idx, v in enumerate(nodes):
        cap = max(1, G.nodes[v].get('capacity', 20))
        util = occupancy.get(v, 0.0) / cap
        
        if util > REBALANCE_THRESH:
            # For each incoming neighbor of v
            # wait, P is P[u, v], so we iterate u
            for u_idx, u in enumerate(nodes):
                if P[u_idx, v_idx] > 0:
                    # Find least congested neighbor of u
                    out_edges = list(G.successors(u))
                    if len(out_edges) <= 1:
                        continue
                        
                    min_util = float('inf')
                    best_target_idx = -1
                    
                    for tgt in out_edges:
                        tgt_idx = nodes.index(tgt)
                        tgt_cap = max(1, G.nodes[tgt].get('capacity', 20))
                        tgt_util = occupancy.get(tgt, 0.0) / tgt_cap
                        if tgt_util < min_util:
                            min_util = tgt_util
                            best_target_idx = tgt_idx
                            
                    if best_target_idx != -1 and best_target_idx != v_idx:
                        reduction = REBALANCE_STEP * P[u_idx, v_idx]
                        P[u_idx, v_idx] -= reduction
                        P[u_idx, best_target_idx] += reduction
                        
    # Re-normalize rows strictly safely
    for i in range(N):
        s = P[i].sum()
        if s > 0:
            P[i] = P[i] / s
        else:
            P[i, i] = 1.0
            
    assert np.allclose(P.sum(axis=1), 1.0, atol=1e-5), "Rebalanced matrix not row-stochastic"
    return P


def find_critical_edges(G: nx.DiGraph) -> list:
    """
    Returns top-5 edges by: betweenness_centrality(e) / capacity(e)
    High score = structurally critical AND low capacity = likely bottleneck.
    """
    edge_bc = nx.edge_betweenness_centrality(G, weight='weight')
    
    scores = []
    for (u, v), bc in edge_bc.items():
        cap = max(1.0, G.edges[u, v].get('capacity', 20.0))
        scores.append(((u, v), bc / cap))
        
    scores.sort(key=lambda x: x[1], reverse=True)
    return [e[0] for e in scores[:5]]
