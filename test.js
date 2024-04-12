const axios = require('axios');

// Function to trigger report generation
async function triggerReport() {
    console.log("trigger report")
  try {
    const response = await axios.get('http://localhost:3000/trigger_report');
    console.log('Report triggered. Report ID:', response.data.report_id);
    return response.data.report_id;
  } catch (error) {
    console.error('Error triggering report:', error.response.data);
    return null;
  }
}

// Function to check report status or download report
async function getReportStatusOrDownload(reportId) {
    console.log("getReportStatusOrDownload")
  try {
    const response = await axios.get(`http://localhost:3000/get_report/${reportId}`);
    if (response.data === 'Running') {
      console.log('Report is still running...');
    } else {
      console.log('Report download successful.');
      console.log('CSV Data:', response.data);
    }
  } catch (error) {
    console.error('Error getting report status or downloading report:', error.response.data);
  }
}

// Test the APIs
async function testAPIs() {
  // Trigger report generation
  const reportId = await triggerReport();

//Wait for a few seconds (simulate waiting for the report to be generated)
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Get report status or download report
  if (reportId) {
    await getReportStatusOrDownload(reportId);
  }
}

// Run the test
testAPIs();
