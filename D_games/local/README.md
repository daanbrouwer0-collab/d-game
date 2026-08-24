# Lokale ontwikkeling

Alles in deze map is **alleen voor lokaal testen**. De live site (Netlify) heeft dit niet nodig.

## Waarom een lokale server?

Browsers blokkeren Matrix-API-calls vanaf `file://` (dubbelklik op een HTML-bestand).  
Online host Netlify je bestanden al via HTTPS — daar is geen extra server nodig. Matrix.org blijft de chat/game-backend.

## Starten

```bash
./local/serve.sh
```

Open daarna: <http://localhost:8080/multi.html>

Optioneel ander poortnummer: `./local/serve.sh 3000`
