const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware pour parser le JSON
app.use(express.json());

// Servir les fichiers statiques (html, css, images) du dossier courant
app.use(express.static(path.join(__dirname, '.')));

// Configuration Airtable depuis les variables d'environnement
const AIRTABLE_API_KEY = (process.env.AIRTABLE_API_KEY || "").trim();
const AIRTABLE_BASE_ID = (process.env.AIRTABLE_BASE_ID || "").trim();
const AIRTABLE_TABLE_EMPLOYEES = (process.env.AIRTABLE_TABLE_EMPLOYEES || "Employees").trim();
const AIRTABLE_TABLE_PRESENCES = (process.env.AIRTABLE_TABLE_PRESENCES || "Présences").trim();

// Route API sécurisée pour le pointage
app.post('/api/pointage', async (req, res) => {
    const { pin, type } = req.body; // type: "arrivee" | "depart"

    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
        console.error("Erreur: Variables d'environnement Airtable manquantes");
        return res.status(500).json({ error: "Configuration serveur manquante" });
    }

    try {
        // 1. Chercher l'employé par PIN
        const empFormula = `{pin}="${pin}"`;
        const empTableEncoded = encodeURIComponent(AIRTABLE_TABLE_EMPLOYEES);
        const empUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${empTableEncoded}?filterByFormula=${encodeURIComponent(empFormula)}`;

        const empRes = await fetch(empUrl, {
            headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
        });

        if (!empRes.ok) {
            const errText = await empRes.text();
            throw new Error(`Erreur Airtable (Search Employee): ${empRes.status} ${errText} (URL: ${empUrl})`);
        }

        const empJson = await empRes.json();

        if (!empJson.records || empJson.records.length === 0) {
            return res.status(401).json({ error: `Code PIN incorrect. (Table: ${AIRTABLE_TABLE_EMPLOYEES})` });
        }

        const employee = empJson.records[0];
        // Vérification stricte : Si "actif" n'est pas coché (undefined ou false), on bloque.
        if (!employee.fields || !employee.fields.actif) {
            return res.status(403).json({ error: "⚠️ Accès temporairement indisponible.\nVeuillez vous rapprocher du service administratif." });
        }

        const now = new Date();
        const dateStr = now.toISOString().split("T")[0]; // YYYY-MM-DD
        const timeStr = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

        // 2. Vérification : Est-ce le week-end ?
        const jourSemaine = now.getDay(); // 0 = Dimanche, 6 = Samedi
        if (jourSemaine === 0 || jourSemaine === 6) {
            return res.status(403).json({ error: "Le pointage est interdit le week-end (Samedi et Dimanche)." });
        }

        // 2. Chercher si une présence existe déjà pour aujourd'hui (date)
        const presTableEncoded = encodeURIComponent(AIRTABLE_TABLE_PRESENCES);
        const presFormula = `IS_SAME({date}, DATETIME_PARSE("${dateStr}"), "day")`;
        const presUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${presTableEncoded}?filterByFormula=${encodeURIComponent(presFormula)}`;

        const presRes = await fetch(presUrl, {
            headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
        });

        if (!presRes.ok) {
            const errText = await presRes.text();
            throw new Error(`Erreur Airtable (Search Presence): ${presRes.status} ${errText} (URL: ${presUrl})`);
        }

        const presJson = await presRes.json();

        // Trouver la ligne qui correspond à cet employé (en vérifiant le tableau d'IDs de Linked Record)
        const todayRow = presJson.records.find(r => {
            const links = r.fields.employe;
            return Array.isArray(links) && links.includes(employee.id);
        });

        const presTableUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${presTableEncoded}`;

        if (type === "arrivee") {
            if (todayRow) {
                if (todayRow.fields.heure_arrivee) {
                    return res.status(400).json({ error: "Arrivée déjà enregistrée aujourd'hui." });
                }
                // UPDATE (Patch)
                const patchRes = await fetch(`${presTableUrl}/${todayRow.id}`, {
                    method: 'PATCH',
                    headers: {
                        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ fields: { heure_arrivee: timeStr } })
                });

                if (!patchRes.ok) {
                    const errText = await patchRes.text();
                    throw new Error(`Erreur Airtable (Update Arrivée): ${patchRes.status} ${errText}`);
                }
            } else {
                // CREATE (Post)
                const postRes = await fetch(presTableUrl, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        fields: {
                            employe: [employee.id],
                            date: dateStr,
                            heure_arrivee: timeStr
                        }
                    })
                });

                if (!postRes.ok) {
                    const errText = await postRes.text();
                    throw new Error(`Erreur Airtable (Create Arrivée): ${postRes.status} ${errText}`);
                }
            }
        } else if (type === "depart") {
            if (!todayRow) {
                return res.status(400).json({ error: "Impossible de pointer le départ sans arrivée préalable." });
            }
            if (todayRow.fields.heure_depart) {
                return res.status(400).json({ error: "Départ déjà enregistré aujourd'hui." });
            }
            // UPDATE (Patch)
            const patchRes = await fetch(`${presTableUrl}/${todayRow.id}`, {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ fields: { heure_depart: timeStr } })
            });

            if (!patchRes.ok) {
                const errText = await patchRes.text();
                throw new Error(`Erreur Airtable (Update Départ): ${patchRes.status} ${errText}`);
            }
        }

        res.json({
            ok: true,
            nom: employee.fields.nom || "Employé",
            time: timeStr
        });

    } catch (error) {
        console.error("Erreur serveur:", error);
        res.status(500).json({ error: error.message || "Erreur lors du traitement de la demande." });
    }
});

// Route par défaut
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`Serveur démarré sur le port ${port}`);
});
