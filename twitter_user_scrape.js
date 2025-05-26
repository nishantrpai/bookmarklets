javascript:(function() {
  // Configuration
  const CSV_HEADERS = ['username', 'display_name', 'profile_url', 'bio'];
  let selectedUsers = [];
  
  // Create UI elements
  const controlPanel = document.createElement('div');
  controlPanel.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 15px;
    border-radius: 8px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 10px;
    box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
  `;
  
  const titleBar = document.createElement('div');
  titleBar.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: bold;
  `;
  titleBar.innerHTML = '<span>Twitter User Selector</span>';
  
  const closeButton = document.createElement('button');
  closeButton.textContent = '×';
  closeButton.style.cssText = `
    background: none;
    border: none;
    color: white;
    font-size: 20px;
    cursor: pointer;
    padding: 0 5px;
  `;
  closeButton.onclick = () => {
    document.body.removeChild(controlPanel);
    removeCheckboxes();
  };
  titleBar.appendChild(closeButton);
  
  const status = document.createElement('div');
  status.textContent = 'Selected: 0 users';
  
  const downloadButton = document.createElement('button');
  downloadButton.textContent = 'Download Selected Users';
  downloadButton.style.cssText = `
    background: #1da1f2;
    color: white;
    border: none;
    padding: 8px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
  `;
  downloadButton.onclick = downloadCSV;
  
  const selectAllButton = document.createElement('button');
  selectAllButton.textContent = 'Select All Visible';
  selectAllButton.style.cssText = `
    background: #333;
    color: white;
    border: none;
    padding: 8px 12px;
    border-radius: 4px;
    cursor: pointer;
  `;
  selectAllButton.onclick = selectAllVisible;
  
  controlPanel.appendChild(titleBar);
  controlPanel.appendChild(status);
  controlPanel.appendChild(selectAllButton);
  controlPanel.appendChild(downloadButton);
  
  document.body.appendChild(controlPanel);
  
  // Add global styles to fix spacing
  const globalStyle = document.createElement('style');
  globalStyle.id = 'twitter-scraper-global-style';
  globalStyle.textContent = `
    /* Make room for checkboxes */
    [data-testid="primaryColumn"] [data-testid="cellInnerDiv"] {
      padding-left: 24px !important;
    }
    
    /* Position the checkboxes properly */
    .user-scraper-checkbox {
      position: absolute !important;
      left: 4px !important;
      top: 25px !important;
      z-index: 10000 !important;
    }
  `;
  document.head.appendChild(globalStyle);

  // Add checkboxes next to each user
  addCheckboxesToUsers();
  
  // Observe the timeline for new users (as you scroll)
  // Use a more targeted approach by looking for specific containers that hold user cells
  const observer = new MutationObserver((mutations) => {
    let shouldProcessUsers = false;
    
    for (const mutation of mutations) {
      if (mutation.addedNodes.length) {
        // Check if any of the added nodes might contain user cells
        for (let i = 0; i < mutation.addedNodes.length; i++) {
          const node = mutation.addedNodes[i];
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.querySelector && (
                node.querySelector('[data-testid="cellInnerDiv"]') || 
                node.querySelector('[data-testid="UserCell"]') ||
                node.getAttribute('data-testid') === 'cellInnerDiv'
            )) {
              shouldProcessUsers = true;
              break;
            }
          }
        }
      }
      
      // Also check if attributes were modified on containers that might hold users
      if (!shouldProcessUsers && mutation.type === 'attributes') {
        if (mutation.target.nodeType === Node.ELEMENT_NODE) {
          const target = mutation.target;
          if (target.getAttribute('data-testid') === 'cellInnerDiv' || 
              target.getAttribute('data-testid') === 'UserCell') {
            shouldProcessUsers = true;
          }
        }
      }
      
      if (shouldProcessUsers) break;
    }
    
    if (shouldProcessUsers) {
      console.log('Detected new user cells, processing...');
      addCheckboxesToUsers();
    }
  });
  
  // Observe the entire document for changes to catch dynamically loaded content
  observer.observe(document.body, { 
    childList: true, 
    subtree: true,
    attributes: true,
    attributeFilter: ['data-testid']
  });
  
  // Core Functions
  function addCheckboxesToUsers() {
    console.log('Adding checkboxes to users...');
    // Find all user cells that don't have checkboxes yet
    // Looking for cells with UserCell data-testid which contain user profile information
    let userItems = document.querySelectorAll('[data-testid="cellInnerDiv"]:not([data-scraper-processed]), [data-testid="UserCell"]:not([data-scraper-processed])');
    
    userItems.forEach(userItem => {
      // Mark as processed to avoid adding multiple checkboxes
      userItem.setAttribute('data-scraper-processed', 'true');
      
      // Apply compact styling directly to this item
      if (userItem instanceof HTMLElement) {
        userItem.style.marginTop = '0px';
        userItem.style.marginBottom = '0px';
        userItem.style.paddingTop = '4px';
        userItem.style.paddingBottom = '4px';
      }
      
      try {
        // Check if it's actually a user cell by checking for the UserCell button or UserName
        const userCell = userItem.querySelector('[data-testid="UserCell"], [data-testid="User-Name"]');
        if (!userCell) return;
        
        // Create checkbox
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'user-scraper-checkbox';
        checkbox.style.cssText = `
          position: absolute;
          left: 5px;
          top: 25px;
          width: 16px;
          height: 16px;
          cursor: pointer;
          z-index: 9999;
          margin: 0;
        `;
        
        // Extract user data when checked
        checkbox.onchange = function(e) {
          try {
            const checkboxElem = e.target;
            if (!(checkboxElem instanceof HTMLInputElement)) return;
            
            const userContainer = checkboxElem.closest('[data-testid="cellInnerDiv"]');
            if (!userContainer) return;
            
            // Get username element (the @username)
            // First check the new structure with dir="ltr" and @username format
            let usernameElement = userContainer.querySelector('div[dir="ltr"] span:not(:first-child)');
            if (!usernameElement) {
              // Try alternative selector if first one fails
              usernameElement = userContainer.querySelector('[data-testid="User-Name"] a[href^="/"] div[dir="ltr"]:last-child');
            }
            if (!usernameElement || !usernameElement.textContent) return;
            
            // Get display name - first span inside User-Name or first element with stronger styling
            const displayNameElement = userContainer.querySelector('[data-testid="User-Name"] div[dir="ltr"]:first-child, [data-testid="User-Name"] span:first-child');
            
            // Get bio - looking for text content below the username that's not part of User-Name
            const bioElement = userContainer.querySelector('[data-testid="UserCell-byline"], div[dir="auto"]:not([data-testid])');
            
            // Extract the data
            const usernameText = usernameElement.textContent.trim();
            // Handle @username format or just username
            const username = usernameText.startsWith('@') ? usernameText : '@' + usernameText;
            const displayName = displayNameElement && displayNameElement.textContent ? displayNameElement.textContent.trim() : '';
            const profileUrl = 'https://twitter.com/' + username.replace('@', '');
            const bio = bioElement && bioElement.textContent ? bioElement.textContent.trim() : '';
            
            const userData = { username, displayName, profileUrl, bio };
            
            // Add or remove from selected users
            if (checkboxElem.checked) {
              selectedUsers.push(userData);
            } else {
              selectedUsers = selectedUsers.filter(u => u.username !== username);
            }
            
            // Update status
            status.textContent = `Selected: ${selectedUsers.length} users`;
          } catch (e) {
            console.error('Error processing checkbox change:', e);
          }
        };
        
        // Position the checkbox absolutely relative to the user item
        // This ensures it appears on top of the content and is visible
        if (userItem instanceof HTMLElement) {
          userItem.style.position = 'relative';
          // Add left padding to make room for checkbox
          userItem.style.paddingLeft = '24px';
          // Make the container tighter
          userItem.style.minHeight = 'auto';
          // Compact the item
          userItem.style.border = 'none';
          userItem.style.margin = '0';
          userItem.style.padding = '5px 5px 5px 24px';
        }
        
        // Append the checkbox to the user item
        userItem.appendChild(checkbox);
        
        // Log success for debugging
        console.log('Checkbox added to user item:', userItem);
      } catch (e) {
        console.error('Error adding checkbox to user:', e);
      }
    });
  }
  
  function removeCheckboxes() {
    document.querySelectorAll('.user-scraper-checkbox').forEach(cb => {
      cb.remove();
    });
    // Remove any data attributes we added
    document.querySelectorAll('[data-scraper-processed]').forEach(el => {
      el.removeAttribute('data-scraper-processed');
    });
    // Disconnect the observer
    observer.disconnect();
  }
  
  function selectAllVisible() {
    // Find all checkboxes that aren't checked and trigger the change event
    const checkboxes = document.querySelectorAll('.user-scraper-checkbox:not(:checked)');
    console.log(`Selecting all ${checkboxes.length} visible user profiles...`);
    
    checkboxes.forEach(cb => {
      // Set to checked and dispatch the change event
      if (cb instanceof HTMLInputElement) {
        cb.checked = true;
        cb.dispatchEvent(new Event('change'));
      }
    });
    
    // Update the status display
    status.textContent = `Selected: ${selectedUsers.length} users`;
  }
  
  function downloadCSV() {
    if (selectedUsers.length === 0) {
      alert('No users selected!');
      return;
    }
    
    // Create CSV content
    let csvContent = CSV_HEADERS.join(',') + '\n';
    
    selectedUsers.forEach(user => {
      const row = [
        user.username.replace(/"/g, '""'),
        user.displayName.replace(/"/g, '""'),
        user.profileUrl,
        user.bio.replace(/"/g, '""').replace(/\n/g, ' ')
      ];
      
      csvContent += row.map(field => `"${field}"`).join(',') + '\n';
    });
    
    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `twitter_users_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
})();