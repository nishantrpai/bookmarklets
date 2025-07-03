/**
 * This script finds cells containing "search_query" in Sheet 1 and adds those values to Sheet 2
 */

/**
 * Creates a custom menu in Google Sheets when the spreadsheet opens
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('Custom Tools')
      .addItem('Transfer Search Queries', 'transferSearchQueries')
      .addToUi();
}

/**
 * Main function that transfers rows containing "search_query" from Sheet1 to Sheet2
 */
function transferSearchQueries() {
  // Access the active spreadsheet
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  
  // Access Sheet 1 and Sheet 2
  var sourceSheet = spreadsheet.getSheetByName("Sheet1");
  var targetSheet = spreadsheet.getSheetByName("Sheet2");
  
  if (!sourceSheet || !targetSheet) {
    Logger.log("Error: Couldn't find one or both sheets");
    return;
  }
  
  // Get all data from Sheet 1
  var sourceData = sourceSheet.getDataRange().getValues();
  
  // Create an array to store matching rows
  var matchingRows = [];
  
  // Loop through all rows in Sheet 1 to find cells containing "search_query"
  for (var row = 0; row < sourceData.length; row++) {
    // Flag to check if we found "search_query" in this row
    var foundInRow = false;
    
    // Check each cell in the current row
    for (var col = 0; col < sourceData[row].length; col++) {
      var cellValue = sourceData[row][col];
      
      // Check if the cell contains "search_query"
      if (cellValue && cellValue.toString().indexOf("search_query") !== -1) {
        foundInRow = true;
        break; // No need to check other cells in this row
      }
    }
    
    // If we found "search_query" in this row, add the entire row to our results
    if (foundInRow) {
      matchingRows.push(sourceData[row]); // Add the entire row
    }
  }
  
  // Add the matching rows to Sheet 2 if we found any
  if (matchingRows.length > 0) {
    // Get the next empty row in Sheet 2
    var nextRow = 2;
    
    // We only want to update columns A and B (first 2 columns)
    var numColumnsToUpdate = Math.min(2, matchingRows[0].length);
    
    // For each matching row, update only columns A and B
    for (var i = 0; i < matchingRows.length; i++) {
      var rowData = matchingRows[i].slice(0, numColumnsToUpdate);
      targetSheet.getRange(nextRow + i, 1, 1, numColumnsToUpdate).setValues([rowData]);
    }
    
    // Log success and show a notification to the user
    Logger.log("Successfully transferred " + matchingRows.length + " rows to Sheet 2");
    SpreadsheetApp.getUi().alert("Success! Transferred " + matchingRows.length + " rows containing 'search_query' to Sheet2.");
  } else {
    // Log and show message when no matching rows found
    Logger.log("No rows containing 'search_query' were found");
    SpreadsheetApp.getUi().alert("No cells containing 'search_query' were found in Sheet1.");
  }
}
