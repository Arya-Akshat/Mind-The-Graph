from dataclasses import dataclass
import math

@dataclass
class QueueNode:
    node_id: str
    service_rate: float      # μ
    capacity: int            # K
    arrival_rate: float = 0.0
    queue_length: float = 0.0
    waiting_time: float = 0.0
    utilization: float  = 0.0
    departures: int     = 0

    def update(self, new_arrival_rate: float, congestion_alpha: float):
        """
        M/M/1/K update step.
        """
        self.arrival_rate = new_arrival_rate
        mu = self.service_rate
        if mu <= 0:
            mu = 1e-6
            
        rho = self.arrival_rate / mu
        rho = min(rho, 0.999) # Guard
        
        K = self.capacity
        if K < 1:
            K = 1

        if rho < 0.99 and K > 50:
            Lq = (rho ** 2) / (1 - rho)
            Wq = Lq / self.arrival_rate if self.arrival_rate > 0 else 0
        else:
            if rho != 1.0:
                P0 = (1 - rho) / (1 - (rho ** (K + 1)))
                L = (rho / (1 - rho)) - ((K + 1) * (rho ** (K + 1)) / (1 - (rho ** (K + 1))))
            else:
                L = K / 2.0
            
            # Reconstruct Lq from L (L = Lq + Ls, Ls ~= rho)
            Lq = max(0.0, L - rho)
            Wq = Lq / self.arrival_rate if self.arrival_rate > 0 else 0
            
        # Service slowdown
        mu_eff = mu * max(0.2, 1.0 - congestion_alpha * (Lq / K))
        mu_eff = max(mu_eff, 1e-6)
        
        # Recalculate with mu_eff to get final values
        rho_final = self.arrival_rate / mu_eff
        rho_final = min(rho_final, 0.999)
        
        if rho_final < 0.99 and K > 50:
            self.queue_length = (rho_final ** 2) / (1 - rho_final)
            self.waiting_time = self.queue_length / self.arrival_rate if self.arrival_rate > 0 else 0
        else:
            if rho_final != 1.0:
                L_f = (rho_final / (1 - rho_final)) - ((K + 1) * (rho_final ** (K + 1)) / (1 - (rho_final ** (K + 1))))
            else:
                L_f = K / 2.0
            self.queue_length = max(0.0, L_f - rho_final)
            self.waiting_time = self.queue_length / self.arrival_rate if self.arrival_rate > 0 else 0
            
        self.utilization = rho_final
        
        # Estimate departures
        departed = min(self.queue_length + self.arrival_rate, mu_eff)
        self.departures = int(math.floor(departed))
