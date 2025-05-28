/**
 * This script finds cells containing "search_query" in Sheet 1 and adds those values to Sheet 2
 */
function transferSearchQueries() {
  // Access the active spreadsheet
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  
  // Access Sheet 1 and Sheet 2
  var sourceSheet = spreadsheet.getSheetByName("Sheet 1");
  var targetSheet = spreadsheet.getSheetByName("Sheet 2");
  
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
    var nextRow = targetSheet.getLastRow() + 1;
    
    // Get the number of columns in the matching rows
    var numColumns = matchingRows[0].length;
    
    // Write all matching rows to Sheet 2
    targetSheet.getRange(nextRow, 1, matchingRows.length, numColumns).setValues(matchingRows);
    
    Logger.log("Successfully transferred " + matchingRows.length + " rows to Sheet 2");
  } else {
    Logger.log("No rows containing 'search_query' were found");
  }
}
