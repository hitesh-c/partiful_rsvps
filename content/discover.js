
(() => {
  const init = async () => {
    console.log('[Partiful RSVPs] Discovery script initialized on:', window.location.href);
    if (document.readyState === 'loading') {
      await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
    }
    injectTriggerButton();
  };

  function injectTriggerButton() {
    const buttonId = 'partiful-discover-trigger';
    if (document.getElementById(buttonId)) return;

    const button = document.createElement('button');
    button.id = buttonId;
    button.textContent = 'Scan Events for Partiful';
    button.style.position = 'fixed';
    button.style.bottom = '20px';
    button.style.right = '20px';
    button.style.zIndex = '9999';
    button.style.backgroundColor = '#6a0dad';
    button.style.color = 'white';
    button.style.padding = '10px 20px';
    button.style.border = 'none';
    button.style.borderRadius = '5px';
    button.style.cursor = 'pointer';
    
    button.addEventListener('click', discoverAndQueueEvents);
    
    document.body.appendChild(button);
  }

  async function discoverAndQueueEvents() {
    console.log('[Partiful RSVPs] Discovering events...');
    const eventUrls = new Set();

    // Give the page time to load everything, especially on heavy sites
    await new Promise(resolve => setTimeout(resolve, 2000));
    await scrollToBottom();

    // Strategy 1: Find all links pointing directly to Partiful events
    const links = document.querySelectorAll('a[href*="partiful.com/e/"]');
    links.forEach(link => {
      if (link.href) {
        eventUrls.add(link.href.split('?')[0]); // Add URL, remove query params
      }
    });
    console.log(`[Partiful RSVPs] Found ${eventUrls.size} events from direct links.`);

    // Strategy 2: Scan the entire page text for URLs
    const urlRegex = /https:\/\/partiful\.com\/e\/[a-zA-Z0-9-]+/g;
    const pageText = document.body.innerText;
    const textMatches = pageText.match(urlRegex);

    if (textMatches) {
      textMatches.forEach(url => eventUrls.add(url));
    }
    console.log(`[Partiful RSVPs] Found ${eventUrls.size} total events after scanning text.`);

    const urls = Array.from(eventUrls);
    if (urls.length > 0) {
      chrome.runtime.sendMessage({ type: 'settings:get' }, (response) => {
        const settings = response.settings;
        const existingUrls = new Set(settings.automation.eventList || []);
        let newCount = 0;
        urls.forEach(url => {
          if (!existingUrls.has(url)) {
            existingUrls.add(url);
            newCount++;
          }
        });
        
        settings.automation.eventList = Array.from(existingUrls);
        
        chrome.storage.local.set({ settings }, () => {
          console.log(`[Partiful RSVPs] Added ${newCount} new events to the queue.`);
          alert(`Found ${urls.length} total events. Added ${newCount} new events to your queue.`);
        });
      });
    } else {
      alert('No Partiful events found on this page. The script might need adjustments for this specific site.');
    }
  }

  async function scrollToBottom() {
    console.log('[Partiful RSVPs] Scrolling to bottom to load all content...');
    return new Promise(resolve => {
      let totalHeight = 0;
      let distance = 200;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          // One final scroll to the very end
          window.scrollTo(0, document.body.scrollHeight);
          setTimeout(resolve, 1000); // Wait a moment for any lazy-loaded content
        }
      }, 250);
    });
  }

  init();
})();
