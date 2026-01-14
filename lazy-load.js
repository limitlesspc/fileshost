document.addEventListener("DOMContentLoaded", () => {
  if ("IntersectionObserver" in window) {
    const imageObserver = new IntersectionObserver(entries => {
      for (const image of entries) {
        if (image.isIntersecting) {
          const { target } = image;
          target.src = target.dataset.src;
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
              videoSource.src = videoSource.dataset.src;
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
