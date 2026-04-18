import networkx as nx
from typing import List, Dict, Tuple
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
try:
    from config import LAYER_TRANSITION_COST
except ImportError:
    LAYER_TRANSITION_COST = 2.0

def get_all_simple_paths(G: nx.DiGraph, source: str, target: str, cutoff: int = 15) -> List[List[str]]:
    """Enumerate all simple paths between source and target up to a cutoff length."""
    return list(nx.all_simple_paths(G, source, target, cutoff=cutoff))

def compute_path_cost(G: nx.DiGraph, path: List[str], edge_flows: Dict[Tuple[str, str], float], queue_metrics: Dict[str, dict], beta: float = 0.5) -> float:
    """
    Computes game-theoretic cost of a path.
    cost(path) = Σ_e [ travel_time(e) × (1 + β × flow(e)/capacity(e)) ]
               + Σ_v [ waiting_time(v) ]
               + n_layer_transitions × transition_penalty
    """
    cost = 0.0
    # Evaluate Nodes
    for i in range(len(path)):
        node = path[i]
        # Queue delays
        if queue_metrics and node in queue_metrics:
            cost += queue_metrics[node].get("waiting_time", 0.0)
            
    # Evaluate Edges and Layer transitions
    for i in range(len(path) - 1):
        u, v = path[i], path[i+1]
        
        # Base travel time
        e_data = G.edges[u, v]
        base_time = e_data.get('weight', 1.0)
        cap = e_data.get('capacity', 20)
        flow = edge_flows.get((u, v), 0.0)
        
        # BPR-like congestion function term
        edge_cost = base_time * (1.0 + beta * (flow / max(1.0, cap)))
        
        # Layer transition penalty
        layer_u = G.nodes[u].get('layer', 'unknown')
        layer_v = G.nodes[v].get('layer', 'unknown')
        if layer_u != layer_v:
            edge_cost += LAYER_TRANSITION_COST
            
        cost += edge_cost
        
    return cost

def shortest_path_by_cost(G: nx.DiGraph, source: str, target: str, edge_flows: Dict, queue_metrics: Dict) -> List[str]:
    """Finds shortest path using the dynamic cost function."""
    def weight_func(u, v, d):
        base_time = d.get('weight', 1.0)
        cap = d.get('capacity', 20)
        flow = edge_flows.get((u, v), 0.0)
        edge_cost = base_time * (1.0 + 0.5 * (flow / max(1.0, cap)))
        
        layer_u = G.nodes[u].get('layer', 'unknown')
        layer_v = G.nodes[v].get('layer', 'unknown')
        if layer_u != layer_v:
            edge_cost += LAYER_TRANSITION_COST
            
        return edge_cost + (queue_metrics.get(v, {}).get("waiting_time", 0.0) if queue_metrics else 0.0)
    
    try:
        return nx.shortest_path(G, source, target, weight=weight_func)
    except nx.NetworkXNoPath:
        return []

def compute_distances_to_exits(G: nx.DiGraph, exit_nodes: List[str]) -> Dict[str, float]:
    """
    Computes shortest-path distance from every node to the nearest exit.
    Used for markov random walk bias.
    """
    dist_to_exit = {}
    for node in G.nodes():
        min_dist = float('inf')
        for ex in exit_nodes:
            try:
                d = nx.shortest_path_length(G, node, ex, weight='weight')
                min_dist = min(min_dist, d)
            except nx.NetworkXNoPath:
                pass
        dist_to_exit[node] = min_dist
    return dist_to_exit
