document.addEventListener("DOMContentLoaded", () => {
  if ("IntersectionObserver" in window) {
    const videoObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (video) {
        if (video.isIntersecting) {
          const { children } = video.target;
          for (var source in children) {
            var videoSource = children[source];
            if (
              typeof videoSource.tagName === "string"
              && videoSource.tagName === "SOURCE"
            ) {
              videoSource.src = videoSource.dataset.src;
            }
          }

          video.target.load();
          videoObserver.unobserve(video.target);
        }
      });
    });

    for (const video of document.querySelectorAll("video")) {
      videoObserver.observe(video);
    }
  }
});
