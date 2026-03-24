const progressBar = document.getElementById("progressBar");
const backToTop = document.getElementById("backToTop");

function updateProgress() {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
    progressBar.style.width = `${progress}%`;
}

window.addEventListener("scroll", updateProgress);
window.addEventListener("load", updateProgress);
window.addEventListener("resize", updateProgress);

backToTop.addEventListener("click", () => {
    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
});