let pyodide = null;
let pyodideReady = false;

// --- DOM ---
const runButton = document.getElementById('runButton');
const pyodideLoading = document.getElementById('pyodideLoading');
const simResults = document.getElementById('simResults');
const simError = document.getElementById('simError');
const method1Card = document.getElementById('method1Card');
const method2Card = document.getElementById('method2Card');
const method1Results = document.getElementById('method1Results');
const method2Results = document.getElementById('method2Results');

// --- Sliders ---
const sliderText = document.getElementById('inputText');
const sliderTdesired = document.getElementById('inputTdesired');
const sliderTolerance = document.getElementById('inputTolerance');
const textVal = document.getElementById('textVal');
const tdesiredVal = document.getElementById('tdesiredVal');
const toleranceVal = document.getElementById('toleranceVal');

sliderText.addEventListener('input', () => { textVal.textContent = sliderText.value; });
sliderTdesired.addEventListener('input', () => { tdesiredVal.textContent = sliderTdesired.value; });
sliderTolerance.addEventListener('input', () => { toleranceVal.textContent = sliderTolerance.value; });


async function initPyodide() {
    try {
        pyodide = await loadPyodide();
        await pyodide.loadPackage('numpy');
        pyodideReady = true;
        pyodideLoading.classList.add('hidden');
        runButton.disabled = false;
        runButton.querySelector('.sim-button-text').textContent = 'Lancer la simulation';
    } catch (err) {
        pyodideLoading.innerHTML = `
            <p style="color:#c0392b; font-weight:600;"> Erreur de chargement</p>
            <p style="color:#9a94b0; font-size:0.85rem; margin-top:8px;">${err.message}</p>
        `;
    }
}

initPyodide();


const pythonScript = `
import numpy as np
import json

def run_simulation(T_ext, T_desired, tolerance):
    output = {
        "error": None,
        "method1": None,
        "method2": None
    }

    # ================================================================
    # PARAMÈTRES PHYSIQUES
    # ================================================================
    T_int_initial = T_desired  # la temperature a t_0 cad 20h du soir correspond a la temperature que l'utilisateur souhaite impose dans le batiment T_desired

    C_air   = 1.6e5
    C_beton = 2.6e7
    C_m     = C_air + C_beton
    R_eq    = 0.0056
    P_r_max = 7680 # W — puissance maximale fournie par les radiateur d'une salle (on a determiner cette valeur en utilisant la temperature maximal d'un radiateur T_r_max=80° environ)

    t2_h     = 11.0
    kWh_cost = 0.16
    n_salles = 130

    # ================================================================
    # VÉRIFICATIONS
    # ================================================================
    if T_desired <= T_ext:
        output["error"] = f"T_ext ({T_ext} °C) >= T_desired ({T_desired} °C) : aucun chauffage nécessaire."
        return json.dumps(output)

    P_r = (T_desired - T_ext) / R_eq # Formule exprimee dans le modèle 1

    if P_r > P_r_max:
        output["error"] = (
            f"P_r = {P_r:.0f} W > P_r_max = {P_r_max} W. "
            f"Impossible de maintenir {T_desired} °C quand T_ext = {T_ext} °C même en chauffant toute la nuit. "
            f"ΔT max atteignable = P_r_max × R_eq = {P_r_max * R_eq:.1f} °C. "
            f"T_int max possible = {T_ext + P_r_max * R_eq:.1f} °C"
        )
        return json.dumps(output)

    tau_s = C_m * R_eq

    # ================================================================
    # calc_T
    # ================================================================
    def calc_T(T0, T_ext, P, t1_s, t2_s):
        T_t1 = (T0 - T_ext) * np.exp(-t1_s / tau_s) + T_ext
        T_eq = T_ext + P * R_eq
        T_t2 = (T_t1 - T_eq) * np.exp(-(t2_s - t1_s) / tau_s) + T_eq
        return T_t1, T_t2

    # ================================================================
    # recherche
    # ================================================================
    # pour determinée la valeur de t1 optimal on :
    #           supprime tout les valeur de t1 qui ne respectent pas la consigne T_desired +/- tolerance 
    #           parmis les valeurs restantes on prend la valeur t1 la plus grande possible

    def recherche(P_chauffe):
        t2_s = t2_h * 3600
        t1_arr_h = np.linspace(0, t2_h, 50_001)
        t1_arr_s = t1_arr_h * 3600

        T1, T2 = calc_T(T_int_initial, T_ext, P_chauffe, t1_arr_s, t2_s)

        mask = (T2 >= T_desired - tolerance) & (T2 <= T_desired + tolerance)

        if not np.any(mask):
            return {"found": False}

        idx      = int(np.where(mask)[0][-1])
        t1_opt_h = float(t1_arr_h[idx])
        t1_opt_s = t1_opt_h * 3600
        h        = int(t1_opt_h)
        m        = int(round((t1_opt_h - h) * 60))

        # Bilan énergétique
        E_baseline   = P_r       * t2_s              * n_salles
        E_scenario   = P_chauffe * (t2_s - t1_opt_s) * n_salles
        E_saving_J   = E_baseline - E_scenario
        E_saving_kWh = E_saving_J / 3.6e6
        money        = E_saving_kWh * kWh_cost

        # Puissance économisée (différence de puissance × durée de chauffe réduite)
        # = ce que les radiateurs ne consomment pas par rapport au scénario de référence
        P_saving_W   = (P_r * t2_s - P_chauffe * (t2_s - t1_opt_s)) / t2_s

        return {
            "found":        True,
            "t1_h":         h,
            "t1_m":         m,
            "t1_opt_h":     round(t1_opt_h, 2),
            "T_t1":         round(float(T1[idx]), 2),
            "T_t2":         round(float(T2[idx]), 2),
            "E_saving_kWh": round(E_saving_kWh, 0),
            "money":        round(money, 2),
            "P_chauffe":    round(P_chauffe, 0),
            "P_saving_W":   round(P_saving_W, 0),
            "negative":     bool(E_saving_J < 0)
        }

    # ================================================================
    # EXÉCUTION
    # ================================================================
    output["method1"] = recherche(P_r)
    output["method2"] = recherche(P_r_max)

    return json.dumps(output)
`;


runButton.addEventListener('click', async() => {
    if (!pyodideReady) return;

    const T_ext = parseFloat(sliderText.value);
    const T_desired = parseFloat(sliderTdesired.value);
    const tolerance = parseFloat(sliderTolerance.value);

    // Feedback visuel
    runButton.classList.add('running');
    runButton.querySelector('.sim-button-text').textContent = 'Calcul en cours…';
    runButton.querySelector('.sim-button-icon').textContent = '⟳';
    runButton.disabled = true;

    // Reset
    simResults.style.display = 'none';
    simError.style.display = 'none';
    method1Card.style.display = 'none';
    method2Card.style.display = 'none';

    try {
        await pyodide.runPythonAsync(pythonScript);

        const resultJSON = await pyodide.runPythonAsync(
            `run_simulation(${T_ext}, ${T_desired}, ${tolerance})`
        );
        const results = JSON.parse(resultJSON);

        simResults.style.display = 'block';

        if (results.error) {
            simError.style.display = 'block';
            simError.innerHTML = `${results.error}`;
        } else {
            if (results.method1) {
                renderMethod(results.method1, method1Card, method1Results);
            }
            if (results.method2) {
                renderMethod(results.method2, method2Card, method2Results);
            }
        }
    } catch (err) {
        simResults.style.display = 'block';
        simError.style.display = 'block';
        simError.innerHTML = `Erreur Python : ${err.message}`;
    }

    // Reset bouton
    runButton.classList.remove('running');
    runButton.querySelector('.sim-button-text').textContent = 'Lancer la simulation';
    runButton.querySelector('.sim-button-icon').textContent = '▶';
    runButton.disabled = false;
});


function renderMethod(data, card, container) {
    card.style.display = 'block';

    if (!data.found) {
        container.innerHTML = `
            <div class="sim-stat-warning">
                Aucune durée d'extinction ne respecte la consigne avec cette puissance.
            </div>
        `;
        return;
    }

    const moneySign = data.money >= 0 ? '+' : '';
    const moneyClass = data.money >= 0 ? 'positive' : 'negative';
    const eSign = data.E_saving_kWh >= 0 ? '+' : '';

    container.innerHTML = `
        <ul class="sim-result-list">
            <li>
                <span class="sim-list-label">Durée maximale d'extinction des radiateurs :</span>
                <span class="sim-list-value">${data.t1_h} h ${String(data.t1_m).padStart(2, '0')} min</span>
            </li>
            <li>
                <span class="sim-list-label">Puissance fournie par les radiateurs entre t₁ et t₂ :</span>
                <span class="sim-list-value">${data.P_chauffe} W</span>
            </li>
            <li class="sim-list-separator"></li>
            <li>
                <span class="sim-list-label">T(t₁) </span>
                <span class="sim-list-value">${data.T_t1} °C</span>
            </li>
            <li>
                <span class="sim-list-label">T(t₂) </span>
                <span class="sim-list-value">${data.T_t2} °C</span>
            </li>
            <li class="sim-list-separator"></li>
            <li>
                <span class="sim-list-label">Puissance économisée (moyenne sur la nuit) :</span>
                <span class="sim-list-value">${data.P_saving_W} W</span>
            </li>
            <li>
                <span class="sim-list-label">Énergie économisée :</span>
                <span class="sim-list-value">${eSign}${data.E_saving_kWh} kWh</span>
            </li>
            <li>
                <span class="sim-list-label">Économie :</span>
                <span class="sim-list-value ${moneyClass}">${moneySign}${data.money.toFixed(2)} € </span>
            </li>
        </ul>
        ${data.negative ? '<div class="sim-stat-warning">⚠ Le surcoût du boost dépasse l\'économie de l\'extinction !</div>' : ''}
    `;
}