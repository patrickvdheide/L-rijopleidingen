<script>
// Zorg dat het script alleen geladen wordt als de pagina volledig geladen is.
document.addEventListener("DOMContentLoaded", function() {
    
    // Verzamel alle items uit de Webflow Collection List (CI = Collection Item)
    const collectionItems = document.querySelectorAll('.ci_apps');

    // Haal het Developer ID op uit het HTML-element met id "devId" via de `getDevId()` functie
    const developerId = getDevId(); // Haal de developerId op en sla op in de variabele `developerId`.

    // Variabele om het aantal zichtbare apps bij te houden (optie om aantal te tonen)
    let countVisibleApps = 0;

    // Selecteer het tekstveld voor de ontwikkelaar (als deze bestaat)
    const appsOntwikkelaarTekstveld = document.getElementById('appsOntwikkelaarTekstveld');

    // Controleer of er een developerId aanwezig is op de pagina
    if (developerId) {
        // Itereer door de collectie items en vergelijk `data-developer-id` met `developerId`
        collectionItems.forEach(item => {
            const itemDeveloperId = item.getAttribute('data-developer-id');
            //log de waarde naar de console
            console.log("Item Developer ID:", itemDeveloperId);

            // Als de `data-developer-id` overeenkomt met de huidige `developerId`, toon het item
            if (itemDeveloperId === developerId) {
                toggleVisibility(item, true); // Toon het item
                countVisibleApps++; // Tel het aantal zichtbare apps
            } else {
                toggleVisibility(item, false); // Verberg het item
            }
        });

        // Toon de titel alleen als er meer dan één app is
        if (countVisibleApps > 0) {
            if (appsOntwikkelaarTekstveld) {
                appsOntwikkelaarTekstveld.textContent = " More of the same developer.";
                appsOntwikkelaarTekstveld.style.display = 'block'; // Zorg ervoor dat de titel zichtbaar is
            }
        } else if (appsOntwikkelaarTekstveld) {
            appsOntwikkelaarTekstveld.style.display = 'none'; // Verberg de titel als er 1 of minder apps zijn
        }
    } else {
        console.error('Geen developerId gevonden op deze pagina.');
    }

    // Functie om het `developerId` op te halen uit een HTML-element
    function getDevId() {
        const devIdElement = document.getElementById('devId');
        return devIdElement ? devIdElement.textContent.trim() : null;
    }

    // Functie om de zichtbaarheid van een item aan te passen
    function toggleVisibility(item, isVisible) {
        item.style.display = isVisible ? 'block' : 'none';
        item.style.visibility = isVisible ? 'visible' : 'hidden';
    }

    // Debug-informatie naar de console loggen
    console.log("developerId:", developerId);
    console.log("Aantal zichtbare apps:", countVisibleApps);

}); // Sluit de `DOMContentLoaded` eventlistener correct af.
</script>



fs-cmsload-element 
list
fs-cmsload-mode 
render-all
