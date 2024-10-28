const bar = document.getElementById('bar')
cons nav = document.getElementById('navbar')

if (bar) {
    bar.addEventListener('click', () => {
        nav.classList.add('active');
    })
}