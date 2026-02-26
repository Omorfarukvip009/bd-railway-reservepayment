document.addEventListener('DOMContentLoaded', function() {
    const bKashOption = document.getElementById('bKashOption');
    const nagadOption = document.getElementById('nagadOption');

    bKashOption.addEventListener('click', function() {
        changeTheme('bkash');
    });

    nagadOption.addEventListener('click', function() {
        changeTheme('nagad');
    });

    // Function to change the theme
    function changeTheme(paymentMethod) {
        const themeStylesheet = document.getElementById('themeStylesheet');

        if (paymentMethod === 'bkash') {
            themeStylesheet.setAttribute('href', 'bkash.css');
        } else if (paymentMethod === 'nagad') {
            themeStylesheet.setAttribute('href', 'nagad.css');
        }
    }
});
