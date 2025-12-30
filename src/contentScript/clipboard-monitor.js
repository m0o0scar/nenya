(function () {
  document.addEventListener('copy', () => {
    const selectedText = window.getSelection().toString().trim();
    if (selectedText) {
      chrome.runtime.sendMessage({
        action: 'addClipboardItem',
        data: {
          text: selectedText,
          url: window.location.href,
          timestamp: new Date().toISOString(),
        },
      });
    }
  });
})();
