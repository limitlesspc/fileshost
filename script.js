document.addEventListener("DOMContentLoaded", () => {
  if ("IntersectionObserver" in window) {
    const imageObserver = new IntersectionObserver(entries => {
      for (const image of entries) {
        if (image.isIntersecting) {
          const { target } = image;
          const { src } = target.dataset;
          target.src = src;
          target.addEventListener("click", () =>
            window.open(src.replace(".thumb", "")),
          );

          delete target.dataset.src;
          target.removeAttribute("width");
          target.removeAttribute("height");
          imageObserver.unobserve(target);
        }
      }
    });

    for (const image of document.querySelectorAll("img")) {
      imageObserver.observe(image);
    }

    const videoObserver = new IntersectionObserver(entries => {
      for (const video of entries) {
        if (video.isIntersecting) {
          const { target } = video;
          const { children } = target;
          for (var source in children) {
            var videoSource = children[source];
            if (
              typeof videoSource.tagName === "string"
              && videoSource.tagName === "SOURCE"
            ) {
              const { src } = videoSource.dataset;
              videoSource.src = src;
              target.addEventListener("click", () =>
                window.open(src.replace(".thumb", "")),
              );
              delete videoSource.dataset.src;
            }
          }
          target.load();
          videoObserver.unobserve(target);
        }
      }
    });

    for (const video of document.querySelectorAll("video")) {
      videoObserver.observe(video);
    }
  }
});

function openInNewTab(href) {
  window.open(href, "_blank");
}
