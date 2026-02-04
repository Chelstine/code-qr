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
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TABLE_EMPLOYEES = process.env.AIRTABLE_TABLE_EMPLOYEES || "Employees";
const AIRTABLE_TABLE_PRESENCES = process.env.AIRTABLE_TABLE_PRESENCES || "Présences";

// Route API sécurisée pour le pointage
app.post('/api/pointage', async (req, res) => {
    const { pin, type } = req.body;

    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
        console.error("Erreur: Variables d'environnement Airtable manquantes");
        return res.status(500).json({ error: "Configuration serveur manquante" });
    }

    try {
        // 1. Chercher l'employé par PIN
        const formula = `{pin}="${pin}"`;
        const empUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_EMPLOYEES)}?filterByFormula=${encodeURIComponent(formula)}`;

        const empRes = await fetch(empUrl, {
            headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
        });

        if (!empRes.ok) {
            const errText = await empRes.text();
            throw new Error(`Erreur Airtable (Search): ${empRes.status} ${errText}`);
        }

        const empJson = await empRes.json();

        if (!empJson.records || empJson.records.length === 0) {
            return res.status(401).json({ error: "Code PIN incorrect." });
        }

        const employee = empJson.records[0];
        // Vérification si actif (si le champ existe)
        if (employee.fields && employee.fields.actif === false) {
            return res.status(403).json({ error: "Compte désactivé." });
        }

        // 2. Créer l'enregistrement de présence
        const now = new Date();
        const presenceData = {
            fields: {
                employe: [employee.id], // Relation vers la table Employees
                type: (type === "arrivee" ? "Arrivée" : "Départ"),
                date: now.toISOString().split("T")[0],
                heure: now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
                timestamp: now.toISOString()
            }
        };

        const presUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_PRESENCES)}`;
        const presRes = await fetch(presUrl, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${AIRTABLE_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(presenceData)
        });

        if (!presRes.ok) {
            const errText = await presRes.text();
            throw new Error(`Erreur Airtable (Create): ${presRes.status} ${errText}`);
        }

        res.json({
            ok: true,
            nom: employee.fields.nom || "Employé",
            time: presenceData.fields.heure
        });

    } catch (error) {
        console.error("Erreur serveur:", error);
        // MODE DEBUG : On renvoie l'erreur technique pour comprendre (A supprimer en prod plus tard)
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
