chrome.runtime.onInstalled.addListener(async function(info) {
  if (info.reason == 'install') {
    await reset();
    await pollSources();
  }
});
