import numpy as np

# ================================
# 1️⃣ Données générales
# ================================
try:
    T_ext = float(input("Entrez la température extérieure en °C : "))
    T_desired = float(input("Entrez la température souhaitée à t2 en °C : "))
    tolerance = float(input("Entrez la tolérance ± en °C : "))
except ValueError:
    print("Erreur : veuillez entrer des nombres valides.")
    exit()

# Paramètres constants
T_int_initial = T_desired
P_r = 7e2             # puissance normale radiateur (W)
P_r_max = 2e3         # puissance maximale radiateur (W)
C_air = 1.6e5
C_beton = 2.6e7
C_m = C_air + C_beton
R_eq = 0.02
t2_h = 11.0
kWh_cost = 0.16
n_salles = 130

# Fonction calcul T(t1) et T(t2)
def T_t2(T_int, T_ext, P_r_current, t1_s, t2_s):
    T_t1 = (T_int - T_ext) * np.exp(-t1_s / (C_m * R_eq)) + T_ext
    T_t2_val = (T_t1 - T_ext - P_r_current * R_eq) * np.exp(-(t2_s - t1_s) / (C_m * R_eq)) + T_ext + P_r_current * R_eq
    return T_t1, T_t2_val

# ================================
# 2️⃣ Méthode 1 : chauffer à puissance normale durant plus longtemps
# ================================
def methode1():
    t1_values = np.linspace(0, t2_h, 111)
    results = []

    for t1_h in t1_values:
        t1_s = t1_h * 3600
        t2_s = t2_h * 3600
        T1, T2 = T_t2(T_int_initial, T_ext, P_r, t1_s, t2_s)
        results.append((t1_h, T1, T2))

    filtered = [(t1, T1, T2) for t1, T1, T2 in results if T_desired - tolerance <= T2 <= T_desired + tolerance]

    if filtered:
        selected = max(filtered, key=lambda x: x[0])
        t1_h = int(selected[0])
        t1_min = int(round((selected[0]-t1_h)*60))
        t1_s = selected[0] * 3600

        # Économie
        E_gain_total = P_r * t1_s * n_salles
        E_gain_kWh_total = E_gain_total / 3.6e6
        money_gain_total = E_gain_kWh_total * kWh_cost

        print("\n--- Méthode 1 : puissance normale ---")
        print(f"t1 optimal : {t1_h} h {t1_min} min")
        print(f"T(t1) = {selected[1]:.2f} °C, T(t2) = {selected[2]:.2f} °C")
        print(f"Économie énergétique totale : {E_gain_total:.2e} J ({E_gain_kWh_total:.0f} kWh)")
        print(f"Économie monétaire totale : {money_gain_total:.2f} €")
    else:
        print("\n--- Méthode 1 : puissance normale ---")
        print("Aucun couple ne respecte la condition de température.")

# ================================
# 3️⃣ Méthode 2 : chauffer à puissance normale durant plus longtemps 
# ================================
def methode2():
    t1_values = np.linspace(0, t2_h, 111)
    results = []

    for t1_h in t1_values:
        t1_s = t1_h * 3600
        t2_s = t2_h * 3600
        T1, T2 = T_t2(T_int_initial, T_ext, P_r_max, t1_s, t2_s)
        results.append((t1_h, T1, T2))

    filtered = [(t1, T1, T2) for t1, T1, T2 in results if T_desired - tolerance <= T2 <= T_desired + tolerance]

    if filtered:
        selected = max(filtered, key=lambda x: x[0])
        t1_h = int(selected[0])
        t1_min = int(round((selected[0]-t1_h)*60))
        t1_s = selected[0] * 3600
        t2_s = t2_h * 3600

        # Économie = gain arrêt radiateur - coût boost
        E_gain_arret = P_r * t1_s * n_salles                    # gain sur t1
        E_cout_boost = (P_r_max - P_r) * (t2_s - t1_s) * n_salles  # coût entre t1 et t2
        E_net_total = E_gain_arret - E_cout_boost

        E_net_kWh = E_net_total / 3.6e6
        money_net_total = E_net_kWh * kWh_cost

        print("\n--- Méthode 2 : puissance maximale ---")
        print(f"t1 optimal : {t1_h} h {t1_min} min")
        print(f"T(t1) = {selected[1]:.2f} °C, T(t2) = {selected[2]:.2f} °C")
        print(f"Économie énergétique nette : {E_net_total:.2e} J ({E_net_kWh:.0f} kWh)")
        print(f"Économie monétaire nette : {money_net_total:.2f} €")
    else:
        print("\n--- Méthode 2 : puissance maximale ---")
        print("Aucun couple ne respecte la condition de température.")

# ================================
# Exécution
# ================================
methode1()
methode2()