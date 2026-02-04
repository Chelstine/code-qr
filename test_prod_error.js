fetch('https://code-qr-production.up.railway.app/api/pointage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '0000', type: 'arrivee' })
})
    .then(async res => {
        console.log("Status:", res.status);
        console.log("Body:", await res.text());
    })
    .catch(console.error);
