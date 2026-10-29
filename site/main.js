// Top bar and scroll reveal. The page background is plain: no canvas, no shader.

const reducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;

// Top bar: appears once the hero download button has scrolled out of view.
function watchDownloadButton() {
  const button = document.querySelector("#download");
  const topbar = document.querySelector("#topbar");
  if (!button || !topbar) return;
  const observer = new IntersectionObserver(([entry]) => {
    const scrolledPast =
      !entry.isIntersecting && entry.boundingClientRect.top < 0;
    topbar.classList.toggle("is-visible", scrolledPast);
    topbar.toggleAttribute("inert", !scrolledPast);
  });
  observer.observe(button);
}

// Sections ease in once as they scroll into view. The `js` class (set in the head) hides them first, so
// without JavaScript, or with reduced motion, they are simply visible.
function revealOnScroll() {
  const items = document.querySelectorAll(".reveal");
  if (reducedMotion || !("IntersectionObserver" in window)) {
    items.forEach((item) => item.classList.add("is-in"));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-in");
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -10% 0px" },
  );
  items.forEach((item) => observer.observe(item));
}

watchDownloadButton();
revealOnScroll();
