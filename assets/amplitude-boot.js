/* Public Amplitude API key (not the Secret key). Boots the vendored Browser SDK. */
(function () {
  if (typeof window === "undefined") return;
  if (window.__infinitumAmplitudeStarted) return;
  var init = window.__infinitumAmplitudeInit;
  if (typeof init !== "function") return;
  var apiKey = '756c0bc80c5cb27386bfd7b2b13196c8';
  if (typeof apiKey !== "string" || apiKey.length < 16) return;
  window.__infinitumAmplitudeStarted = true;
  init(apiKey, {
    autocapture: {
      attribution: true,
      fileDownloads: false,
      formInteractions: false,
      pageViews: true,
      sessions: true,
      elementInteractions: false,
      frustrationInteractions: false,
      networkTracking: false,
      webVitals: false,
      performanceTracking: false,
      pageUrlEnrichment: true
    },
    trackingOptions: { ipAddress: false },
    serverZone: "US",
    fetchRemoteConfig: false,
    remoteConfig: { fetchRemoteConfig: false },
    enableDiagnostics: false
  });
})();
