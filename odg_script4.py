import numpy as np

# ================================================================
#  ENTRÉES UTILISATEUR
# ================================================================
try:
    T_ext     = float(input("Température extérieure (°C) : "))
    T_desired = float(input("Température souhaitée à t2 (°C) : "))
    tolerance = float(input("Tolérance ± (°C) : "))
except ValueError:
    print("Erreur : veuillez entrer des nombres valides.")
    exit()

# ================================================================
#  PARAMÈTRES PHYSIQUES
# ================================================================
T_int_initial = T_desired          # la temperature a t_0 cad 20h du soir correspond a la temperature que l'utilisateur souhaite impose dans le batiment T_desired

C_air   = 1.6e5                    # J/K
C_beton = 2.6e7                    # J/K
C_m     = C_air + C_beton          # J/K
R_eq    = 0.0056                   # K/W
P_r_max = 7680                    # W — puissance maximale fournie par les radiateur d'une salle (on a determiner cette valeur en utilisant la temperature maximal d'un radiateur T_r_max=80° environ)

t2_h     = 11.0                    # durée de la nuit (h) 
kWh_cost = 0.16                    # €/kWh
n_salles = 130


if T_desired <= T_ext:
    print("T_ext ≥ T_desired : aucun chauffage nécessaire.")
    exit()

P_r = (T_desired - T_ext) / R_eq   # Formule exprimee dans le modèle 1

print(f"\nPuissance de maintien nécessaire : P_r = {P_r:.0f} W")

if P_r > P_r_max:                  # Si la temperature du radiateur pour satisfaire les donnees d'entree depasse la temperature maximale, alors il est impossible de satisfaire la requete.
    print(f"\n⚠  P_r = {P_r:.0f} W  >  P_r_max = {P_r_max} W")
    print(f"   Impossible de maintenir {T_desired} °C quand T_ext = {T_ext} °C même si on chauffe toute la nuit")
    print(f"   ΔT max atteignable = P_r_max × R_eq = {P_r_max * R_eq:.1f} °C")
    print(f"   → T_int max possible = {T_ext + P_r_max * R_eq:.1f} °C")
    exit()

tau_s = C_m * R_eq
''''
# ================================================================
#  DIAGNOSTIC
# ================================================================
tau_s = C_m * R_eq
tau_h = tau_s / 3600

print(f"\n{'='*58}")
print(f"  DIAGNOSTIC DES PARAMÈTRES")
print(f"{'='*58}")
print(f"  Constante de temps     τ = {tau_h:.1f} h")
print(f"  T_éq (P_r   = {P_r:>6.0f} W) = {T_ext + P_r * R_eq:.1f} °C")
print(f"  T_éq (P_max = {P_r_max:>6.0f} W) = {T_ext + P_r_max * R_eq:.1f} °C")
print(f"  Consigne               = {T_desired} ± {tolerance} °C")
print(f"{'='*58}")
'''
# ================================================================
#  MODÈLE THERMIQUE (vectorisé NumPy)
# ================================================================
def calc_T(T0, T_ext, P, t1_s, t2_s):
    """
    Phase 1  [0 → t1]  : chauffage OFF  → T décroît vers T_ext
    Phase 2  [t1 → t2] : chauffage ON à P → T croît vers T_ext + P·R_eq
    """
    T_t1 = (T0 - T_ext) * np.exp(-t1_s / tau_s) + T_ext
    T_eq = T_ext + P * R_eq
    T_t2 = (T_t1 - T_eq) * np.exp(-(t2_s - t1_s) / tau_s) + T_eq
    return T_t1, T_t2

# ================================================================
#  RECHERCHE DU t1 MAXIMAL + BILAN ÉCONOMIQUE
# ================================================================
def recherche(P_chauffe, label):
    t2_s     = t2_h * 3600
    t1_arr_h = np.linspace(0, t2_h, 50_001)   # résolution ≈ 0.8 s
    t1_arr_s = t1_arr_h * 3600

    T1, T2 = calc_T(T_int_initial, T_ext, P_chauffe, t1_arr_s, t2_s)

    mask = (T2 >= T_desired - tolerance) & (T2 <= T_desired + tolerance)

    if not np.any(mask):
        print(f"\n--- {label} ---")
        print("  Aucune durée d'extinction ne respecte la consigne.")
        return

    # On prend le t1 le PLUS GRAND (extinction la plus longue possible)
    idx      = np.where(mask)[0][-1]
    t1_opt_h = t1_arr_h[idx]
    t1_opt_s = t1_opt_h * 3600
    h        = int(t1_opt_h)
    m        = int(round((t1_opt_h - h) * 60))

    # ── Bilan énergétique ──
    # Référence : radiateur à P_r pendant toute la nuit
    # Scénario  : rien pendant t1, puis P_chauffe pendant (t2 − t1)
    E_baseline   = P_r      * t2_s             * n_salles
    E_scenario   = P_chauffe * (t2_s - t1_opt_s) * n_salles
    E_saving_J   = E_baseline - E_scenario
    E_saving_kWh = E_saving_J / 3.6e6
    money        = E_saving_kWh * kWh_cost

    print(f"\n--- {label} ---")
    print(f"  Extinction maximale : {h} h {m:02d} min")
    print(f"  T(t1) = {T1[idx]:.2f} °C  →  T(t2) = {T2[idx]:.2f} °C")
    print(f"  Énergie économisée  : {E_saving_kWh:+.0f} kWh  soit  {money:+.2f} €/nuit")
    if E_saving_J < 0:
        print("  ⚠  Le surcoût du boost dépasse l'économie de l'extinction !")

# ================================================================
#  EXÉCUTION
# ================================================================
recherche(P_r,     f"Méthode 1 — rallumer à P_r = {P_r:.0f} W (puissance normale)")
recherche(P_r_max, f"Méthode 2 — rallumer à P_max = {P_r_max} W (puissance maximale)")