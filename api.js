const express = require('express');
const { Pool } = require('pg');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { SingleBar } = require('cli-progress');

const app = express();
const port = 3000;

// PostgreSQL database connection configuration
const pool = new Pool({
    user: "postgres",
    host: "localhost",
    database: "database",
    password: "12345678",
    port: 5432,
});

// API endpoint to trigger report generation
app.get('/trigger_report', async (req, res) => {
  console.log("Get called...")
  try {
    const reportId = uuidv4(); // Generate a random report ID
    console.log(reportId)
    // Call function to generate report
    res.send({ report_id: reportId });
    generateReport(reportId);
  } catch (error) {
    console.error('Error triggering report:', error);
    res.status(500).send('Internal server error');
  }
});

// API endpoint to get the status or the CSV report
app.get('/get_report/:report_id', async (req, res) => {
  console.log("Second time ...")
  try {
    const reportId = req.params.report_id;
    const reportPath = `reports/${reportId}.csv`;
    if (fs.existsSync(reportPath)) {
      // If CSV file exists, report generation is complete
      res.download(reportPath, `${reportId}.csv`, () => {
        // Remove the file after download
        fs.unlinkSync(reportPath);
      });
    } else {
      // If CSV file doesn't exist, report generation is still running
      res.send('Running');
    }
  } catch (error) {
    console.error('Error getting report:', error);
    res.status(500).send('Internal server error');
  }
});

async function generateReport(reportId) {
  // Fetch data from the database
  const client = await pool.connect();
  try {
    // Get store information including status and timezone
    const storeInfoQuery = `
      SELECT s.store_id, s.status, t.timezone_str
      FROM store_status s
      JOIN store_timezone t ON s.store_id = t.store_id
    `;
    const storeInfoResult = await client.query(storeInfoQuery);
    const storeInfoRows = storeInfoResult.rows;

    // Get store hours information
    const storeHoursQuery = `
      SELECT store_id, day, start_time_local, end_time_local
      FROM store_hours
    `;
    const storeHoursResult = await client.query(storeHoursQuery);
    const storeHoursRows = storeHoursResult.rows;

    // Initialize progress bar
    const progressBar = new SingleBar({
      format: 'Generating Report [{bar}] {percentage}% | ETA: {eta}s | {value}/{total} Stores',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    });
    progressBar.start(storeInfoRows.length, 0);

    // Process data and generate report
    const reportData = [];
    for (let i = 0; i < storeInfoRows.length; i++) {
      const storeInfo = storeInfoRows[i];
      const { store_id, status, timezone_str } = storeInfo;
      const storeHours = storeHoursRows.filter(row => row.store_id === store_id);
      const uptimeLastHour = calculateUptimeLastHour(store_id, storeHours, timezone_str);
      const uptimeLastDay = calculateUptimeLastDay(store_id, storeHours, timezone_str);
      const updateLastWeek = await calculateUpdateLastWeek(store_id);
      const downtimeLastHour = await calculateDowntimeLastHour(store_id, storeHours, timezone_str);
      const downtimeLastDay = await calculateDowntimeLastDay(store_id, storeHours, timezone_str);
      const downtimeLastWeek = await calculateDowntimeLastWeek(store_id);
      reportData.push({
        store_id,
        uptime_last_hour: uptimeLastHour,
        uptime_last_day: uptimeLastDay,
        update_last_week: updateLastWeek,
        downtime_last_hour: downtimeLastHour,
        downtime_last_day: downtimeLastDay,
        downtime_last_week: downtimeLastWeek
      });

      // Update progress bar
      progressBar.update(i + 1);
    }

    // Generate CSV data
    const csvData = generateCSV(reportData);

    // Save CSV file
    fs.writeFileSync(`reports/${reportId}.csv`, csvData);
  } catch (error) {
    console.error('Error generating report:', error);
  } finally {
    client.release();
  }
}

// //chunks function -------------------------------------------------------------------------------------------------------
// async function generateReport(reportId) {
//   const client = await pool.connect();
//   try {
//     const chunkSize = 10; // Define the size of each chunk
//     const storeInfoQuery = `SELECT s.store_id, s.status, t.timezone_str FROM store_status s JOIN store_timezone t ON s.store_id = t.store_id`;
//     const storeInfoResult = await client.query(storeInfoQuery);
//     const storeInfoRows = storeInfoResult.rows;

//     const totalStores = storeInfoRows.length;
//     const totalChunks = Math.ceil(totalStores / chunkSize);

//     // Initialize progress bar
//     const progressBar = new SingleBar({
//       format: 'Generating Report [{bar}] {percentage}% | ETA: {eta}s | {value}/{total} Stores',
//       barCompleteChar: '\u2588',
//       barIncompleteChar: '\u2591',
//       hideCursor: true
//     });
//     progressBar.start(totalStores, 0);

//     // Process data in chunks
//     for (let i = 0; i < totalChunks; i++) {
//       const start = i * chunkSize;
//       const end = Math.min((i + 1) * chunkSize, totalStores);
//       const chunkInfo = storeInfoRows.slice(start, end);

//       const reportData = await processChunk(chunkInfo, client);

//       // Append report data to CSV file
//       appendToCSV(reportData, reportId);

//       // Update progress bar
//       progressBar.update(end);
//     }

//     // Stop progress bar
//     progressBar.stop();
//   } catch (error) {
//     console.error('Error generating report:', error);
//   } finally {
//     client.release();
//   }
// }

// async function processChunk(chunkInfo, client) {
//   const storeIds = chunkInfo.map(info => info.store_id);
  
//   // Fetch store hours data for all store IDs in a single query
//   const storeHoursQuery = `
//     SELECT store_id, day, start_time_local, end_time_local 
//     FROM store_hours 
//     WHERE store_id = ANY($1)
//   `;
//   const storeHoursResult = await client.query(storeHoursQuery, [storeIds]);

//   const storeHoursMap = {};
//   storeHoursResult.rows.forEach(row => {
//     const storeId = row.store_id;
//     if (!storeHoursMap[storeId]) {
//       storeHoursMap[storeId] = [];
//     }
//     storeHoursMap[storeId].push(row);
//   });

//   const reportData = [];

//   for (const storeInfo of chunkInfo) {
//     const { store_id, status, timezone_str } = storeInfo;
//     const storeHoursRows = storeHoursMap[store_id] || [];

//     const uptimeLastHour = calculateUptimeLastHour(store_id, storeHoursRows, timezone_str);
//     const uptimeLastDay = calculateUptimeLastDay(store_id, storeHoursRows, timezone_str);
//     const updateLastWeek = await calculateUpdateLastWeek(store_id);
//     const downtimeLastHour = await calculateDowntimeLastHour(store_id, storeHoursRows, timezone_str);
//     const downtimeLastDay = await calculateDowntimeLastDay(store_id, storeHoursRows, timezone_str);
//     const downtimeLastWeek = await calculateDowntimeLastWeek(store_id);

//     reportData.push({
//       store_id,
//       uptime_last_hour: uptimeLastHour,
//       uptime_last_day: uptimeLastDay,
//       update_last_week: updateLastWeek,
//       downtime_last_hour: downtimeLastHour,
//       downtime_last_day: downtimeLastDay,
//       downtime_last_week: downtimeLastWeek
//     });
//   }

//   return reportData;
// }

// function appendToCSV(reportData, reportId) {
//   const csvData = generateCSV(reportData);
//   const filePath = `reports/${reportId}.csv`;
//   if (!fs.existsSync(filePath)) {
//     fs.writeFileSync(filePath, csvData);
//   } else {
//     fs.appendFileSync(filePath, csvData);
//   }
// }

// //database store function --------------------------------------------------------------------------------------------------
// async function generateReport(reportId) {
//   const client = await pool.connect();
//   console.log("1")
//   try {
//     // Create a temporary table
//     await client.query(`
//       CREATE TEMP TABLE report_data_temp (
//         store_id BIGINT,
//         uptime_last_hour INTEGER,
//         uptime_last_day INTEGER,
//         update_last_week NUMERIC,
//         downtime_last_hour INTEGER,
//         downtime_last_day NUMERIC,
//         downtime_last_week NUMERIC
//       );
//     `);
//     console.log("2")
//     // Fetch data from the database and insert into the temporary table
//     const storeInfoQuery = `
//       SELECT s.store_id, s.status, t.timezone_str
//       FROM store_status s
//       JOIN store_timezone t ON s.store_id = t.store_id
//     `;
//     const storeInfoResult = await client.query(storeInfoQuery);
//     const storeInfoRows = storeInfoResult.rows;

//     for (const storeInfo of storeInfoRows) {
//       const { store_id, status, timezone_str } = storeInfo;
//       const storeHoursQuery = `
//         SELECT store_id, day, start_time_local, end_time_local
//         FROM store_hours
//         WHERE store_id = $1
//       `;
//       const storeHoursResult = await client.query(storeHoursQuery, [store_id]);
//       const storeHoursRows = storeHoursResult.rows;

//       const uptimeLastHour = calculateUptimeLastHour(store_id, storeHoursRows, timezone_str);
//       const uptimeLastDay = calculateUptimeLastDay(store_id, storeHoursRows, timezone_str);
//       const updateLastWeek = await calculateUpdateLastWeek(store_id);
//       const downtimeLastHour = await calculateDowntimeLastHour(store_id, storeHoursRows, timezone_str);
//       const downtimeLastDay = await calculateDowntimeLastDay(store_id, storeHoursRows, timezone_str);
//       const downtimeLastWeek = await calculateDowntimeLastWeek(store_id);

//       await client.query(`
//         INSERT INTO report_data_temp (store_id, uptime_last_hour, uptime_last_day, update_last_week, downtime_last_hour, downtime_last_day, downtime_last_week)
//         VALUES ($1, $2, $3, $4, $5, $6, $7)
//       `, [store_id, uptimeLastHour, uptimeLastDay, updateLastWeek, downtimeLastHour, downtimeLastDay, downtimeLastWeek]);
//     }
//     console.log("3")
//     // Query the temporary table to fetch the data for generating the CSV
//     const reportDataQuery = `
//       SELECT * FROM report_data_temp
//     `;
//     const reportDataResult = await client.query(reportDataQuery);
//     const reportData = reportDataResult.rows;

//     // Generate CSV data
//     console.log("CSV generated..")
//     const csvData = generateCSV(reportData);

//     // Save CSV file
//     fs.writeFileSync(`reports/${reportId}.csv`, csvData);
//   } catch (error) {
//     console.error('Error generating report:', error);
//   } finally {
//     // Drop the temporary table
//     await client.query(`DROP TABLE IF EXISTS report_data_temp`);
//     client.release();
//   }
// }


// Function to calculate uptime for last hour
function calculateUptimeLastHour(storeId, storeHours, timezone) {
  const currentTime = new Date(); // Current time
  const currentDay = currentTime.getDay(); // Current day of the week (0 for Sunday, 1 for Monday, ..., 6 for Saturday)
  const currentHour = currentTime.getHours(); // Current hour of the day

  // Find today's store hours
  const todaysHours = storeHours.find(hour => hour.store_id === storeId && hour.day === currentDay);

  if (!todaysHours) return 0; // If store is closed today, uptime is 0

  const { start_time_local, end_time_local } = todaysHours;

  // Convert local start and end times to UTC timestamps
  const startTimeUTC = convertLocalTimeToUTC(start_time_local, timezone);
  const endTimeUTC = convertLocalTimeToUTC(end_time_local, timezone);

  // Calculate the time range within business hours
  const startHourUTC = startTimeUTC.getUTCHours();
  const endHourUTC = endTimeUTC.getUTCHours();

  // Calculate uptime within business hours for the last hour
  let uptimeLastHour = 0;
  if (currentHour >= startHourUTC && currentHour <= endHourUTC) {
    uptimeLastHour = Math.min(currentTime.getMinutes(), 60); // Uptime within the last hour
  }

  return uptimeLastHour;
}

// Function to convert local time to UTC
function convertLocalTimeToUTC(localTime, timezone) {
  const [hours, minutes] = localTime.split(':').map(Number);
  const time = new Date();
  time.setUTCHours(hours);
  time.setUTCMinutes(minutes);
  return time;
}


// Function to calculate uptime for last day
function calculateUptimeLastDay(storeId, storeHours, timezone) {
  const currentTime = new Date(); // Current time
  const currentDay = currentTime.getDay(); // Current day of the week (0 for Sunday, 1 for Monday, ..., 6 for Saturday)

  // Find today's store hours
  const todaysHours = storeHours.find(hour => hour.store_id === storeId && hour.day === currentDay);

  if (!todaysHours) return 0; // If store is closed today, uptime is 0

  const { start_time_local, end_time_local } = todaysHours;

  // Convert local start and end times to UTC timestamps
  const startTimeUTC = convertLocalTimeToUTC(start_time_local, timezone);
  const endTimeUTC = convertLocalTimeToUTC(end_time_local, timezone);

  // Calculate the time range within business hours
  const startHourUTC = startTimeUTC.getUTCHours();
  const endHourUTC = endTimeUTC.getUTCHours();

  // Calculate uptime within business hours for the last day
  let uptimeLastDay = 0;
  if (currentDay === 0) { // If it's Sunday, consider uptime for the last day as 0
    uptimeLastDay = 0;
  } else {
    // Assuming business hours are continuous without gaps
    if (currentTime.getHours() >= startHourUTC) {
      uptimeLastDay = Math.min((currentTime.getHours() - startHourUTC) * 60 + currentTime.getMinutes(), (endHourUTC - startHourUTC) * 60);
    }
  }

  return uptimeLastDay;
}


// Function to calculate update for last week
async function calculateUpdateLastWeek(storeId) {
  const client = await pool.connect();
  try {
    const currentTime = new Date(); // Current time
    const oneWeekAgo = new Date(currentTime.getTime() - 7 * 24 * 60 * 60 * 1000); // Timestamp of one week ago

    // Query to fetch status updates for the store within the last week
    const statusUpdatesQuery = `
      SELECT timestamp_utc
      FROM store_status
      WHERE store_id = $1 AND timestamp_utc >= $2
      ORDER BY timestamp_utc ASC
    `;
    const statusUpdatesResult = await client.query(statusUpdatesQuery, [storeId, oneWeekAgo]);
    const statusUpdates = statusUpdatesResult.rows;

    // Calculate the duration between consecutive updates
    let updateDuration = 0;
    for (let i = 0; i < statusUpdates.length - 1; i++) {
      const currentTimestamp = new Date(statusUpdates[i].timestamp_utc);
      const nextTimestamp = new Date(statusUpdates[i + 1].timestamp_utc);
      updateDuration += (nextTimestamp - currentTimestamp) / (1000 * 60 * 60); // Duration in hours
    }

    return updateDuration;
  } catch (error) {
    console.error('Error calculating update for last week:', error);
    return 0; // Return 0 if there's an error
  } finally {
    client.release();
  }
}


// Function to calculate downtime for last hour
async function calculateDowntimeLastHour(storeId, storeHours, timezone) {
  const currentTime = new Date(); // Current time
  const currentDay = currentTime.getDay(); // Current day of the week (0 for Sunday, 1 for Monday, ..., 6 for Saturday)
  const currentHour = currentTime.getHours(); // Current hour of the day

  // Find today's store hours
  const todaysHours = storeHours.find(hour => hour.store_id === storeId && hour.day === currentDay);

  if (!todaysHours) return 60; // If store is closed today, downtime is the full hour (60 minutes)

  const { start_time_local, end_time_local } = todaysHours;

  // Convert local start and end times to UTC timestamps
  const startTimeUTC = convertLocalTimeToUTC(start_time_local, timezone);
  const endTimeUTC = convertLocalTimeToUTC(end_time_local, timezone);

  // Calculate the time range within business hours
  const startHourUTC = startTimeUTC.getUTCHours();
  const endHourUTC = endTimeUTC.getUTCHours();

  // Check if the current time is within business hours
  if (currentHour >= startHourUTC && currentHour <= endHourUTC) {
    // Store is open during the current hour, so downtime is 0
    return 0;
  } else {
    // Store is closed during the current hour, so calculate downtime
    const downtime = (60 - currentTime.getMinutes()); // Remaining minutes in the hour
    return downtime;
  }
}

// Function to calculate downtime for last day
async function calculateDowntimeLastDay(storeId, storeHours, timezone) {
  const currentTime = new Date(); // Current time
  const currentDay = currentTime.getDay(); // Current day of the week (0 for Sunday, 1 for Monday, ..., 6 for Saturday)

  // Find today's store hours
  const todaysHours = storeHours.find(hour => hour.store_id === storeId && hour.day === currentDay);

  if (!todaysHours) return 0; // If store is closed today, downtime is 0

  const { start_time_local, end_time_local } = todaysHours;

  // Convert local start and end times to UTC timestamps
  const startTimeUTC = convertLocalTimeToUTC(start_time_local, timezone);
  const endTimeUTC = convertLocalTimeToUTC(end_time_local, timezone);

  // Calculate the time range within business hours
  const startHourUTC = startTimeUTC.getUTCHours();
  const endHourUTC = endTimeUTC.getUTCHours();

  // Calculate downtime within business hours for the last day
  let downtimeLastDay = 0;
  if (currentDay === 0) { // If it's Sunday, consider downtime for the last day as 0
    downtimeLastDay = 0;
  } else {
    // Assuming business hours are continuous without gaps
    if (currentTime.getHours() < startHourUTC) {
      downtimeLastDay = (endHourUTC - startHourUTC) * 60; // Full downtime if the store hasn't opened yet
    } else if (currentTime.getHours() >= endHourUTC) {
      downtimeLastDay = 0; // If the store has already closed, downtime is 0
    } else {
      downtimeLastDay = (endHourUTC - currentTime.getHours()) * 60 - currentTime.getMinutes(); // Downtime within open hours
    }
  }

  return downtimeLastDay;
}

async function calculateDowntimeLastWeek(storeId) {
  const client = await pool.connect();
  try {
    const currentTime = new Date(); // Current time
    const oneWeekAgo = new Date(currentTime.getTime() - 7 * 24 * 60 * 60 * 1000); // Timestamp of one week ago

    // Query to fetch status updates for the store within the last week
    const statusUpdatesQuery = `
      SELECT timestamp_utc
      FROM store_status
      WHERE store_id = $1 AND timestamp_utc >= $2
      ORDER BY timestamp_utc ASC
    `;
    const statusUpdatesResult = await client.query(statusUpdatesQuery, [storeId, oneWeekAgo]);
    const statusUpdates = statusUpdatesResult.rows;

    // Calculate downtime between consecutive status updates
    let downtimeLastWeek = 0;
    for (let i = 0; i < statusUpdates.length - 1; i++) {
      const currentTimestamp = new Date(statusUpdates[i].timestamp_utc);
      const nextTimestamp = new Date(statusUpdates[i + 1].timestamp_utc);
      downtimeLastWeek += (nextTimestamp - currentTimestamp) / (1000 * 60); // Duration in minutes
    }

    return downtimeLastWeek;
  } catch (error) {
    console.error('Error calculating downtime for last week:', error);
    return 0; // Return 0 if there's an error
  } finally {
    client.release();
  }
}


// Function to generate CSV data from report data
function generateCSV(reportData) {
  // Header row for CSV
  let csv = 'store_id,uptime_last_hour(in minutes),uptime_last_day(in hours),update_last_week(in hours),downtime_last_hour(in minutes),downtime_last_day(in hours),downtime_last_week(in hours)\n';

  // Data rows
  for (const data of reportData) {
    csv += `${data.store_id},${data.uptime_last_hour},${data.uptime_last_day},${data.update_last_week},${data.downtime_last_hour},${data.downtime_last_day},${data.downtime_last_week}\n`;
  }

  return csv;
}

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
